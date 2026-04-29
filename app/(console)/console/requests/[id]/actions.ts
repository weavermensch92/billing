'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { executeRequestCompletion } from '@/lib/billing/request-executor'

async function getAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')
  const { data: adminUser } = await supabase
    .from('admin_users').select('id, name, role').eq('email', user.email ?? '').eq('is_active', true).single()
  if (!adminUser) redirect('/console/login')
  return { supabase, adminUser }
}

export async function decidePath(formData: FormData) {
  const { supabase, adminUser } = await getAdmin()
  const request_id = formData.get('request_id') as string
  const path_type = formData.get('path_type') as 'fast' | 'full'

  await supabase.from('action_requests').update({
    path_type,
    assigned_to: adminUser.id,
    status: 'in_review',
  }).eq('id', request_id)

  await supabase.from('request_events').insert({
    request_id,
    org_id: (formData.get('org_id') as string),
    event_type: 'path_decided',
    actor_type: 'admin',
    actor_id: adminUser.id,
    event_data: { path_type },
  })

  revalidatePath(`/console/requests/${request_id}`)
}

export async function updateRequestStatus(formData: FormData) {
  const { supabase, adminUser } = await getAdmin()
  const request_id = formData.get('request_id') as string
  const next_status = formData.get('next_status') as string

  // 대상 요청 로드 (action_type 분기용)
  const { data: req } = await supabase
    .from('action_requests')
    .select('id, org_id, action_type, parent_id, request_data, headroom_shortfall_krw, reserved_headroom_krw')
    .eq('id', request_id)
    .single()
  if (!req) {
    redirect(`/console/requests/${request_id}?error=${encodeURIComponent('요청을 찾을 수 없음')}`)
  }

  // headroom_increase 전용 분기 (Super 증액 승인/거부)
  if (req.action_type === 'headroom_increase') {
    if (adminUser.role !== 'super') {
      redirect(`/console/requests/${request_id}?error=${encodeURIComponent('Super 권한이 필요합니다.')}`)
    }
    await handleHeadroomIncreaseDecision(supabase, adminUser.id, req, next_status)
    revalidatePath(`/console/requests/${request_id}`)
    revalidatePath('/console/requests')
    return
  }

  // 'completed' 전이는 실제 DB 반영 executor를 호출
  if (next_status === 'completed') {
    const result = await executeRequestCompletion(supabase, request_id, { resolved_by: adminUser.id })
    if (!result.ok) {
      redirect(`/console/requests/${request_id}?error=${encodeURIComponent('실행 실패: ' + (result.error ?? 'unknown'))}`)
    }
    revalidatePath(`/console/requests/${request_id}`)
    revalidatePath('/console/requests')
    return
  }

  // 기타 상태 전이는 단순 업데이트
  const updates: Record<string, unknown> = { status: next_status }
  if (['rejected', 'cancelled', 'approved'].includes(next_status)) {
    updates.resolved_at = new Date().toISOString()
    updates.resolved_by = adminUser.id
  }
  await supabase.from('action_requests').update(updates).eq('id', request_id)
  revalidatePath(`/console/requests/${request_id}`)
  revalidatePath('/console/requests')
}

/**
 * Super 증액 승인/거부 처리:
 *   approved → orgs 의 headroom/used 동시 증액 + 부모 요청 executor 자동 실행
 *   rejected → 부모의 reserved 선 소진 롤백 + 부모 status='rejected'
 */
