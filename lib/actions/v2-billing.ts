/**
 * v2 Billing — 통합 Server Action 헬퍼
 *
 * 페이지별 actions.ts에서 호출. action_requests INSERT + executeRequestCompletion 일괄 처리.
 *
 * 모든 함수는:
 *   1) action_requests INSERT (status='pending')
 *   2) self-approve 또는 슈퍼어드민 컨펌 분기 (게이트 필요 시 'awaiting_super')
 *   3) 즉시 실행 가능하면 executeRequestCompletion 호출
 *
 * 호출처:
 *   - app/(customer)/billing/charge/actions.ts
 *   - app/(customer)/billing/api-keys/actions.ts
 *   - app/(customer)/billing/teams/actions.ts
 *   - app/(customer)/billing/refund/actions.ts
 *   - app/(customer)/settings/termination/actions.ts
 *   - app/(customer)/org/members/[id]/approval/actions.ts
 *   - app/(console)/console/charges/[id]/actions.ts
 */

import { executeRequestCompletion } from '@/lib/billing/request-executor'

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface ActionRequestInput {
  orgId: string
  actionType: string
  requesterId: string                // members.id
  accountId?: string | null
  memberId?: string | null
  requestData: Record<string, unknown>
  estimatedCostKrw?: number
  amMessage?: string
}

export interface ActionRequestOutput {
  ok: boolean
  requestId?: string
  affected?: Record<string, string[]>
  error?: string
  detail?: Record<string, unknown>
  /** 게이트 필요 케이스 (예: 충전 컨펌은 슈퍼어드민) */
  awaitingGate?: 'super_admin' | 'org_admin' | null
}

/**
 * 1차 요청 생성 + (가능하면) 즉시 실행.
 *
 * 게이트가 필요한 액션 (예: charge_request)은 'awaiting_super' 상태로 남기고
 * 슈퍼어드민이 별도 컨펌 시 다시 executeRequestCompletion 호출.
 */
