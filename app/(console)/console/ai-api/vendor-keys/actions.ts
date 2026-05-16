'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClientOrRedirect } from '@/lib/supabase/service-role'
import { actionErrorMessage, isRedirectError } from '@/lib/errors'
import { issueKey, revokeKey, KeyIssuanceBlockedError } from '@/lib/billing/key-issuance/executor'
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
    redirect('/console/ai-api/vendor-keys?error=' + encodeURIComponent(`벤더 키 관리는 Super 전용 (현재 역할: ${me.role})`))
  }
  return { supabase, user, me }
}

/**
 * 콘솔 — Super 가 고객 대신 벤더 키 발급.
 *
 * 흐름:
 *   1) Super 권한 검증
 *   2) account 존재 + active + vendor·workspace_id 추출
 *   3) executor.issueKey() 호출 (Quota 차단 시 KeyIssuanceBlockedError)
 *   4) audit_logs (visibility='both' — 고객도 자기 키 발급 이력 조회 가능)
 *   5) 평문 1회 노출 redirect
 *
 * 주의: Quota 는 Org 정책을 그대로 따름 (Super override 금지 — 보안 / 부정 사용 방지).
 *       Quota 차단 시 명확한 에러 메시지 + 콘솔에서 Org 정책 조정 후 재시도 유도.
 */
