'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { tryConsumeSelfApproval } from '@/lib/billing/self-approval'
import { executeRequestCompletion } from '@/lib/billing/request-executor'

export async function sendMessage(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const request_id = formData.get('request_id') as string
  const org_id = formData.get('org_id') as string
  const member_id = formData.get('member_id') as string
  const body = (formData.get('body') as string).trim()

  if (!body) return

  const { data: memberRow } = await supabase
    .from('members').select('name').eq('id', member_id).single()

  await supabase.from('request_messages').insert({
    request_id,
    org_id,
    message_type: 'text',
    sender_type: 'member',
    sender_id: member_id,
    sender_name: memberRow?.name ?? null,
    body,
  })

  revalidatePath(`/requests/${request_id}`)
}

export async function confirmCustomerAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const request_id = formData.get('request_id') as string

  const { data: member } = await supabase
    .from('members').select('id, org_id, role').eq('user_id', user.id).single()
  if (!member) return

  // 보안: 요청이 본인 것인지 + 같은 조직인지 + awaiting_customer 상태인지 사전 확인
  const { data: req } = await supabase
    .from('action_requests').select('id, org_id, requester_id, status')
    .eq('id', request_id).maybeSingle()
  if (!req || req.org_id !== member.org_id) {
    redirect(`/requests?error=${encodeURIComponent('요청을 찾을 수 없습니다.')}`)
  }
  if (req.status !== 'awaiting_customer') {
    redirect(`/requests/${request_id}?error=${encodeURIComponent('확인 대기 상태의 요청만 처리할 수 있습니다.')}`)
  }
  // Member는 본인 요청만. Owner/Admin은 조직 내 요청 허용 (PRD 5.1 Owner 권한)
  const isPrivileged = member.role === 'owner' || member.role === 'admin'
  if (!isPrivileged && req.requester_id !== member.id) {
    redirect(`/requests?error=${encodeURIComponent('본인이 제출한 요청만 확인할 수 있습니다.')}`)
  }

  const { error } = await supabase
    .from('action_requests')
    .update({ status: 'completed', resolved_at: new Date().toISOString() })
    .eq('id', request_id)
    .eq('org_id', member.org_id)
    .eq('status', 'awaiting_customer')

  if (error) {
    redirect(`/requests/${request_id}?error=${encodeURIComponent('확인 처리 실패: ' + error.message)}`)
  }

  // 시스템 메시지 기록
  await supabase.from('request_messages').insert({
    request_id,
    org_id: member.org_id,
    message_type: 'system_update',
    sender_type: 'system',
    sender_id: null,
    body: '고객 확인 완료 — 요청이 종료되었습니다.',
  })

  revalidatePath(`/requests/${request_id}`)
  revalidatePath('/requests')
}

/**
 * Admin/Owner가 Member가 제출한 pending 요청을 자율 승인 한도 내에서 즉시 승인.
 * - Admin/Owner role 필수
 * - 요청 status='pending' + 같은 조직
 * - estimated_cost_krw 만큼 여유분 차감 (실패 시 요청은 pending 유지)
 * - 성공 시 status='completed', path_type='self', self_approved_by 기록
 */
export async function approveSelfByAdmin(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const request_id = formData.get('request_id') as string

  const { data: member } = await supabase
    .from('members').select('id, org_id, role').eq('user_id', user.id).eq('status', 'active').single()
  if (!member) redirect('/login')

  // 보안: Owner/Admin 만 (서버 재검증)
  if (member.role !== 'owner' && member.role !== 'admin') {
    redirect(`/requests/${request_id}?error=${encodeURIComponent('Owner/Admin 권한이 필요합니다.')}`)
  }

  // 요청 조회 + 검증
  const { data: req } = await supabase
    .from('action_requests')
    .select('id, org_id, status, estimated_cost_krw, action_type, requester_id')
    .eq('id', request_id)
    .maybeSingle()

  if (!req || req.org_id !== member.org_id) {
    redirect(`/requests?error=${encodeURIComponent('요청을 찾을 수 없습니다.')}`)
  }
  if (req.status !== 'pending') {
    redirect(`/requests/${request_id}?error=${encodeURIComponent('대기 상태의 요청만 즉시 승인할 수 있습니다.')}`)
  }

  // 여유분 차감 (원자)
  const consume = await tryConsumeSelfApproval(supabase, member.org_id, req.estimated_cost_krw ?? 0)
  if (!consume.ok) {
    redirect(`/requests/${request_id}?error=${encodeURIComponent(`여유분 부족 (잔여 ₩${consume.remaining_krw.toLocaleString()})`)}`)
  }

  const now = new Date().toISOString()

  // path_type, self_approved_* 먼저 설정 (executor는 status='completed'만 담당)
  await supabase
    .from('action_requests')
    .update({
      path_type: 'self',
      self_approved_by: member.id,
      self_approved_at: now,
    })
    .eq('id', request_id)

  // executor가 실제 DB 반영 + status='completed' 전이
  const execResult = await executeRequestCompletion(supabase, request_id, { resolved_by: member.id })
  if (!execResult.ok) {
    // 롤백: headroom 원상복구 + path_type/self_approved_* 초기화
    const cost = req.estimated_cost_krw ?? 0
    if (cost > 0) {
      const { data: orgRow } = await supabase.from('orgs').select('self_approval_used_krw').eq('id', member.org_id).single()
      const currentUsed = (orgRow as { self_approval_used_krw?: number } | null)?.self_approval_used_krw ?? 0
      await supabase.from('orgs').update({
        self_approval_used_krw: Math.max(0, currentUsed - cost),
      }).eq('id', member.org_id)
    }
    await supabase.from('action_requests').update({
      path_type: null,
      self_approved_by: null,
      self_approved_at: null,
    }).eq('id', request_id)
    redirect(`/requests/${request_id}?error=${encodeURIComponent('즉시 승인 실행 실패: ' + (execResult.error ?? 'unknown'))}`)
  }

  // 시스템 메시지
  await supabase.from('request_messages').insert({
    request_id,
    org_id: member.org_id,
    message_type: 'system_update',
    sender_type: 'system',
    sender_id: null,
    body: `${member.role === 'owner' ? 'Owner' : 'Admin'}이(가) 자율 승인 한도 내에서 즉시 승인했습니다.`,
  })

  // 감사 로그
  await supabase.from('audit_logs').insert({
    org_id: member.org_id,
    actor_type: 'member',
    actor_id: member.id,
    actor_email: user.email ?? null,
    action: 'request_self_approved',
    target_type: 'action_request',
    target_id: request_id,
    visibility: 'both',
    detail: {
      action_type: req.action_type,
      estimated_cost_krw: req.estimated_cost_krw ?? 0,
      remaining_krw: consume.remaining_krw,
      path: 'post_submit',
    },
  })

  revalidatePath(`/requests/${request_id}`)
  revalidatePath('/requests')
  redirect(`/requests/${request_id}?self_approved=1`)
}