async function createAndMaybeExecute(
  supabase: SBLike,
  input: ActionRequestInput,
  options: {
    autoExecute: boolean
    gateNeeded?: 'super_admin' | 'org_admin' | null
    resolvedBy?: string
  },
): Promise<ActionRequestOutput> {
  // 1) action_requests INSERT
  const initialStatus = options.autoExecute ? 'completed' : (options.gateNeeded ? 'awaiting_gate' : 'pending')

  const { data: req, error: insErr } = (await supabase
    .from('action_requests')
    .insert({
      org_id: input.orgId,
      action_type: input.actionType,
      status: initialStatus === 'completed' ? 'pending' : initialStatus, // executor가 completed로 전이
      account_id: input.accountId ?? null,
      member_id: input.memberId ?? null,
      request_data: input.requestData,
      progress_state: {},
      estimated_cost_krw: input.estimatedCostKrw ?? 0,
      requester_id: input.requesterId,
      am_message: input.amMessage ?? null,
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown }

  if (insErr || !req) {
    return { ok: false, error: `action_requests insert failed: ${JSON.stringify(insErr)}` }
  }

  if (!options.autoExecute) {
    return { ok: true, requestId: req.id, awaitingGate: options.gateNeeded ?? null }
  }

  // 2) 즉시 실행
  if (options.resolvedBy) {
    await supabase
      .from('action_requests')
      .update({ resolved_by: options.resolvedBy, resolved_at: new Date().toISOString(), status: 'completed' })
      .eq('id', req.id)
  }

  const result = await executeRequestCompletion(supabase, req.id)
  return {
    ok: result.ok,
    requestId: req.id,
    affected: result.affected,
    error: result.error,
    detail: result.detail,
  }
}

// ─────────────────────────────────────────────────────────
// 충전 신청 (charge_request) — Gate #1
// ─────────────────────────────────────────────────────────

export async function submitChargeRequest(
  supabase: SBLike,
  params: {
    orgId: string
    requesterId: string
    grossKrw: number
    discountRate: number
    exchangeRateAtCharge?: number
    fxSource?: string
    fxAt?: string
    refundable?: boolean
    orgName: string
    taxContact: { name: string; email: string; phone?: string }
    businessRegistrationNumber?: string
  },
): Promise<ActionRequestOutput> {
  return createAndMaybeExecute(
    supabase,
    {
      orgId: params.orgId,
      actionType: 'charge_request',
      requesterId: params.requesterId,
      requestData: {
        amount_krw_gross: params.grossKrw,
        discount_rate: params.discountRate,
        exchange_rate_at_charge: params.exchangeRateAtCharge,
        fx_source: params.fxSource,
        fx_at: params.fxAt,
        refundable: params.refundable ?? true,
        org_name: params.orgName,
        tax_contact: params.taxContact,
        business_registration_number: params.businessRegistrationNumber,
      },
      estimatedCostKrw: params.grossKrw,
    },
    { autoExecute: false, gateNeeded: 'super_admin' },
  )
}

/** 슈퍼어드민이 charge_request를 컨펌 → 실 실행 (Gate #1 통과) */
export async function confirmChargeRequest(
  supabase: SBLike,
  params: { requestId: string; superAdminId: string },
): Promise<ActionRequestOutput> {
  // status pending → completed (executor가 자동 변경)
  const result = await executeRequestCompletion(supabase, params.requestId)
  if (result.ok) {
    await supabase
      .from('action_requests')
      .update({
        resolved_by: params.superAdminId,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', params.requestId)
  }
  return result
}

// ─────────────────────────────────────────────────────────
// API 키 발급 (key_issuance) — 고객 어드민 승인 후
// ─────────────────────────────────────────────────────────

export async function submitKeyIssuance(
  supabase: SBLike,
  params: {
    orgId: string
    requesterId: string
    accountId: string
    vendor: string
    vendorWorkspaceId: string
    approvedByOrgAdmin: string  // members.id
    keyLabel?: string
  },
): Promise<ActionRequestOutput> {
  return createAndMaybeExecute(
    supabase,
    {
      orgId: params.orgId,
      actionType: 'key_issuance',
      requesterId: params.requesterId,
      accountId: params.accountId,
      memberId: params.requesterId,
      requestData: {
        vendor: params.vendor,
        vendor_workspace_id: params.vendorWorkspaceId,
        key_label: params.keyLabel,
      },
    },
    { autoExecute: true, resolvedBy: params.approvedByOrgAdmin },
  )
}

export async function submitKeyRevoke(
  supabase: SBLike,
  params: { orgId: string; requesterId: string; keyId: string; reason?: string },
): Promise<ActionRequestOutput> {
  return createAndMaybeExecute(
    supabase,
    {
      orgId: params.orgId,
      actionType: 'key_revoke',
      requesterId: params.requesterId,
      memberId: params.requesterId,
      requestData: { key_id: params.keyId, reason: params.reason },
    },
    { autoExecute: true, resolvedBy: params.requesterId },
  )
}

// ─────────────────────────────────────────────────────────
// 그림자 검수 (shadow_approval) — 24h 모드
// ─────────────────────────────────────────────────────────

export async function submitShadowApproval(
  supabase: SBLike,
  params: {
    orgId: string
    requesterId: string  // 결정 내리는 고객 어드민
    accountId: string
    decision: 'approve' | 'reject'
    teamId?: string
    note?: string
  },
): Promise<ActionRequestOutput> {
  return createAndMaybeExecute(
    supabase,
    {
      orgId: params.orgId,
      actionType: 'shadow_approval',
      requesterId: params.requesterId,
      accountId: params.accountId,
      memberId: params.requesterId,
      requestData: {
        decision: params.decision,
        team_id: params.teamId,
        note: params.note,
      },
    },
    { autoExecute: true, resolvedBy: params.requesterId },
  )
}

// ─────────────────────────────────────────────────────────
// 팀 헤드룸 분배 (team_headroom_set)
// ─────────────────────────────────────────────────────────

export async function submitTeamHeadroomSet(
  supabase: SBLike,
  params: { orgId: string; requesterId: string; teamId: string; limitKrw: number },
): Promise<ActionRequestOutput> {
  return createAndMaybeExecute(
    supabase,
    {
      orgId: params.orgId,
      actionType: 'team_headroom_set',
      requesterId: params.requesterId,
      memberId: params.requesterId,
      requestData: {
        team_id: params.teamId,
        headroom_limit_krw: params.limitKrw,
      },
    },
    { autoExecute: true, resolvedBy: params.requesterId },
  )
}

// ─────────────────────────────────────────────────────────
// Org 해지 (org_terminate)
// ─────────────────────────────────────────────────────────

export async function submitOrgTermination(
  supabase: SBLike,
  params: { orgId: string; requesterId: string; reason?: string },
): Promise<ActionRequestOutput> {
  return createAndMaybeExecute(
    supabase,
    {
      orgId: params.orgId,
      actionType: 'org_terminate',
      requesterId: params.requesterId,
      memberId: params.requesterId,
      requestData: { reason: params.reason },
    },
    { autoExecute: true, resolvedBy: params.requesterId },
  )
}

// ─────────────────────────────────────────────────────────
// 환불 신청 — request-executor 외 별도 흐름 (action_requests 없이 직접)
// ─────────────────────────────────────────────────────────

/**
 * 환불은 wallet_charges 직접 작업이라 action_requests 통하지 않고
 * lib/billing/refund.ts 의 processRefundA3 직접 호출.
 * 다만 감사 추적을 위해 audit_logs INSERT는 권장.
 */
export async function submitRefund(
  supabase: SBLike,
  params: {
    walletChargeId: string
    requestedBy: string
    approvedBy: string   // 슈퍼어드민
    note?: string
  },
): Promise<{ ok: boolean; outboundId?: string; error?: string; isNonRefundable?: boolean }> {
  const { processRefundA3, RefundError } = await import('@/lib/billing/refund')
  try {
    const result = await processRefundA3(supabase, {
      walletChargeId: params.walletChargeId,
      requestedBy: params.requestedBy,
      approvedBy: params.approvedBy,
      note: params.note,
    })
    return { ok: true, outboundId: result.outboundId }
  } catch (e) {
    if (e instanceof RefundError) {
      return { ok: false, error: e.message, isNonRefundable: e.isNonRefundable }
    }
    return { ok: false, error: String(e) }
  }
}
