/**
 * Vendor Invoice Matcher — 카드 거래 ↔ 청구서 정합 검증
 *
 * 벤더 청구서는 진리원천 (옵션 3). 카드 거래는 보조 검증.
 * 두 합계가 1% 이내면 matched. 5% 이내면 partial. 그 이상은 mismatched.
 *
 * 참조:
 *   - v_invoice_vs_card_diff (M-1003) — 정합 비교 뷰
 *   - vendor_invoices.match_status / match_diff_krw / matched_card_charge_krw
 */

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface InvoiceMatchSummary {
  invoiceId: string
  vendor: string
  orgId: string
  periodStart: string
  periodEnd: string
  invoiceTotalKrw: number
  cardTotalKrw: number
  diffKrw: number
  diffRatio: number // |diff| / invoiceTotal
  suggestedStatus: 'matched' | 'partial' | 'mismatched'
}

const MATCHED_THRESHOLD = 0.01 // <1%
const PARTIAL_THRESHOLD = 0.05 // <5%

/** 단일 청구서 정합 확인 (DB 뷰 직접 조회) */
export async function inspectInvoiceMatch(
  supabase: SBLike,
  invoiceId: string,
): Promise<InvoiceMatchSummary | null> {
  const { data } = (await supabase
    .from('v_invoice_vs_card_diff')
    .select('*')
    .eq('invoice_id', invoiceId)
    .maybeSingle()) as {
    data:
      | {
          invoice_id: string
          vendor: string
          org_id: string
          billing_period_start: string
          billing_period_end: string
          invoice_total_krw: number
          card_total_krw: number
          diff_krw: number
          suggested_match_status: 'matched' | 'partial' | 'mismatched'
        }
      | null
  }

  if (!data) return null

  const diffRatio = data.invoice_total_krw > 0 ? Math.abs(data.diff_krw) / data.invoice_total_krw : 0

  return {
    invoiceId: data.invoice_id,
    vendor: data.vendor,
    orgId: data.org_id,
    periodStart: data.billing_period_start,
    periodEnd: data.billing_period_end,
    invoiceTotalKrw: data.invoice_total_krw,
    cardTotalKrw: data.card_total_krw,
    diffKrw: data.diff_krw,
    diffRatio,
    suggestedStatus: data.suggested_match_status,
  }
}

/**
 * 청구서 매칭 시도 + 결과 기록.
 * suggested_status를 그대로 채택 또는 슈퍼어드민이 수동 override.
 */
export async function applyMatchResult(
  supabase: SBLike,
  invoiceId: string,
  status: 'matched' | 'partial' | 'mismatched' | 'processed',
  matchedByAdminId: string,
): Promise<boolean> {
  const summary = await inspectInvoiceMatch(supabase, invoiceId)
  if (!summary) return false

  const { error } = await supabase
    .from('vendor_invoices')
    .update({
      match_status: status,
      matched_card_charge_krw: summary.cardTotalKrw,
      match_diff_krw: summary.diffKrw,
      matched_at: new Date().toISOString(),
      matched_by: matchedByAdminId,
    })
    .eq('id', invoiceId)

  return !error
}

/**
 * 일괄 자동 매칭 — pg_cron 또는 슈퍼어드민 트리거.
 * 임계값 자동 적용. 슈퍼어드민 검수가 필요하면 수동 override.
 */
export async function autoMatchPendingInvoices(
  supabase: SBLike,
  matchedByAdminId: string,
  opts?: { dryRun?: boolean },
): Promise<{
  inspected: number
  matched: number
  partial: number
  mismatched: number
}> {
  const { data: invoices } = (await supabase
    .from('vendor_invoices')
    .select('id')
    .eq('match_status', 'pending')) as { data: Array<{ id: string }> | null }

  let matched = 0
  let partial = 0
  let mismatched = 0

  for (const inv of invoices ?? []) {
    const summary = await inspectInvoiceMatch(supabase, inv.id)
    if (!summary) continue

    if (!opts?.dryRun) {
      await applyMatchResult(supabase, inv.id, summary.suggestedStatus, matchedByAdminId)
    }

    switch (summary.suggestedStatus) {
      case 'matched':
        matched += 1
        break
      case 'partial':
        partial += 1
        break
      case 'mismatched':
        mismatched += 1
        break
    }
  }

  return { inspected: (invoices ?? []).length, matched, partial, mismatched }
}

export { MATCHED_THRESHOLD, PARTIAL_THRESHOLD }
