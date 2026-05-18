'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { submitKeyIssuance, submitKeyRevoke } from '@/lib/actions/v2-billing'

export async function issueApiKey(formData: FormData) {
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

  const accountId = String(formData.get('account_id') ?? '')
  const vendor = String(formData.get('vendor') ?? '')
  const vendorWorkspaceId = String(formData.get('vendor_workspace_id') ?? '')
  const keyLabel = formData.get('key_label') as string | null
  const approvedByOrgAdmin = String(formData.get('approved_by_org_admin') ?? member.id)
  const teamIdRaw = String(formData.get('team_id') ?? '')
  const teamId = teamIdRaw === '' ? null : teamIdRaw

  if (!accountId || !vendor || !vendorWorkspaceId) {
    redirect(`/billing/api-keys?error=${encodeURIComponent('필수 입력 누락')}`)
  }

  // 어드민만 승인자가 될 수 있음 (Q6)
  if (member.role !== 'owner' && member.role !== 'admin' && approvedByOrgAdmin === member.id) {
    redirect(`/billing/api-keys?error=${encodeURIComponent('일반 멤버는 자가 승인 불가. 어드민 승인 필요.')}`)
  }

  // team_id 가 지정됐으면 해당 팀이 본인 org 소속인지 검증
  if (teamId) {
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('id', teamId)
      .eq('org_id', member.org_id)
      .maybeSingle()
    if (!team) {
      redirect(`/billing/api-keys?error=${encodeURIComponent('유효하지 않은 팀입니다.')}`)
    }
  }

  const result = await submitKeyIssuance(supabase as never, {
    orgId: member.org_id,
    requesterId: member.id,
    accountId,
    vendor,
    vendorWorkspaceId,
    approvedByOrgAdmin,
    keyLabel: keyLabel ?? undefined,
    teamId,
  })

  if (!result.ok) {
    // KeyIssuanceBlockedError 검출 — detail.reason / cooldownUntil 사용 가능
    const reason = result.detail?.reason as string | undefined
    const cooldownUntil = result.detail?.cooldownUntil as string | undefined
    const msg = reason === 'cooldown'
      ? `키 발급이 ${cooldownUntil} 까지 일시 차단되었습니다.`
      : (result.error ?? '발급 실패')
    redirect(`/billing/api-keys?error=${encodeURIComponent(msg)}`)
  }

  // keyValueOnce는 1회만 노출. 직후 페이지에서 표시 후 폐기.
  const keyValueOnce = result.detail?.keyValueOnce as string | undefined
  if (keyValueOnce) {
    // 한 번만 보여줘야 하므로 URL이 아닌 server-only state 필요.
    // Phase 1 단순화: query string에 잠시 표시 (보안 약함, MVP 한정).
    redirect(`/billing/api-keys?reveal=${encodeURIComponent(keyValueOnce)}&keyId=${result.detail?.keyId}`)
  }

  revalidatePath('/billing/api-keys')
  redirect(`/billing/api-keys?ok=${result.requestId}`)
}

export async function revokeApiKey(formData: FormData) {
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

  const keyId = String(formData.get('key_id') ?? '')
  const reason = formData.get('reason') as string | null

  if (!keyId) {
    redirect(`/billing/api-keys?error=${encodeURIComponent('key_id 필수')}`)
  }

  const result = await submitKeyRevoke(supabase as never, {
    orgId: member.org_id,
    requesterId: member.id,
    keyId,
    reason: reason ?? undefined,
  })

  if (!result.ok) {
    redirect(`/billing/api-keys?error=${encodeURIComponent(result.error ?? '삭제 실패')}`)
  }

  revalidatePath('/billing/api-keys')
  redirect(`/billing/api-keys?revoked=${keyId}`)
}
