'use server'

/**
 * 고객 org 의 vendor_admin_tokens 등록·폐기 액션 (Super 전용).
 *
 * gateway-tokens/actions.ts 와 거의 동일하지만 org_id 가 폼에서 동적으로 들어옴
 * (gridge_self 하드코딩이 아님). 진입점이 둘 (조직 상세 / AI API 허브) 이라
 * back_href 도 폼 hidden 으로 받는다.
 */

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClientOrRedirect } from '@/lib/supabase/service-role'
import { registerVendorToken, revokeVendorToken } from '@/lib/vendor-api/token-broker'
import { actionErrorMessage, isRedirectError } from '@/lib/errors'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function sanitize(s: string | null | undefined, max: number): string {
  return (s ?? '').toString().trim().slice(0, max)
}

/** 후행 경로 화이트리스트 — open redirect 방지 */
function safeBackHref(raw: string, orgId: string): string {
  const allowed = [
    `/console/orgs/${orgId}/vendor-tokens`,
    `/console/ai-api/vendor-tokens?org=${orgId}`,
    `/console/ai-api/vendor-tokens`,
  ]
  return allowed.includes(raw) ? raw : `/console/ai-api/vendor-tokens?org=${orgId}`
}

async function authorizeSuper(back: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: me } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!me) redirect('/console/login')
  if (me.role !== 'super') {
    redirect(`${back}?error=` + encodeURIComponent(`고객사 벤더 토큰 관리는 Super 전용 (현재: ${me.role})`))
  }
  return { supabase, user, me }
}

export async function registerCustomerVendorToken(formData: FormData) {
  const orgId = sanitize(formData.get('org_id') as string, 50)
  const back = safeBackHref(sanitize(formData.get('back_href') as string, 200), orgId)
  const vendor = sanitize(formData.get('vendor') as string, 50)
  const vendorWorkspaceId = sanitize(formData.get('vendor_workspace_id') as string, 200)
  const tokenLabel = sanitize(formData.get('token_label') as string, 100)
  const plaintextToken = sanitize(formData.get('plaintext_token') as string, 4000)

  if (!orgId) redirect(`/console/ai-api/vendor-tokens?error=` + encodeURIComponent('org_id 누락'))
  if (!vendor) redirect(`${back}?error=` + encodeURIComponent('vendor 필수'))
  if (!vendorWorkspaceId) redirect(`${back}?error=` + encodeURIComponent('vendor_workspace_id 필수'))
  if (!tokenLabel) redirect(`${back}?error=` + encodeURIComponent('token_label 필수'))
  if (!plaintextToken || plaintextToken.length < 10) {
    redirect(`${back}?error=` + encodeURIComponent('token 평문이 너무 짧습니다 (10자 이상)'))
  }

  const { user, me } = await authorizeSuper(back)
  const service = createServiceRoleClientOrRedirect(back)

  // org 가 실제로 존재하는지 확인
  const { data: org } = await service.from('orgs').select('id, name').eq('id', orgId).maybeSingle()
  if (!org) redirect(`${back}?error=` + encodeURIComponent('org 를 찾을 수 없습니다.'))

  try {
    const { tokenId, tokenPrefix } = await registerVendorToken(service, {
      orgId,
      vendor,
      vendorWorkspaceId,
      tokenLabel,
      plaintextToken,
      registeredBySuperAdminId: me.id,
    })

    await service.from('audit_logs').insert({
      org_id: orgId,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'customer_vendor_token_registered',
      target_type: 'vendor_admin_token',
      target_id: tokenId,
      visibility: 'both',
      detail: {
        vendor,
        vendor_workspace_id: vendorWorkspaceId,
        token_label: tokenLabel,
        token_prefix: tokenPrefix,
      },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[registerCustomerVendorToken]', err)
    redirect(`${back}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  revalidatePath(back)
  redirect(`${back}?ok=` + encodeURIComponent(`토큰 등록 완료: ${vendor} / ${vendorWorkspaceId}`))
}

export async function revokeCustomerVendorToken(formData: FormData) {
  const orgId = sanitize(formData.get('org_id') as string, 50)
  const back = safeBackHref(sanitize(formData.get('back_href') as string, 200), orgId)
  const tokenId = sanitize(formData.get('token_id') as string, 50)
  const reason = sanitize(formData.get('reason') as string, 200)

  if (!orgId) redirect(`/console/ai-api/vendor-tokens?error=` + encodeURIComponent('org_id 누락'))
  if (!tokenId) redirect(`${back}?error=` + encodeURIComponent('token_id 누락'))
  if (!reason) redirect(`${back}?error=` + encodeURIComponent('폐기 사유 필수'))

  const { user, me } = await authorizeSuper(back)
  const service = createServiceRoleClientOrRedirect(back)

  try {
    const ok = await revokeVendorToken(service, tokenId, me.id, reason)
    if (!ok) redirect(`${back}?error=` + encodeURIComponent('폐기 실패 (이미 폐기됐거나 active 가 아님)'))

    await service.from('audit_logs').insert({
      org_id: orgId,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'customer_vendor_token_revoked',
      target_type: 'vendor_admin_token',
      target_id: tokenId,
      visibility: 'both',
      detail: { reason },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[revokeCustomerVendorToken]', err)
    redirect(`${back}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  revalidatePath(back)
  redirect(`${back}?ok=` + encodeURIComponent('토큰을 폐기했습니다.'))
}
