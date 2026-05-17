'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClientOrRedirect } from '@/lib/supabase/service-role'
import { registerVendorToken, revokeVendorToken } from '@/lib/vendor-api/token-broker'
import { GRIDGE_SELF_ORG_ID } from '@/lib/billing/gateway/constants'
import { actionErrorMessage, isRedirectError } from '@/lib/errors'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function sanitize(s: string | null | undefined, max: number): string {
  return (s ?? '').toString().trim().slice(0, max)
}

async function authorizeSuper() {
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
    redirect('/console/ai-api/gateway-tokens?error=' + encodeURIComponent(`Gateway 토큰 관리는 Super 전용 (현재: ${me.role})`))
  }
  return { supabase, user, me }
}

/**
 * Gateway upstream admin token 등록.
 *
 * 흐름:
 *   1) Super 검증
 *   2) 입력 검증 (vendor / vendor_workspace_id / label / token)
 *   3) registerVendorToken — AES-256-GCM 암호화 후 INSERT.
 *      기존 active 토큰이 있으면 자동 회전 (rotate_vendor_token RPC).
 *   4) audit_logs 기록 (token_prefix 만, 평문 X)
 *
 * 등록 대상 org = GRIDGE_SELF_ORG_ID (그릿지 내부 운영 org).
 */
export async function registerGatewayToken(formData: FormData) {
  const back = '/console/ai-api/gateway-tokens'
  const vendor = sanitize(formData.get('vendor') as string, 50)
  const vendorWorkspaceId = sanitize(formData.get('vendor_workspace_id') as string, 200)
  const tokenLabel = sanitize(formData.get('token_label') as string, 100)
  const plaintextToken = sanitize(formData.get('plaintext_token') as string, 4000)

  if (!vendor) {
    redirect(`${back}?error=` + encodeURIComponent('vendor 필수'))
  }
  if (!vendorWorkspaceId) {
    redirect(`${back}?error=` + encodeURIComponent('vendor_workspace_id 필수'))
  }
  if (!tokenLabel) {
    redirect(`${back}?error=` + encodeURIComponent('token_label 필수'))
  }
  if (!plaintextToken || plaintextToken.length < 10) {
    redirect(`${back}?error=` + encodeURIComponent('token 평문이 너무 짧습니다 (10자 이상)'))
  }

  const { user, me } = await authorizeSuper()
  const service = createServiceRoleClientOrRedirect(back)

  try {
    const { tokenId, tokenPrefix } = await registerVendorToken(service, {
      orgId: GRIDGE_SELF_ORG_ID,
      vendor,
      vendorWorkspaceId,
      tokenLabel,
      plaintextToken,
      registeredBySuperAdminId: me.id,
    })

    await service.from('audit_logs').insert({
      org_id: GRIDGE_SELF_ORG_ID,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'gateway_token_registered',
      target_type: 'vendor_admin_token',
      target_id: tokenId,
      visibility: 'internal_only',
      detail: {
        vendor,
        vendor_workspace_id: vendorWorkspaceId,
        token_label: tokenLabel,
        token_prefix: tokenPrefix,
      },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[registerGatewayToken]', err)
    redirect(`${back}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  revalidatePath(back)
  redirect(`${back}?ok=` + encodeURIComponent(`토큰 등록 완료: ${vendor} / ${vendorWorkspaceId}`))
}

/**
 * Gateway upstream admin token 폐기 (수동).
 *
 * status='active' → 'revoked', revoked_at + revoked_by + revoked_reason 기록.
 * 자동 회전이 필요한 경우 등록 폼 재제출 (registerVendorToken 이 회전 처리).
 */
export async function revokeGatewayToken(formData: FormData) {
  const back = '/console/ai-api/gateway-tokens'
  const tokenId = sanitize(formData.get('token_id') as string, 50)
  const reason = sanitize(formData.get('reason') as string, 200)

  if (!tokenId) {
    redirect(`${back}?error=` + encodeURIComponent('token_id 누락'))
  }
  if (!reason) {
    redirect(`${back}?error=` + encodeURIComponent('폐기 사유 필수'))
  }

  const { user, me } = await authorizeSuper()
  const service = createServiceRoleClientOrRedirect(back)

  try {
    const ok = await revokeVendorToken(service, tokenId, me.id, reason)
    if (!ok) {
      redirect(`${back}?error=` + encodeURIComponent('폐기 실패 (이미 폐기됐거나 active 가 아님)'))
    }

    await service.from('audit_logs').insert({
      org_id: GRIDGE_SELF_ORG_ID,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'gateway_token_revoked',
      target_type: 'vendor_admin_token',
      target_id: tokenId,
      visibility: 'internal_only',
      detail: { reason },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[revokeGatewayToken]', err)
    redirect(`${back}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  revalidatePath(back)
  redirect(`${back}?ok=` + encodeURIComponent('토큰을 폐기했습니다.'))
}
