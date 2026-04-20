'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

interface Decision {
  action: 'terminate' | 'transfer' | 'keep'
  transfer_to?: string
}

export async function submitOffboarding(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentMember } = await supabase
    .from('members').select('id, org_id, role').eq('user_id', user.id).eq('status', 'active').single()
  if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
    redirect('/org/members?error=권한이 없습니다.')
  }

  const target_member_id = formData.get('target_member_id') as string
  const decisions: Record<string, Decision> = JSON.parse(formData.get('decisions') as string)
  const confirm_password = formData.get('confirm_password') as string

  // 본인 비밀번호 재확인
  if (!user.email || !confirm_password) {
    redirect(`/org/members/${target_member_id}/offboarding?error=비밀번호를 입력하세요.`)
  }
  const { error: pwErr } = await supabase.auth.signInWithPassword({
    email: user.email, password: confirm_password,
  })
  if (pwErr) {
    redirect(`/org/members/${target_member_id}/offboarding?error=비밀번호가 일치하지 않습니다.`)
  }

  // 대상 멤버 검증
  const { data: target } = await supabase
    .from('members').select('id, name, role, status').eq('id', target_member_id)
    .eq('org_id', currentMember.org_id).single()
  if (!target) redirect('/org/members?error=대상 멤버를 찾을 수 없습니다.')
  if (target.role === 'owner') {
    redirect(`/org/members/${target_member_id}/offboarding?error=Owner는 오프보딩할 수 없습니다.`)
  }

  // 영향 집계
  const accountsAffected = Object.keys(decisions).length
  const counts = { terminate: 0, transfer: 0, keep: 0 }
  for (const d of Object.values(decisions)) counts[d.action]++

  // 예상 절감 (해지 건의 월 한도 합계)
  let savings = 0
  if (counts.terminate > 0) {
    const terminateIds = Object.entries(decisions).filter(([, d]) => d.action === 'terminate').map(([id]) => id)
    const { data: toTerminate } = await supabase
      .from('accounts').select('monthly_limit_krw').in('id', terminateIds)
    savings = ((toTerminate ?? []) as { monthly_limit_krw: number }[])
      .reduce((sum: number, a) => sum + a.monthly_limit_krw, 0)
  }

  // 1) 부모 action_request 생성 (bulk_terminate)
  const sla = new Date(Date.now() + 72 * 3600 * 1000).toISOString()
  const { data: parentReq, error: parentErr } = await supabase.from('action_requests').insert({
    org_id: currentMember.org_id,
    requester_id: currentMember.id,
    action_type: 'bulk_terminate',
    status: 'pending',
    member_id: target_member_id,
    request_data: { target_member_id, accounts_affected: accountsAffected, counts, savings },
    sla_deadline: sla,
  }).select('id').single()

  if (parentErr || !parentReq) {
    redirect(`/org/members/${target_member_id}/offboarding?error=${encodeURIComponent('부모 요청 생성 실패: ' + (parentErr?.message ?? ''))}`)
  }

  // 2) 자식 요청 (계정별)
  const childRequests = Object.entries(decisions).map(([accountId, d]) => ({
    org_id: currentMember.org_id,
    requester_id: currentMember.id,
    action_type: d.action === 'terminate' ? 'terminate' as const : d.action === 'transfer' ? 'new_account' as const : 'limit_change' as const,
    status: 'pending' as const,
    account_id: accountId,
    member_id: target_member_id,
    parent_id: parentReq.id,
    request_data: d.action === 'transfer' ? { transfer_to: d.transfer_to } : d,
    sla_deadline: sla,
  }))

  if (childRequests.length > 0) {
    const { error: childErr } = await supabase.from('action_requests').insert(childRequests)
    if (childErr) {
      redirect(`/org/members/${target_member_id}/offboarding?error=${encodeURIComponent('자식 요청 생성 실패: ' + childErr.message)}`)
    }
  }

  // 3) offboarding_events 기록
  await supabase.from('offboarding_events').insert({
    org_id: currentMember.org_id,
    target_member_id,
    parent_request_id: parentReq.id,
    accounts_affected: accountsAffected,
    expected_savings_krw: savings,
    actions_summary: counts,
    status: 'in_progress',
    initiated_by: currentMember.id,
  })

  // 4) 대상 멤버 suspended (완전 오프보딩은 AM이 승인 후)
  await supabase.from('members').update({ status: 'suspended' }).eq('id', target_member_id)

  revalidatePath('/org/members')
  revalidatePath('/requests')
  redirect(`/requests/${parentReq.id}?created=1`)
}
