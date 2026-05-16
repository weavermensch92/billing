/**
 * Vendor Workspace Policy Lockdown — 정책 강제
 *
 * Q6 + QS1-g 결정:
 *   - 일반 멤버는 키 발급 권한 X (그릿지가 발급 관리)
 *   - 일반 멤버는 카드 변경 권한 X (owner만)
 *   - 토큰 등록 후 즉시 호출하여 정책 강제 적용
 *
 * 어댑터별 정책 적용 인터페이스:
 *   - Anthropic: Workspace member role 변경 (Admin/Member)
 *   - OpenAI: Project member role 변경 (Owner/Member)
 *   - Cursor: 미확인 (TODO)
 *
 * 본 모듈은 인터페이스·라우팅만. 실제 정책 적용은 각 어댑터의 setWorkspacePolicy 메서드 (TODO).
 */

import { getDecryptedToken } from './token-broker'
import { getVendorAdapter } from './index'

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface WorkspacePolicy {
  // 멤버 권한 제한
  restrictKeyIssuanceToAdmin: boolean   // 디폴트 TRUE
  restrictBillingToOwner: boolean        // 디폴트 TRUE (대부분 벤더 기본값과 동일)
  // 추후 확장
  forceVendorSso?: boolean
  requireMfaForAdmin?: boolean
}

export const DEFAULT_POLICY: WorkspacePolicy = {
  restrictKeyIssuanceToAdmin: true,
  restrictBillingToOwner: true,
}

export interface LockdownResult {
  ok: boolean
  vendor: string
  vendorWorkspaceId: string
  appliedFields: string[]
  unsupportedFields: string[]
  errors: string[]
}

/**
 * 단일 워크스페이스에 정책 적용.
 * 어댑터가 setWorkspacePolicy를 지원하지 않으면 unsupportedFields에 기록.
 */
export async function applyWorkspacePolicy(
  supabase: SBLike,
  params: {
    orgId: string
    vendor: string
    vendorWorkspaceId: string
    policy?: WorkspacePolicy
  },
): Promise<LockdownResult> {
  const policy = params.policy ?? DEFAULT_POLICY
  const result: LockdownResult = {
    ok: false,
    vendor: params.vendor,
    vendorWorkspaceId: params.vendorWorkspaceId,
    appliedFields: [],
    unsupportedFields: [],
    errors: [],
  }

  try {
    const decrypted = await getDecryptedToken(supabase, {
      orgId: params.orgId,
      vendor: params.vendor,
      vendorWorkspaceId: params.vendorWorkspaceId,
      usedFor: 'policy_lockdown',
    })
    if (!decrypted) throw new Error('token missing or revoked')

    const adapter = getVendorAdapter(params.vendor)
    if (typeof adapter.setWorkspacePolicy !== 'function') {
      result.unsupportedFields.push('all')
      result.errors.push(`adapter ${params.vendor} does not implement setWorkspacePolicy`)
      return result
    }

    const adapterResult = await adapter.setWorkspacePolicy({
      vendorWorkspaceId: params.vendorWorkspaceId,
      adminToken: decrypted.token,
      policy,
    })

    result.ok = adapterResult.ok
    result.appliedFields = adapterResult.appliedFields ?? []
    result.unsupportedFields = adapterResult.unsupportedFields ?? []
    if (!adapterResult.ok && adapterResult.error) {
      result.errors.push(adapterResult.error)
    }
  } catch (e) {
    result.errors.push(String(e))
  }

  return result
}

/**
 * 토큰 등록 직후 자동 호출되는 hook.
 * lib/vendor-api/token-broker.registerVendorToken 직후 호출 권장.
 */
export async function applyDefaultPolicyOnTokenRegister(
  supabase: SBLike,
  params: { orgId: string; vendor: string; vendorWorkspaceId: string },
): Promise<LockdownResult> {
  return applyWorkspacePolicy(supabase, { ...params, policy: DEFAULT_POLICY })
}
