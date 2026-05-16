/**
 * Refund — A3 환불 정책 (13.1)
 *
 * - 일반 충전 (refundable=TRUE): 할인 회수 후 차액 환불
 * - 지원금 (refundable=FALSE): 환수 거부
 * - 해지 흐름과 독립된 별도 액션
 *
 * 참조:
 *   - process_refund_a3 (M-1010 RPC)
 *   - payments_outbound 테이블
 */

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface RefundEntry {
  id: string
  org_id: string
  wallet_charge_id: string
  refund_amount_krw: number
  discount_recouped_krw: number
  gross_used_krw: number
  gross_remaining_krw: number
  status: 'requested' | 'approved' | 'processing' | 'completed' | 'rejected'
  reject_reason: string | null
  tax_invoice_correction_id: string | null
  bank_tx_id: string | null
  requested_by_member_id: string | null
  approved_by_admin_id: string | null
  approved_at: string | null
  processed_at: string | null
  created_at: string
}

/**
 * A3 환불 산정·역기록 (refundable=TRUE 충전만).
 * 지원금(refundable=FALSE)은 SQL 함수가 EXCEPTION → 호출자는 rejected 결과 받음.
 */
export async function processRefundA3(
  supabase: SBLike,
  params: {
    walletChargeId: string
    requestedBy: string // members.id 또는 admin_users.id
    approvedBy: string  // admin_users.id
    note?: string
  },
): Promise<{ outboundId: string }> {
  const { data, error } = await supabase.rpc('process_refund_a3', {
    p_wallet_charge_id: params.walletChargeId,
    p_requested_by: params.requestedBy,
    p_approved_by: params.approvedBy,
    p_note: params.note ?? null,
  })

  if (error) {
    const message =
      typeof error === 'object' && error && 'message' in error
        ? String((error as { message: unknown }).message)
        : JSON.stringify(error)
    throw new RefundError(message, { walletChargeId: params.walletChargeId })
  }
  return { outboundId: String(data) }
}

export class RefundError extends Error {
  constructor(message: string, public context?: Record<string, unknown>) {
    super(message)
    this.name = 'RefundError'
  }

  /** 지원금 환수 거부 케이스 식별 */
  get isNonRefundable(): boolean {
    return this.message.includes('non-refundable') || this.message.includes('refundable=FALSE')
  }
}

/** 환불 이력 (고객·슈퍼어드민 공통, RLS로 필터링) */
export async function getRefundHistory(
  supabase: SBLike,
  orgId: string,
  opts?: { status?: RefundEntry['status']; limit?: number },
): Promise<RefundEntry[]> {
  let query = supabase
    .from('payments_outbound')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (opts?.status) {
    query = query.eq('status', opts.status)
  }
  if (opts?.limit) {
    query = query.limit(opts.limit)
  }

  const { data } = (await query) as { data: RefundEntry[] | null }
  return data ?? []
}

/** 환불 처리 완료 표시 (입금 환불 후 슈퍼어드민 액션) */
export async function markRefundCompleted(
  supabase: SBLike,
  outboundId: string,
  params: { bankTxId?: string; taxInvoiceCorrectionId?: string; note?: string },
): Promise<boolean> {
  const { error } = await supabase
    .from('payments_outbound')
    .update({
      status: 'completed',
      processed_at: new Date().toISOString(),
      bank_tx_id: params.bankTxId ?? null,
      tax_invoice_correction_id: params.taxInvoiceCorrectionId ?? null,
      note: params.note ?? null,
    })
    .eq('id', outboundId)
    .eq('status', 'approved')

  return !error
}

/**
 * 환불 사전 산정 (실제 처리 전 UI 미리보기용)
 * 같은 식: gross_remaining = net_remaining / (1 - discount_rate)
 */
export function previewRefundA3(charge: {
  amount_krw_gross: number
  amount_krw_net: number
  amount_krw_used: number
  discount_rate: number
  refundable: boolean
}): { ok: false; reason: string } | { ok: true; refundKrw: number; discountRecoupedKrw: number; grossUsedKrw: number; grossRemainingKrw: number } {
  if (!charge.refundable) {
    return { ok: false, reason: '지원금/체험 크레딧은 환수 불가' }
  }
  const netRemaining = charge.amount_krw_net - charge.amount_krw_used
  if (netRemaining <= 0) {
    return { ok: false, reason: '잔여 net 잔액 없음' }
  }
  if (charge.discount_rate >= 1) {
    return { ok: false, reason: 'invalid discount_rate' }
  }
  const grossRemaining = Math.round(netRemaining / (1 - charge.discount_rate))
  const grossUsed = charge.amount_krw_gross - grossRemaining
  const discountRecouped = Math.round(grossUsed * charge.discount_rate)
  return {
    ok: true,
    refundKrw: netRemaining,
    discountRecoupedKrw: discountRecouped,
    grossUsedKrw: grossUsed,
    grossRemainingKrw: grossRemaining,
  }
}
