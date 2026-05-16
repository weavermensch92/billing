/**
 * Request Execution Pipeline — v2.0
 *
 * 요청이 'completed'로 전이될 때 실제 업무 테이블을 자동 변경하는 단일 진입점.
 * action_type 별 executor가 세부 DB 반영을 담당.
 *
 * v2.0 변경 사항:
 *   - prorate 호출 제거 (선금제라 일할 계산 불필요)
 *   - 'terminate' 흐름은 lib/billing/termination.ts 의 request_termination 으로 일원화 권장
 *   - 신규 v2 action_type 핸들러:
 *       'charge_request'   → 충전 신청 (wallet.createPendingCharge + slack 자동 포스팅)
 *       'key_issuance'     → API 키 발급 (key-issuance/executor.issueKey)
 *       'shadow_approval'  → 그림자 멤버 결정 (shadow-approval.approve/reject)
 *       'team_headroom_set'→ 팀 헤드룸 분배 (team-headroom.setTeamHeadroomLimit)
 *
 * 인터페이스 유지 (v1):
 *   executeRequestCompletion(supabase, requestId): Promise<ExecResult>
 *
 * 호출처:
 *   - app/(console)/console/requests/[id]/actions.ts::updateRequestStatus
 *   - app/(customer)/services/new/actions.ts::createRequest (self-approve 분기)
 *   - app/(customer)/requests/[id]/actions.ts::approveSelfByAdmin
 *
 * Idempotency: action_requests.status === 'completed' 이면 early return.
 */

import { validateLimitDecrease } from './limit-validator'
import { createPendingCharge } from './wallet'
import { setTeamHeadroomLimit } from './team-headroom'
import { requestTermination as requestOrgTermination } from './termination'
import { issueKey, revokeKey, KeyIssuanceBlockedError } from './key-issuance/executor'
import { approve as approveShadow, reject as rejectShadow } from './shadow-approval'
import { postTaxInvoiceRequest } from '../slack/poster'
import { getVendorAdapter, logVendorCall, type VendorName } from '../vendor-api/index'

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface ExecResult {
  ok: boolean
  error?: string
  affected?: Record<string, string[]>
  detail?: Record<string, unknown>
}

interface ActionRequestRow {
  id: string
  org_id: string
  action_type: string
  status: string
  account_id: string | null
  member_id: string | null
  request_data: Record<string, unknown>
  progress_state: Record<string, unknown>
  estimated_cost_krw: number
  requester_id: string | null
  resolved_at: string | null
  resolved_by: string | null
}

/**
 * 메인 진입점 — action_type별 executor 분기.
 * Idempotent: 이미 completed면 early return.
 */
