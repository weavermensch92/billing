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
 *   - api_keys (P1) — Org·account·key_hash·key_prefix·provider_key_id (평문 미저장)
 *   - vendor adapter createApiKey (TODO — adapter 인터페이스 확장)
 */

import crypto from 'node:crypto'
import { consumeQuota } from './quota'
import { getVendorAdapter, type VendorName } from '../../vendor-api/index'
import { getDecryptedToken } from '../../vendor-api/token-broker'

/** 평문 키 → SHA-256 hex. 인증 시 입력 비교만, 역산 불가. */
function hashKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex')
}

/** 노출용 prefix (앞 12자). 평문 자체를 식별자로 노출하면 안 되므로 일부만. */
function keyPrefix(plaintext: string): string {
  return plaintext.slice(0, 12)
}

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
  teamId?: string | null           // NULL = org 전체용 키, UUID = 팀 전용
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
  // 보안: 평문은 DB 절대 저장 안 함. SHA-256 hash + 12자 prefix 만 저장.
  // 평문(keyValueOnce) 은 호출자(server action) 가 응답으로 1회만 노출.
  const { data: keyRow, error: insErr } = (await supabase
    .from('api_keys')
    .insert({
      org_id: input.orgId,
      account_id: input.accountId,
      team_id: input.teamId ?? null,
      provider: input.vendor,
      provider_key_id: providerKeyId,
      key_hash: hashKey(keyValueOnce),
      key_prefix: keyPrefix(keyValueOnce),
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

/**
 * 키 삭제.
 *
 * 흐름:
 *   1) DB 에서 api_keys row 조회 (provider, provider_key_id, account vendor_workspace 등)
 *   2) 벤더 admin 토큰 복호화 시도 → 어댑터 deleteApiKey 호출
 *      - 성공 / 404 (이미 삭제) → 정상 진행
 *      - 실패 → 그릿지 DB 폐기는 계속 진행 (그릿지에서 더 이상 사용 불가하게 만드는 게 우선)
 *        실패 사실은 key_issuance_events.detail.vendor_revoke_error 에 기록
 *   3) api_keys status='revoked'
 *   4) 'revoked' 이벤트 기록 (vendor_revoke 결과 포함)
 */
export async function revokeKey(
  supabase: SBLike,
  params: { keyId: string; orgId: string; byMemberId: string; reason?: string },
): Promise<boolean> {
  // 1) DB 조회 — account 의 provider_workspace_id 까지 가져와야 벤더 호출 가능
  const { data: keyRow } = (await supabase
    .from('api_keys')
    .select('id, account_id, provider, provider_key_id, status, account:accounts!account_id(provider_workspace_id)')
    .eq('id', params.keyId)
    .eq('org_id', params.orgId)
    .maybeSingle()) as {
      data: {
        id: string
        account_id: string
        provider: string
        provider_key_id: string
        status: string
        account: { provider_workspace_id: string | null } | null
      } | null
    }

  if (!keyRow || keyRow.status !== 'active') return false

  // 2) 벤더 측 삭제 — 토큰·어댑터·workspace 어느 하나라도 없으면 skip (실패 아님)
  const vendorRevoke: {
    attempted: boolean
    ok: boolean
    httpStatus?: number
    error?: string
    isMock?: boolean
    skipReason?: 'no_token' | 'no_adapter' | 'no_workspace' | 'no_deleteApiKey'
  } = { attempted: false, ok: false }

  const vendorWorkspaceId = keyRow.account?.provider_workspace_id ?? null
  if (!vendorWorkspaceId) {
    vendorRevoke.skipReason = 'no_workspace'
  } else {
    const adapter = getVendorAdapter(keyRow.provider as VendorName)
    if (!adapter) {
      vendorRevoke.skipReason = 'no_adapter'
    } else if (typeof adapter.deleteApiKey !== 'function') {
      vendorRevoke.skipReason = 'no_deleteApiKey'
    } else {
      try {
        const decrypted = await getDecryptedToken(supabase, {
          orgId: params.orgId,
          vendor: keyRow.provider,
          vendorWorkspaceId,
          usedFor: 'key_revoke',
        })
        if (!decrypted) {
          vendorRevoke.skipReason = 'no_token'
        } else {
          vendorRevoke.attempted = true
          const result = await adapter.deleteApiKey({
            vendorWorkspaceId,
            adminToken: decrypted.token,
            providerKeyId: keyRow.provider_key_id,
          })
          vendorRevoke.ok = result.ok
          vendorRevoke.httpStatus = result.httpStatus
          vendorRevoke.error = result.error
          vendorRevoke.isMock = result.isMock
        }
      } catch (e) {
        vendorRevoke.attempted = true
        vendorRevoke.error = String(e)
      }
    }
  }

  // 3) DB 폐기 (벤더 측 결과와 무관 — 그릿지 측은 항상 회수)
  const { error } = await supabase
    .from('api_keys')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', params.keyId)
  if (error) return false

  // 4) 이벤트 — vendor_revoke 결과를 detail 에 남김 (감사/후속 디버깅용)
  await recordEvent(supabase, {
    orgId: params.orgId,
    accountId: keyRow.account_id,
    memberId: params.byMemberId,
    eventType: 'revoked',
    vendor: keyRow.provider,
    vendorKeyId: keyRow.provider_key_id,
    blockedByQuota: false,
    detail: {
      reason: params.reason ?? null,
      vendor_revoke: vendorRevoke,
    },
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
