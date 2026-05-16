/**
 * Limit Validator — v2.0 한도 변경 검증
 *
 * v1.0과 동일하게 monthly_limit_krw 감액 시 당월 사용액 초과 차단.
 * v2.0 의미 변경:
 *   - "한도"는 벤더 측 카드/계정 limit (벤더 결제 거절 방지용)
 *   - wallet 잔액·헤드룸과는 별개 (잔액·헤드룸은 자율승인 흐름)
 *   - 진리원천: vendor_invoices.total_krw + 미정산 transactions
 *
 * 진리원천 우선순위:
 *   1) vendor_invoices.total_krw (당월 청구서 도착 후)
 *   2) transactions.customer_charge_krw 합계 (실시간, 청구서 도착 전)
 *
 * 참조:
 *   - vendor_invoices (M-1003) — 월 1회 도착
 *   - transactions (P1) — 실시간 카드 거래
 */

type SBLike = {
  from: (t: string) => any
}

export interface ValidationResult {
  ok: boolean
  currentMonthSpendKrw: number
  source: 'vendor_invoice' | 'transactions' | 'mixed' | 'none'
  error?: string
}

function thisBillingMonth(): string {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  return `${y}-${m}`
}

/**
 * 한도 감액 검증 — 새 한도 < 당월 사용액이면 차단.
 *
 * vendor_invoice가 당월 분이 도착했으면 그 합계 (정확).
 * 미도착 시 transactions 합계 사용 (근사치).
 */
export async function validateLimitDecrease(
  supabase: SBLike,
  accountId: string,
  newLimitKrw: number,
): Promise<ValidationResult> {
  const month = thisBillingMonth()

  // 1) account 조회 (org_id 필요)
  const { data: account } = (await supabase
    .from('accounts')
    .select('id, org_id')
    .eq('id', accountId)
    .maybeSingle()) as { data: { id: string; org_id: string } | null }

  if (!account) {
    return { ok: false, currentMonthSpendKrw: 0, source: 'none', error: 'account not found' }
  }

  // 2) 우선 vendor_invoice_items 시도 (당월에 청구서가 이미 도착한 경우)
  let spendKrw = 0
  let source: ValidationResult['source'] = 'none'

  const monthStart = `${month}-01`
  const monthEnd = `${month}-31`

  const { data: invoiceItems } = (await supabase
    .from('vendor_invoice_items')
    .select('amount_krw, invoice:vendor_invoices(org_id, billing_period_start, billing_period_end)')
    .eq('invoice.org_id', account.org_id)
    .gte('invoice.billing_period_start', monthStart)
    .lte('invoice.billing_period_end', monthEnd)) as {
    data: Array<{ amount_krw: number }> | null
  }

  const invoiceTotal = (invoiceItems ?? []).reduce((sum, it) => sum + (it.amount_krw ?? 0), 0)

  // 3) transactions 합계 (실시간, account 단위)
  const { data: txs } = (await supabase
    .from('transactions')
    .select('customer_charge_krw')
    .eq('account_id', accountId)
    .eq('billing_month', month)
    .eq('status', 'settled')) as {
    data: Array<{ customer_charge_krw: number }> | null
  }

  const txTotal = (txs ?? []).reduce((sum, t) => sum + (t.customer_charge_krw ?? 0), 0)

  if (invoiceTotal > 0 && txTotal > 0) {
    spendKrw = Math.max(invoiceTotal, txTotal) // 더 큰 값 채택 (보수적)
    source = 'mixed'
  } else if (invoiceTotal > 0) {
    spendKrw = invoiceTotal
    source = 'vendor_invoice'
  } else if (txTotal > 0) {
    spendKrw = txTotal
    source = 'transactions'
  } else {
    spendKrw = 0
    source = 'none'
  }

  if (newLimitKrw < spendKrw) {
    return {
      ok: false,
      currentMonthSpendKrw: spendKrw,
      source,
      error: `당월 사용액(₩${spendKrw.toLocaleString()})이 새 한도(₩${newLimitKrw.toLocaleString()})를 초과합니다. 다음 달 이후에 감액하세요.`,
    }
  }

  return { ok: true, currentMonthSpendKrw: spendKrw, source }
}