export async function executeRequestCompletion(
  supabase: SBLike,
  requestId: string,
  options?: { resolved_by?: string },
): Promise<ExecResult> {
  const { data: req } = (await supabase
    .from('action_requests')
    .select(
      'id, org_id, action_type, status, account_id, member_id, request_data, progress_state, estimated_cost_krw, requester_id, resolved_at, resolved_by',
    )
    .eq('id', requestId)
    .maybeSingle()) as { data: ActionRequestRow | null }

  if (!req) {
    return { ok: false, error: `request not found: ${requestId}` }
  }

  if (req.status === 'completed') {
    return { ok: true, affected: {} } // idempotent
  }

  if (options?.resolved_by) {
    req.resolved_by = options.resolved_by
  }

  try {
    switch (req.action_type) {
      // v1 호환 흐름
      case 'new_account':
        return await executeNewAccount(supabase, req)
      case 'limit_change':
        return await executeLimitChange(supabase, req)
      case 'terminate':
        return await executeTerminateAccount(supabase, req)
      case 'vcn_replace':
        return await executeVcnReplace(supabase, req)
      case 'bulk_terminate':
        return await executeBulkTerminate(supabase, req)

      // v2 신규 흐름
      case 'charge_request':
        return await executeChargeRequest(supabase, req)
      case 'key_issuance':
        return await executeKeyIssuance(supabase, req)
      case 'key_revoke':
        return await executeKeyRevoke(supabase, req)
      case 'shadow_approval':
        return await executeShadowApproval(supabase, req)
      case 'team_headroom_set':
        return await executeTeamHeadroomSet(supabase, req)
      case 'org_terminate':
        return await executeOrgTerminate(supabase, req)

      default:
        return { ok: false, error: `unsupported action_type: ${req.action_type}` }
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// ─────────────────────────────────────────────────────────
// v1 호환 흐름 (v2 의미 반영)
// ─────────────────────────────────────────────────────────

/**
 * 새 계정 생성.
 * v2: accounts INSERT (status='active'). 첫 active면 discount_policy 트리거 자동 시작 (M-1002).
 * 24h 검수는 그림자 sync에서만 적용 (정식 신청 흐름은 즉시 active).
 */
async function executeNewAccount(supabase: SBLike, req: ActionRequestRow): Promise<ExecResult> {
  const rd = req.request_data ?? {}
  const serviceId = String(rd.service_id ?? '')
  const monthlyLimit = Number(rd.monthly_limit_krw ?? 0)
  const allowOverseas = Boolean(rd.allow_overseas ?? false)

  if (!serviceId || !req.member_id) {
    return { ok: false, error: 'missing service_id or member_id' }
  }

  const { data: service } = (await supabase
    .from('services')
    .select('id, vendor')
    .eq('id', serviceId)
    .maybeSingle()) as { data: { id: string; vendor: string } | null }

  if (!service) return { ok: false, error: `service not found: ${serviceId}` }

  const { data: account, error } = (await supabase
    .from('accounts')
    .insert({
      org_id: req.org_id,
      member_id: req.member_id,
      service_id: serviceId,
      monthly_limit_krw: monthlyLimit,
      allow_overseas: allowOverseas,
      status: 'active',
      provider: service.vendor,
      approval_status: 'active', // 정식 신청 흐름은 검수 X
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown }

  if (error || !account) {
    return { ok: false, error: `account insert failed: ${JSON.stringify(error)}` }
  }

  return { ok: true, affected: { accounts: [account.id] } }
}

/**
 * 한도 변경.
 * 감액 시 validateLimitDecrease (v2 모델 — vendor_invoice 우선 + transactions 폴백).
 */
async function executeLimitChange(supabase: SBLike, req: ActionRequestRow): Promise<ExecResult> {
  const newLimit = Number(req.request_data?.new_monthly_limit_krw ?? 0)
  if (!req.account_id) return { ok: false, error: 'missing account_id' }

  // 감액 검증
  const { data: currentAccount } = (await supabase
    .from('accounts')
    .select('monthly_limit_krw')
    .eq('id', req.account_id)
    .maybeSingle()) as { data: { monthly_limit_krw: number } | null }

  if (currentAccount && newLimit < currentAccount.monthly_limit_krw) {
    const validation = await validateLimitDecrease(supabase, req.account_id, newLimit)
    if (!validation.ok) {
      return {
        ok: false,
        error: validation.error,
        detail: { source: validation.source, currentMonthSpendKrw: validation.currentMonthSpendKrw },
      }
    }
  }

  const { error } = await supabase
    .from('accounts')
    .update({ monthly_limit_krw: newLimit })
    .eq('id', req.account_id)

  if (error) return { ok: false, error: `account update failed: ${JSON.stringify(error)}` }
  return { ok: true, affected: { accounts: [req.account_id] } }
}

/**
 * 개별 계정 해지 (account 단위).
 * v2: prorate 호출 제거. status='terminated' 만.
 * Org 전체 해지는 'org_terminate' action_type 사용 (termination.requestTermination).
 */
async function executeTerminateAccount(supabase: SBLike, req: ActionRequestRow): Promise<ExecResult> {
  if (!req.account_id) return { ok: false, error: 'missing account_id' }

  const { error } = await supabase
    .from('accounts')
    .update({
      status: 'terminated',
      terminated_at: new Date().toISOString(),
      terminated_by: req.resolved_by,
    })
    .eq('id', req.account_id)

  if (error) return { ok: false, error: `account terminate failed: ${JSON.stringify(error)}` }

  // 연결된 VCN도 정지
  const { data: vcns } = (await supabase
    .from('virtual_cards')
    .select('id')
    .eq('account_id', req.account_id)
    .neq('status', 'terminated')) as { data: Array<{ id: string }> | null }

  const vcnIds: string[] = []
  for (const v of vcns ?? []) {
    await supabase
      .from('virtual_cards')
      .update({ status: 'terminated', terminated_at: new Date().toISOString() })
      .eq('id', v.id)
    vcnIds.push(v.id)
  }

  return { ok: true, affected: { accounts: [req.account_id], virtual_cards: vcnIds } }
}

/**
 * VCN 교체.
 * v2: Idea 1 가이드 (수동) + 토큰 재등록은 별도 흐름.
 * 본 함수는 VCN row 자체의 status 전이만 (old → terminated, new INSERT).
 */
async function executeVcnReplace(supabase: SBLike, req: ActionRequestRow): Promise<ExecResult> {
  const rd = req.request_data ?? {}
  const oldVcnId = req.account_id ? null : String(rd.old_vcn_id ?? '')
  const accountId = req.account_id ?? String(rd.account_id ?? '')

  if (!accountId) return { ok: false, error: 'missing account_id' }

  // 기존 VCN 정지
  if (oldVcnId) {
    await supabase
      .from('virtual_cards')
      .update({ status: 'replaced', terminated_at: new Date().toISOString() })
      .eq('id', oldVcnId)
  }

  // 새 VCN INSERT는 별도 카드사 발급 후 처리. 본 함수에서는 status='requested' row만 마련.
  const { data: newVcn } = (await supabase
    .from('virtual_cards')
    .insert({
      account_id: accountId,
      org_id: req.org_id,
      status: 'requested',
      requested_by: req.resolved_by,
    })
    .select('id')
    .single()) as { data: { id: string } | null }

  return {
    ok: true,
    affected: { virtual_cards: [oldVcnId, newVcn?.id].filter(Boolean) as string[] },
    detail: { note: 'Idea 1: 카드 발급 + 고객 어드민 수동 등록 + 토큰 재등록 흐름 별도 진행' },
  }
}

/** 일괄 해지 — request_data.account_ids 배열의 각 account를 terminate */
async function executeBulkTerminate(supabase: SBLike, req: ActionRequestRow): Promise<ExecResult> {
  const ids = (req.request_data?.account_ids as string[] | undefined) ?? []
  if (ids.length === 0) return { ok: false, error: 'no account_ids' }

  const affected: string[] = []
  for (const accountId of ids) {
    const r = await executeTerminateAccount(supabase, { ...req, account_id: accountId })
    if (r.ok && r.affected?.accounts) affected.push(...r.affected.accounts)
  }
  return { ok: true, affected: { accounts: affected } }
}

// ─────────────────────────────────────────────────────────
// v2 신규 흐름
// ─────────────────────────────────────────────────────────

/**
 * 충전 신청 (5단계 흐름).
 * Gate #1 (슈퍼어드민 컨펌)은 콘솔에서 별도 처리. 여기서는 컨펌 후 후속 자동화:
 *   1) createPendingCharge
 *   2) postTaxInvoiceRequest (#세금계산서 채널)
 *   3) request_data.confirmedDirectlyBySuper === true 면 confirmChargeDirect로 즉시 active
 */
async function executeChargeRequest(supabase: SBLike, req: ActionRequestRow): Promise<ExecResult> {
  const rd = req.request_data ?? {}
  const gross = Number(rd.amount_krw_gross ?? 0)
  const rate = Number(rd.discount_rate ?? 0.1)
  const fxRate = rd.exchange_rate_at_charge ? Number(rd.exchange_rate_at_charge) : undefined

  if (gross <= 0) return { ok: false, error: 'invalid gross amount' }

  const charge = await createPendingCharge(supabase, {
    orgId: req.org_id,
    grossKrw: gross,
    discountRate: rate,
    exchangeRateAtCharge: fxRate,
    fxSource: typeof rd.fx_source === 'string' ? rd.fx_source : undefined,
    fxAt: typeof rd.fx_at === 'string' ? rd.fx_at : undefined,
    refundable: rd.refundable !== false,
  })

  if (!charge) return { ok: false, error: 'createPendingCharge returned null' }

  // 슬랙 자동 포스팅 (request_data.org_name 등 필요)
  const orgName = String(rd.org_name ?? '')
  const taxContact = rd.tax_contact as { name: string; email: string; phone?: string } | undefined

  if (orgName && taxContact) {
    await postTaxInvoiceRequest(supabase, {
      orgId: req.org_id,
      orgName,
      walletChargeId: charge.id,
      amountKrwGross: gross,
      amountKrwNet: gross - Math.round(gross * rate),
      discountRate: rate,
      taxContact,
      businessRegistrationNumber: typeof rd.business_registration_number === 'string' ? rd.business_registration_number : undefined,
    })
  }

  return { ok: true, affected: { wallet_charges: [charge.id] } }
}

/**
 * API 키 발급.
 * key-issuance/executor.issueKey 호출. quota 차단 시 blocked 이벤트 + error.
 */
async function executeKeyIssuance(supabase: SBLike, req: ActionRequestRow): Promise<ExecResult> {
  const rd = req.request_data ?? {}
  if (!req.account_id || !req.member_id) {
    return { ok: false, error: 'missing account_id or member_id' }
  }

  try {
    const result = await issueKey(supabase, {
      orgId: req.org_id,
      accountId: req.account_id,
      vendor: String(rd.vendor ?? ''),
      vendorWorkspaceId: String(rd.vendor_workspace_id ?? ''),
      requestedByMemberId: req.member_id,
      approvedByOrgAdminMemberId: req.resolved_by ?? req.member_id,
      keyLabel: typeof rd.key_label === 'string' ? rd.key_label : undefined,
    })

    // keyValueOnce는 응답 detail에만, DB·로그에는 저장 안 함
    return {
      ok: true,
      affected: { api_keys: [result.keyId] },
      detail: { keyValueOnce: result.keyValueOnce, quotaRemaining: result.quotaRemaining },
    }
  } catch (e) {
    if (e instanceof KeyIssuanceBlockedError) {
      return {
        ok: false,
        error: e.message,
        detail: { reason: e.reason, cooldownUntil: e.cooldownUntil, remainingInWindow: e.remainingInWindow },
      }
    }
    return { ok: false, error: String(e) }
  }
}

async function executeKeyRevoke(supabase: SBLike, req: ActionRequestRow): Promise<ExecResult> {
  const rd = req.request_data ?? {}
  const keyId = String(rd.key_id ?? '')
  if (!keyId || !req.member_id) return { ok: false, error: 'missing key_id or member_id' }

  const ok = await revokeKey(supabase, {
    keyId,
    orgId: req.org_id,
    byMemberId: req.member_id,
    reason: typeof rd.reason === 'string' ? rd.reason : undefined,
  })
  return ok ? { ok: true, affected: { api_keys: [keyId] } } : { ok: false, error: 'revoke failed' }
}

/** 그림자 멤버 24h 검수 결정 */
async function executeShadowApproval(supabase: SBLike, req: ActionRequestRow): Promise<ExecResult> {
  const rd = req.request_data ?? {}
  const accountId = req.account_id ?? String(rd.account_id ?? '')
  const decision = String(rd.decision ?? '') // 'approve' | 'reject'
  if (!accountId || !req.member_id) return { ok: false, error: 'missing account_id or member_id' }

  if (decision === 'approve') {
    const ok = await approveShadow(supabase, {
      accountId,
      byMemberId: req.member_id,
      teamId: typeof rd.team_id === 'string' ? rd.team_id : undefined,
      note: typeof rd.note === 'string' ? rd.note : undefined,
    })
    return ok ? { ok: true, affected: { accounts: [accountId] } } : { ok: false, error: 'approve failed' }
  } else if (decision === 'reject') {
    const ok = await rejectShadow(supabase, {
      accountId,
      byMemberId: req.member_id,
      note: typeof rd.note === 'string' ? rd.note : undefined,
    })
    return ok ? { ok: true, affected: { accounts: [accountId] } } : { ok: false, error: 'reject failed' }
  }
  return { ok: false, error: `invalid decision: ${decision}` }
}

/** 팀 헤드룸 분배 (Q1-d) */
async function executeTeamHeadroomSet(supabase: SBLike, req: ActionRequestRow): Promise<ExecResult> {
  const rd = req.request_data ?? {}
  const teamId = String(rd.team_id ?? '')
  const limitKrw = Number(rd.headroom_limit_krw ?? -1)
  if (!teamId || limitKrw < 0) return { ok: false, error: 'invalid team_id or limit' }

  const result = await setTeamHeadroomLimit(supabase, teamId, req.org_id, limitKrw)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, affected: { team_headroom: [teamId] } }
}

/** Org 해지 (13.2 B-i + c) */
async function executeOrgTerminate(supabase: SBLike, req: ActionRequestRow): Promise<ExecResult> {
  const rd = req.request_data ?? {}
  if (!req.member_id && !req.resolved_by) return { ok: false, error: 'missing requester' }

  const result = await requestOrgTermination(supabase, {
    orgId: req.org_id,
    requestedBy: req.resolved_by ?? req.member_id!,
    reason: typeof rd.reason === 'string' ? rd.reason : undefined,
  })

  return {
    ok: true,
    affected: { orgs: [req.org_id] },
    detail: { graceUntil: result.graceUntil },
  }
}

// vendor adapter 활용 헬퍼 (필요 시 export)
export { getVendorAdapter, logVendorCall, type VendorName }