async function handleHeadroomIncreaseDecision(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminId: string,
  req: {
    id: string
    org_id: string
    parent_id: string | null
    request_data: Record<string, unknown>
  },
  next_status: string,
) {
  const parent_id = req.parent_id
  if (!parent_id) {
    redirect(`/console/requests/${req.id}?error=${encodeURIComponent('parent_id 없음')}`)
  }

  const shortfall = Number(req.request_data?.amount_krw ?? 0)
  const { data: parent } = await supabase
    .from('action_requests')
    .select('id, reserved_headroom_krw, estimated_cost_krw, self_approved_by')
    .eq('id', parent_id)
    .single()
  if (!parent) {
    redirect(`/console/requests/${req.id}?error=${encodeURIComponent('부모 요청 조회 실패')}`)
  }

  const reservedKrw = Number(parent.reserved_headroom_krw ?? 0)

  if (next_status === 'approved' || next_status === 'completed') {
    // 1. headroom += shortfall, used += shortfall (부모 비용 전액 커버)
    const { data: okRpc } = await supabase.rpc('approve_headroom_increase', {
      p_org_id: req.org_id,
      p_shortfall_krw: shortfall,
    })
    // Mock/RPC 미지원 대비: 직접 UPDATE fallback
    if (okRpc === undefined || okRpc === null) {
      const { data: orgRow } = await supabase
        .from('orgs')
        .select('self_approval_headroom_krw, self_approval_used_krw')
        .eq('id', req.org_id)
        .single()
      const curHead = (orgRow as { self_approval_headroom_krw?: number } | null)?.self_approval_headroom_krw ?? 0
      const curUsed = (orgRow as { self_approval_used_krw?: number } | null)?.self_approval_used_krw ?? 0
      await supabase.from('orgs').update({
        self_approval_headroom_krw: curHead + shortfall,
        self_approval_used_krw: curUsed + shortfall,
      }).eq('id', req.org_id)
    }

    // 2. 자식(headroom_increase) completed
    await supabase.from('action_requests').update({
      status: 'completed',
      resolved_at: new Date().toISOString(),
      resolved_by: adminId,
    }).eq('id', req.id)

    // 3. 부모를 pending 으로 복귀 (executor 가 completed 로 전이)
    await supabase.from('action_requests').update({
      status: 'pending',
    }).eq('id', parent_id)

    // 4. 부모 executor 실행
    const execResult = await executeRequestCompletion(supabase, parent_id, { resolved_by: adminId })
    if (!execResult.ok) {
      // 실행 실패 시 부모만 롤백 표시 (headroom 은 이미 증액 — Super 재검토)
      await supabase.from('action_requests').update({ status: 'rejected' }).eq('id', parent_id)
      redirect(`/console/requests/${req.id}?error=${encodeURIComponent('부모 실행 실패: ' + (execResult.error ?? 'unknown'))}`)
    }

    // 감사 로그
    await supabase.from('audit_logs').insert({
      org_id: req.org_id,
      actor_type: 'admin',
      actor_id: adminId,
      action: 'headroom_increase_approved',
      target_type: 'action_request',
      target_id: parent_id,
      visibility: 'both',
      detail: { shortfall_krw: shortfall, child_request_id: req.id },
    })
    return
  }

  if (next_status === 'rejected') {
    // 1. reserved 선 소진 롤백
    if (reservedKrw > 0) {
      const { data: okRpc } = await supabase.rpc('rollback_reserved_headroom', {
        p_org_id: req.org_id,
        p_reserved_krw: reservedKrw,
      })
      if (okRpc === undefined || okRpc === null) {
        const { data: orgRow } = await supabase
          .from('orgs').select('self_approval_used_krw').eq('id', req.org_id).single()
        const curUsed = (orgRow as { self_approval_used_krw?: number } | null)?.self_approval_used_krw ?? 0
        await supabase.from('orgs').update({
          self_approval_used_krw: Math.max(0, curUsed - reservedKrw),
        }).eq('id', req.org_id)
      }
    }

    // 2. 자식(headroom_increase) rejected
    await supabase.from('action_requests').update({
      status: 'rejected',
      resolved_at: new Date().toISOString(),
      resolved_by: adminId,
    }).eq('id', req.id)

    // 3. 부모도 rejected
    await supabase.from('action_requests').update({
      status: 'rejected',
      resolved_at: new Date().toISOString(),
      resolved_by: adminId,
    }).eq('id', parent_id)

    // 감사 로그
    await supabase.from('audit_logs').insert({
      org_id: req.org_id,
      actor_type: 'admin',
      actor_id: adminId,
      action: 'headroom_increase_rejected',
      target_type: 'action_request',
      target_id: parent_id,
      visibility: 'both',
      detail: { shortfall_krw: shortfall, reserved_rollback_krw: reservedKrw, child_request_id: req.id },
    })
    return
  }

  // 기타 상태 전이 (in_review 등) — 단순 업데이트
  await supabase.from('action_requests').update({ status: next_status }).eq('id', req.id)
}

export async function updateProgressState(formData: FormData) {
  const { supabase } = await getAdmin()
  const request_id = formData.get('request_id') as string
  const key = formData.get('key') as string
  const value = formData.get('value') === 'true'
  // 선택적 부가 필드 (card_last4 등)
  const extra_key = formData.get('extra_key') as string | null
  const extra_value = formData.get('extra_value') as string | null

  const { data: current } = await supabase
    .from('action_requests').select('progress_state').eq('id', request_id).single()

  const progress_state: Record<string, unknown> = {
    ...(current?.progress_state as Record<string, unknown> ?? {}),
    [key]: value,
  }
  if (extra_key && extra_value !== null) {
    progress_state[extra_key] = extra_value
  }

  await supabase.from('action_requests')
    .update({ progress_state }).eq('id', request_id)

  revalidatePath(`/console/requests/${request_id}`)
}

// card_last4 단독 저장 (체크박스와 분리)
export async function setVcnLast4(formData: FormData) {
  const { supabase } = await getAdmin()
  const request_id = formData.get('request_id') as string
  const last4 = (formData.get('vcn_last4') as string).replace(/\D/g, '').slice(0, 4)

  if (last4.length !== 4) {
    redirect(`/console/requests/${request_id}?error=${encodeURIComponent('4자리 숫자를 입력하세요.')}`)
  }

  const { data: current } = await supabase
    .from('action_requests').select('progress_state').eq('id', request_id).single()

  const progress_state = {
    ...(current?.progress_state as Record<string, unknown> ?? {}),
    vcn_last4: last4,
  }

  await supabase.from('action_requests')
    .update({ progress_state }).eq('id', request_id)

  revalidatePath(`/console/requests/${request_id}`)
}

export async function sendAdminMessage(formData: FormData) {
  const { supabase, adminUser } = await getAdmin()
  const request_id = formData.get('request_id') as string
  const org_id = formData.get('org_id') as string
  const body = (formData.get('body') as string).trim()
  if (!body) return

  await supabase.from('request_messages').insert({
    request_id,
    org_id,
    message_type: 'text',
    sender_type: 'admin',
    sender_id: adminUser.id,
    sender_name: adminUser.name,
    body,
  })

  revalidatePath(`/console/requests/${request_id}`)
}
