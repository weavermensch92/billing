'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { submitShadowApproval } from '@/lib/actions/v2-billing'

/**
 * 그림자 멤버 24h 검수 — 13.6 f3.
 *   - approve → accounts.approval_status='active' + (선택) 팀 지정
 *   - reject  → accounts.approval_status='rejected' (사용량 매핑 X)
 */
export async function decideShadowApproval(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, org_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!member) redirect('/login')

  if (member.role !== 'owner' && member.role !== 'admin') {
    redirect(`/org/members?error=${encodeURIComponent('어드민만 결정 가능합니다.')}`)
  }

  const accountId = String(formData.get('account_id') ?? '')
  const decision = String(formData.get('decision') ?? '') as 'approve' | 'reject'
  const teamId = formData.get('team_id') as string | null
  const note = formData.get('note') as string | null

  if (!accountId || (decision !== 'approve' && decision !== 'reject')) {
    redirect(`/org/members?error=${encodeURIComponent('account_id 또는 decision 오류')}`)
  }

  const result = await submitShadowApproval(supabase as never, {
    orgId: member.org_id,
    requesterId: member.id,
    accountId,
    decision,
    teamId: teamId ?? undefined,
    note: note ?? undefined,
  })

  if (!result.ok) {
    redirect(`/org/members/${accountId}/approval?error=${encodeURIComponent(result.error ?? '결정 실패')}`)
  }

  revalidatePath('/org/members')
  redirect(`/org/members?ok=${decision}_${accountId}`)
}