export async function issueVendorKeyOnBehalf(formData: FormData) {
  const back = '/console/ai-api/vendor-keys/new'
  const { user, me } = await authorizeSuper()

  const accountId = sanitize(formData.get('account_id') as string, 50)
  const proxyMemberId = sanitize(formData.get('proxy_member_id') as string, 50)
  const label = sanitize(formData.get('label') as string, 100)

  if (!accountId) {
    redirect(`${back}?error=` + encodeURIComponent('계정을 선택해 주세요.'))
  }
  if (!proxyMemberId) {
    redirect(`${back}?error=` + encodeURIComponent('승인자(고객 측 Owner/Admin)를 선택해 주세요.'))
  }

  const service = createServiceRoleClientOrRedirect(back)

  // Account 조회 + Org 정합성
  const { data: account } = await service
    .from('accounts')
    .select('id, org_id, member_id, status, service:services!service_id(name, vendor), provider_workspace_id, provider_user_id')
    .eq('id', accountId)
    .maybeSingle() as unknown as {
      data: {
        id: string
        org_id: string
        member_id: string
        status: string
        service: { name: string; vendor: string } | null
        provider_workspace_id: string | null
        provider_user_id: string | null
      } | null
    }

  if (!account) {
    redirect(`${back}?error=` + encodeURIComponent('계정을 찾을 수 없습니다.'))
  }
  if (account.status !== 'active') {
    redirect(`${back}?error=` + encodeURIComponent(`active 계정에만 키 발급 가능 (현재: ${account.status})`))
  }
  if (!account.service?.vendor) {
    redirect(`${back}?error=` + encodeURIComponent('계정에 연결된 서비스 / 벤더 정보가 없습니다.'))
  }
  if (!account.provider_workspace_id) {
    redirect(`${back}?error=` + encodeURIComponent('계정에 벤더 워크스페이스 ID 가 없습니다 (provider_workspace_id).'))
  }

  // 승인자(Owner/Admin) 검증 — 같은 Org + 권한
  const { data: approver } = await service
    .from('members')
    .select('id, role, org_id')
    .eq('id', proxyMemberId)
    .maybeSingle()
  if (!approver || approver.org_id !== account.org_id) {
    redirect(`${back}?error=` + encodeURIComponent('승인자는 이 Org 의 멤버여야 합니다.'))
  }
  if (!['owner', 'admin'].includes(approver.role)) {
    redirect(`${back}?error=` + encodeURIComponent('승인자는 Owner/Admin 이어야 합니다 (멤버 자가승인 금지).'))
  }

  let result: { keyId: string; providerKeyId: string; keyValueOnce: string; quotaRemaining: number }
  try {
    // executor.ts 의 SBLike 시그니처와 SupabaseClient 의 미세한 타입 차이 회피
    result = await issueKey(service as unknown as Parameters<typeof issueKey>[0], {
      orgId: account.org_id,
      accountId: account.id,
      vendor: account.service.vendor,
      vendorWorkspaceId: account.provider_workspace_id,
      requestedByMemberId: account.member_id,
      approvedByOrgAdminMemberId: approver.id,
      keyLabel: label || undefined,
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    if (err instanceof KeyIssuanceBlockedError) {
      const reason = err.reason === 'cooldown' ? `쿨다운 (재시도 가능: ${err.cooldownUntil ?? '?'})` : `시간당 한도 초과 (남은: ${err.remainingInWindow})`
      redirect(`${back}?error=` + encodeURIComponent(`Quota 차단: ${reason}`))
    }
    console.error('[issueVendorKeyOnBehalf]', err)
    redirect(`${back}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  try {
    await service.from('audit_logs').insert({
      org_id: account.org_id,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'vendor_api_key_issued_on_behalf',
      target_type: 'api_key',
      target_id: result.keyId,
      visibility: 'both',
      detail: {
        vendor: account.service.vendor,
        service_name: account.service.name,
        account_id: account.id,
        provider_key_id: result.providerKeyId,
        approver_member_id: approver.id,
        label: label || null,
      },
    })
  } catch (err) {
    console.error('[audit issueVendorKeyOnBehalf]', err)
    // 감사 실패는 무시 — 키 발급 자체는 성공
  }

  revalidatePath('/console/ai-api/vendor-keys')
  redirect(
    `/console/ai-api/vendor-keys?reveal_id=${result.keyId}&reveal_key=${encodeURIComponent(result.keyValueOnce)}&vendor=${encodeURIComponent(account.service.vendor)}`,
  )
}

/**
 * 콘솔 — Super 가 벤더 키 폐기.
 * executor.revokeKey() 호출 — DB status='revoked' + (PR #5 후속) 벤더 측 deleteApiKey 호출.
 */
export async function revokeVendorKey(formData: FormData) {
  const keyId = sanitize(formData.get('key_id') as string, 50)
  const reason = sanitize(formData.get('reason') as string, 200)
  if (!keyId) {
    redirect('/console/ai-api/vendor-keys?error=' + encodeURIComponent('key_id 누락'))
  }

  const back = '/console/ai-api/vendor-keys'
  const { user, me } = await authorizeSuper()
  const service = createServiceRoleClientOrRedirect(back)

  // Key 조회 (audit 용)
  const { data: target } = await service
    .from('api_keys')
    .select('id, org_id, account_id, provider, provider_key_id, status, label, key_prefix')
    .eq('id', keyId)
    .maybeSingle()
  if (!target) {
    redirect(`${back}?error=` + encodeURIComponent('키를 찾을 수 없습니다.'))
  }
  if (target.status === 'revoked') {
    redirect(`${back}?error=` + encodeURIComponent('이미 폐기된 키입니다.'))
  }

  try {
    const ok = await revokeKey(service as unknown as Parameters<typeof revokeKey>[0], {
      keyId,
      orgId: target.org_id,
      byMemberId: me.id,
      reason: reason || 'console_super_revoke',
    })
    if (!ok) {
      redirect(`${back}?error=` + encodeURIComponent('폐기 실패: status 가 active 가 아니거나 권한 문제'))
    }

    await service.from('audit_logs').insert({
      org_id: target.org_id,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'vendor_api_key_revoked_by_console',
      target_type: 'api_key',
      target_id: keyId,
      visibility: 'both',
      detail: {
        vendor: target.provider,
        provider_key_id: target.provider_key_id,
        key_prefix: target.key_prefix,
        label: target.label,
        reason: reason || null,
      },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[revokeVendorKey]', err)
    redirect(`${back}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  revalidatePath('/console/ai-api/vendor-keys')
  redirect(`${back}?ok=` + encodeURIComponent(`${target.key_prefix ?? target.provider_key_id} 폐기 완료`))
}
