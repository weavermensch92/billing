/**
 * Wallet — 충전 선금 + FIFO 차감 + 만료
 *
 * v2.0 핵심 수익 모델. SQL 함수 호출 위주.
 *   - consume_wallet (M-1001)         : KRW 직접 차감 FIFO
 *   - expire_wallet_charges (M-1001)  : 만료 처리 cron
 *   - v_org_wallet_balance            : 잔액 요약
 *
 * USD 사용량 차감은 lib/billing/usage-allocator.ts 의 multi-wallet FIFO 반복 호출.
 * 본 모듈은 단순 KRW 차감만 제공.
 *
 * Mock/실제 분기는 호출자(supabase) 레벨에서 처리.
 */

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface WalletCharge {
  id: string
  org_id: string
  amount_krw_gross: number
  discount_rate: number
  amount_krw_net: number
  amount_krw_used: number
  applied_at: string
  expires_at: string
  status: 'pending' | 'active' | 'exhausted' | 'expired' | 'refunded' | 'rejected'
  refundable: boolean
  exchange_rate_at_charge: number | null
  tax_invoice_issued_at: string | null
  slack_message_ts: string | null
}

export interface ConsumeWalletResult {
  success: boolean
  consumed_krw: number
  remaining_krw: number
}

export interface OrgWalletBalance {
  org_id: string
  remaining_krw: number
  active_charges_count: number
  next_expiring_at: string | null
  last_charge_at: string | null
}

/**
 * KRW 직접 차감 (FIFO, 만료 빠른 wallet 우선).
 * USD 사용량 차감은 usage-allocator를 통해 multi-wallet FIFO 처리.
 */
export async function consumeWalletKrw(
  supabase: SBLike,
  orgId: string,
  amountKrw: number,
  opts?: {
    reason?: 'usage_consumption' | 'reversal' | 'expiry_writeoff' | 'refund' | 'initial_charge'
    relatedVendorInvoiceId?: string
    relatedTransactionId?: string
    detail?: Record<string, unknown>
  },
): Promise<ConsumeWalletResult> {
  const { data, error } = await supabase.rpc('consume_wallet', {
    p_org_id: orgId,
    p_amount_krw: amountKrw,
    p_reason: opts?.reason ?? 'usage_consumption',
    p_vendor_invoice_id: opts?.relatedVendorInvoiceId ?? null,
    p_transaction_id: opts?.relatedTransactionId ?? null,
    p_detail: opts?.detail ?? {},
  })

  if (error) {
    throw new Error(`consume_wallet failed: ${JSON.stringify(error)}`)
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    success: Boolean(row?.success),
    consumed_krw: Number(row?.consumed_krw ?? 0),
    remaining_krw: Number(row?.remaining_krw ?? 0),
  }
}

/** 잔액 요약 (v_org_wallet_balance) */
export async function getWalletBalance(supabase: SBLike, orgId: string): Promise<OrgWalletBalance | null> {
  const { data } = (await supabase
    .from('v_org_wallet_balance')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()) as { data: OrgWalletBalance | null }
  return data
}

/** 활성 충전 목록 (FIFO 순) */
export async function getActiveCharges(supabase: SBLike, orgId: string): Promise<WalletCharge[]> {
  const { data } = (await supabase
    .from('wallet_charges')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('expires_at', { ascending: true })
    .order('applied_at', { ascending: true })) as { data: WalletCharge[] | null }
  return data ?? []
}

/** 충전 생성 (pending 상태 — 슈퍼어드민 컨펌 또는 슬랙 ✅로 active 전이) */
export async function createPendingCharge(
  supabase: SBLike,
  params: {
    orgId: string
    grossKrw: number
    discountRate: number
    exchangeRateAtCharge?: number
    fxSource?: string
    fxAt?: string
    expiresAt?: string
    refundable?: boolean
  },
): Promise<{ id: string } | null> {
  const netKrw = params.grossKrw - Math.round(params.grossKrw * params.discountRate)

  const { data, error } = (await supabase
    .from('wallet_charges')
    .insert({
      org_id: params.orgId,
      amount_krw_gross: params.grossKrw,
      discount_rate: params.discountRate,
      amount_krw_net: netKrw,
      status: 'pending',
      refundable: params.refundable ?? true,
      exchange_rate_at_charge: params.exchangeRateAtCharge ?? null,
      fx_source: params.fxSource ?? null,
      fx_at: params.fxAt ?? null,
      expires_at: params.expiresAt ?? null, // NULL이면 트리거가 orgs.wallet_default_validity_months 기준 자동 채움
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown }

  if (error) {
    throw new Error(`create wallet_charge failed: ${JSON.stringify(error)}`)
  }
  return data
}

/** 슈퍼어드민 컨펌으로 pending → active 직접 전이 (슬랙 ✅ 흐름 외 경로) */
export async function confirmChargeDirect(
  supabase: SBLike,
  chargeId: string,
  superAdminId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('wallet_charges')
    .update({
      status: 'active',
      confirmed_by: superAdminId,
      confirmed_at: new Date().toISOString(),
      tax_invoice_issued_at: new Date().toISOString(),
    })
    .eq('id', chargeId)
    .eq('status', 'pending')

  return !error
}

/** pg_cron 진입점 — 만료 charge 처리 (RPC 호출용 헬퍼) */
export async function expireExpiredCharges(supabase: SBLike): Promise<number> {
  const { data, error } = await supabase.rpc('expire_wallet_charges')
  if (error) throw new Error(`expire_wallet_charges failed: ${JSON.stringify(error)}`)
  return Number(data ?? 0)
}
