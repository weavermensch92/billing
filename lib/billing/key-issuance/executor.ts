/**
 * Key Issuance Executor — Quota 확인 → 벤더 API 호출 → DB 기록
 *
 * 흐름:
 *   1) consumeQuota (원자) — 차단 시 blocked 이벤트 기록 후 throw
 *   2) vendor adapter의 createApiKey 호출 (벤더 워크스페이스에 신규 키 생성)
 *   3) 성공 시 그릿지 api_keys + key_issuance_events 'issued' INSERT
 *   4) 실패 시 quota 환원 안 함 (차단 자체 비용은 정책상 OK)
 *
 * 같은 페이지 즉시 재발행 (Q5 A) = 호출자가 같은 흐름 1회 더 호출.
 * Quota는 윈도우 내 카운트만 증가하므로 자연스럽게 임계 적용.
 *
 * 참조:
 *   - key_issuance_events (M-1007)
 *   - api_keys (P1) — Org·account·key_value·provider_key_id
 *   - vendor adapter createApiKey (TODO — adapter 인터페이스 확장)
 */

import { consumeQuota } from './quota'
import { getVendorAdapter, type VendorName } from '../../vendor-api/index'
import { getDecryptedToken } from '../../vendor-api/token-broker'

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface IssueKeyInput {
  orgId: string
  accountId: string                // 그릿지 account.id
  vendor: string
  vendorWorkspaceId: string
  requestedByMemberId: string      // 신청한 멤버
  approvedByOrgAdminMemberId: string  // 고객 어드민 (Q6 그릿지 미개입)
  keyLabel?: string
}

export interface IssueKeyResult {
  keyId: string
  providerKeyId: string
  keyValueOnce: string             // 1회만 노출되는 평문 (생성 직후만)
  quotaRemaining: number
}

export class KeyIssuanceBlockedError extends Error {
  constructor(
    public reason: 'cooldown' | 'hourly_limit',
    public cooldownUntil: string | null,
    public remainingInWindow: number,
  ) {
    super(`key issuance blocked: ${reason}`)
    this.name = 'KeyIssuanceBlockedError'
  }
}

/**
 * 키 발급 메인.
 * Quota 차단 시 KeyIssuanceBlockedError throw + blocked 이벤트 INSERT.
 * 벤더 API 호출 실패는 일반 Error throw.
 */
