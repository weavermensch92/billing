/**
 * Vendor Invoice Fetcher — 벤더 invoice API 폴링·DB INSERT
 *
 * Anthropic / OpenAI Admin Invoice API를 호출하여 청구서를 받아 vendor_invoices + items INSERT.
 * 실제 HTTP 호출은 lib/vendor-api/ 에서 처리. 이 모듈은 DB 적재·정합 검증 위주.
 *
 * 동작:
 *   - 매월 1회 (또는 N일) pg_cron 또는 외부 cron에서 호출
 *   - 새 청구서만 INSERT (UNIQUE vendor + vendor_invoice_id로 중복 차단)
 *   - 환율은 fetch 시점 시장 환율 사용 (exchange_rate, fx_at)
 *
 * 참조:
 *   - vendor_invoices / vendor_invoice_items (M-1003)
 *   - vendor_admin_tokens (M-1006) — API 호출 인증
 */

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface RawVendorInvoice {
  vendor: 'anthropic' | 'openai' | 'cursor' | string
  vendor_invoice_id: string
  vendor_workspace_id: string
  org_id: string
  billing_period_start: string // ISO date
  billing_period_end: string
  total_usd: number
  raw_payload: Record<string, unknown>
  items: Array<{
    line_no: number
    item_type: 'api_usage' | 'seat_license' | 'addon' | 'support' | 'credit' | 'other'
    description: string
    quantity?: number | null
    unit?: string | null
    amount_usd: number
    meta?: Record<string, unknown>
  }>
}

export interface SaveInvoiceResult {
  invoiceId: string
  itemCount: number
  totalKrw: number
  exchangeRate: number
  isNew: boolean
}

/**
 * 벤더에서 받은 raw 청구서를 DB에 저장.
 * 환율·KRW 변환은 여기서 수행. 매칭(matcher)·분배(allocator)는 별도 단계.
 */
export async function saveVendorInvoice(
  supabase: SBLike,
  raw: RawVendorInvoice,
  marketExchangeRate: number,
): Promise<SaveInvoiceResult> {
  const totalKrw = Math.round(raw.total_usd * marketExchangeRate)
  const fxAt = new Date().toISOString()

  // 중복 확인 (UNIQUE 제약과 별개로 사전 체크 → isNew 반환)
  const existing = await findExistingInvoice(supabase, raw.vendor, raw.vendor_invoice_id)
  if (existing) {
    return {
      invoiceId: existing.id,
      itemCount: 0,
      totalKrw: existing.total_krw,
      exchangeRate: existing.exchange_rate,
      isNew: false,
    }
  }

  // 1) Invoice header INSERT
  const { data: inserted, error: insErr } = (await supabase
    .from('vendor_invoices')
    .insert({
      vendor: raw.vendor,
      vendor_invoice_id: raw.vendor_invoice_id,
      vendor_workspace_id: raw.vendor_workspace_id,
      org_id: raw.org_id,
      billing_period_start: raw.billing_period_start,
      billing_period_end: raw.billing_period_end,
      total_usd: raw.total_usd,
      exchange_rate: marketExchangeRate,
      fx_at: fxAt,
      total_krw: totalKrw,
      raw_payload: raw.raw_payload,
      fetched_at: fxAt,
      match_status: 'pending',
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown }

  if (insErr || !inserted) {
    throw new Error(`vendor_invoice insert failed: ${JSON.stringify(insErr)}`)
  }

  const invoiceId = inserted.id

  // 2) Items INSERT (batch)
  if (raw.items.length > 0) {
    const itemRows = raw.items.map((it) => ({
      invoice_id: invoiceId,
      line_no: it.line_no,
      item_type: it.item_type,
      description: it.description,
      quantity: it.quantity ?? null,
      unit: it.unit ?? null,
      amount_usd: it.amount_usd,
      amount_krw: Math.round(it.amount_usd * marketExchangeRate),
      meta: it.meta ?? {},
    }))

    const { error: itemErr } = await supabase.from('vendor_invoice_items').insert(itemRows)
    if (itemErr) {
      throw new Error(`vendor_invoice_items insert failed: ${JSON.stringify(itemErr)}`)
    }
  }

  return {
    invoiceId,
    itemCount: raw.items.length,
    totalKrw,
    exchangeRate: marketExchangeRate,
    isNew: true,
  }
}

async function findExistingInvoice(
  supabase: SBLike,
  vendor: string,
  vendorInvoiceId: string,
): Promise<{ id: string; total_krw: number; exchange_rate: number } | null> {
  const { data } = (await supabase
    .from('vendor_invoices')
    .select('id, total_krw, exchange_rate')
    .eq('vendor', vendor)
    .eq('vendor_invoice_id', vendorInvoiceId)
    .maybeSingle()) as { data: { id: string; total_krw: number; exchange_rate: number } | null }
  return data
}

/** 미매칭(pending·mismatched·partial) 청구서 목록 — 슈퍼어드민 검수 큐 */
export async function getUnmatchedInvoices(
  supabase: SBLike,
  opts?: { vendor?: string; limit?: number },
): Promise<Array<{
  id: string
  vendor: string
  org_id: string
  billing_period_start: string
  billing_period_end: string
  total_krw: number
  match_status: string
  fetched_at: string
}>> {
  let query = supabase
    .from('vendor_invoices')
    .select('id, vendor, org_id, billing_period_start, billing_period_end, total_krw, match_status, fetched_at')
    .in('match_status', ['pending', 'partial', 'mismatched'])
    .order('fetched_at', { ascending: true })

  if (opts?.vendor) query = query.eq('vendor', opts.vendor)
  if (opts?.limit) query = query.limit(opts.limit)

  const { data } = await query
  return (data ?? []) as never
}