export async function issueKey(supabase: SBLike, input: IssueKeyInput): Promise<IssueKeyResult> {
  // 1) Quota 확인·차감
  const q = await consumeQuota(supabase, input.orgId)

  if (!q.allowed) {
    await recordEvent(supabase, {
      orgId: input.orgId,
      accountId: input.accountId,
      memberId: input.requestedByMemberId,
      eventType: 'blocked',
      vendor: input.vendor,
      blockedByQuota: true,
      blockReason: q.blockReason,
      approvedByOrgAdminId: input.approvedByOrgAdminMemberId,
    })
    throw new KeyIssuanceBlockedError(q.blockReason ?? 'hourly_limit', q.cooldownUntil, q.remainingInWindow)
  }

  // 2) 벤더 API 호출
  let providerKeyId = ''
  let keyValueOnce = ''
  try {
    const decrypted = await getDecryptedToken(supabase, {
      orgId: input.orgId,
      vendor: input.vendor,
      vendorWorkspaceId: input.vendorWorkspaceId,
      usedFor: 'key_issuance',
    })
    if (!decrypted) throw new Error('vendor admin token missing')

    const adapter = getVendorAdapter(input.vendor as VendorName)
    if (!adapter || typeof adapter.createApiKey !== 'function') {
      throw new Error(`adapter ${input.vendor} does not implement createApiKey`)
    }

    const result = await adapter.createApiKey({
      vendorWorkspaceId: input.vendorWorkspaceId,
      adminToken: decrypted.token,
      accountId: input.accountId,
      label: input.keyLabel ?? null,
    })

    if (!result.ok) throw new Error(`vendor createApiKey failed: ${result.error}`)
    providerKeyId = result.providerKeyId
    keyValueOnce = result.keyValueOnce
  } catch (e) {
    await recordEvent(supabase, {
      orgId: input.orgId,
      accountId: input.accountId,
      memberId: input.requestedByMemberId,
      eventType: 'blocked', // 벤더 측 실패도 blocked로 기록 (별도 enum 없음)
      vendor: input.vendor,
      blockedByQuota: false,
      blockReason: 'vendor_api_failure',
      approvedByOrgAdminId: input.approvedByOrgAdminMemberId,
      detail: { error: String(e) },
    })
    throw e
  }

  // 3) 그릿지 api_keys INSERT
  const { data: keyRow, error: insErr } = (await supabase
    .from('api_keys')
    .insert({
      org_id: input.orgId,
      account_id: input.accountId,
      provider: input.vendor,
      provider_key_id: providerKeyId,
      key_value: keyValueOnce, // 보통 hash 저장 권장. 단순화 위해 평문 단일 컬럼 가정.
      label: input.keyLabel ?? null,
      status: 'active',
      issued_by: input.requestedByMemberId,
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown }

  if (insErr || !keyRow) {
    throw new Error(`api_keys insert failed: ${JSON.stringify(insErr)}`)
  }

  // 4) 이벤트 기록
  await recordEvent(supabase, {
    orgId: input.orgId,
    accountId: input.accountId,
    memberId: input.requestedByMemberId,
    eventType: 'issued',
    vendor: input.vendor,
    vendorKeyId: providerKeyId,
    approvedByOrgAdminId: input.approvedByOrgAdminMemberId,
  })

  return {
    keyId: keyRow.id,
    providerKeyId,
    keyValueOnce,
    quotaRemaining: q.remainingInWindow,
  }
}

/** 키 삭제 (즉시 재발행 호출은 별도 issueKey 호출) */
export async function revokeKey(
  supabase: SBLike,
  params: { keyId: string; orgId: string; byMemberId: string; reason?: string },
): Promise<boolean> {
  // 1) DB status 변경
  const { data: keyRow } = (await supabase
    .from('api_keys')
    .select('id, account_id, provider, provider_key_id, status')
    .eq('id', params.keyId)
    .eq('org_id', params.orgId)
    .maybeSingle()) as { data: { id: string; account_id: string; provider: string; provider_key_id: string; status: string } | null }

  if (!keyRow || keyRow.status !== 'active') return false

  // (벤더 측 키 삭제는 별도 adapter.deleteApiKey — TODO. 여기선 DB만.)

  const { error } = await supabase
    .from('api_keys')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', params.keyId)
  if (error) return false

  // 이벤트
  await recordEvent(supabase, {
    orgId: params.orgId,
    accountId: keyRow.account_id,
    memberId: params.byMemberId,
    eventType: 'revoked',
    vendor: keyRow.provider,
    vendorKeyId: keyRow.provider_key_id,
    blockedByQuota: false,
    detail: { reason: params.reason ?? null },
  })

  return true
}

// ─── 이벤트 기록 헬퍼 ─────────────────────────────────────

async function recordEvent(
  supabase: SBLike,
  ev: {
    orgId: string
    accountId: string | null
    memberId: string | null
    eventType: 'issued' | 'reissued' | 'revoked' | 'blocked'
    vendor: string
    vendorKeyId?: string
    approvedByOrgAdminId?: string
    blockedByQuota?: boolean
    blockReason?: string | null
    detail?: Record<string, unknown>
  },
): Promise<void> {
  await supabase.from('key_issuance_events').insert({
    org_id: ev.orgId,
    account_id: ev.accountId,
    member_id: ev.memberId,
    event_type: ev.eventType,
    vendor: ev.vendor,
    vendor_key_id: ev.vendorKeyId ?? null,
    approved_by_org_admin_id: ev.approvedByOrgAdminId ?? null,
    approved_at: ev.approvedByOrgAdminId ? new Date().toISOString() : null,
    blocked_by_quota: ev.blockedByQuota ?? false,
    block_reason: ev.blockReason ?? null,
    detail: ev.detail ?? {},
  })
}
