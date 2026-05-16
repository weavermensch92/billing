/**
 * Vendor Invoice Fetcher (HTTP) — 월간 청구서 폴링
 *
 * 흐름:
 *   1) 활성 vendor_admin_tokens 조회
 *   2) 각 토큰별 어댑터의 getInvoices(periodStart, periodEnd) 호출
 *   3) raw → RawVendorInvoice 변환
 *   4) saveVendorInvoice (lib/billing/vendor-invoice/fetcher.ts) 호출
 *
 * 어댑터 메서드 getInvoices는 신규 인터페이스.
 * Anthropic·OpenAI 어댑터에 추가 구현 필요 (TODO).
 *
 * 참조:
 *   - lib/billing/vendor-invoice/fetcher.ts (DB INSERT)
 *   - vendor_admin_tokens (M-1006)
 */

import { getDecryptedToken } from './token-broker'
import { getVendorAdapter, type VendorName } from './index'
import { saveVendorInvoice, type RawVendorInvoice } from '../billing/vendor-invoice/fetcher'

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface FetchInvoicesPeriod {
  periodStart: string // YYYY-MM-DD
  periodEnd: string   // YYYY-MM-DD
}

export interface InvoiceFetchSummary {
  tokenId: string
  vendor: string
  orgId: string
  vendorWorkspaceId: string
  fetched: number
  inserted: number
  duplicates: number
  errors: string[]
}

/**
 * 단일 토큰의 청구서 폴링.
 * marketRate는 호출자(cron)가 환율 API에서 받아 주입.
 */
export async function fetchInvoicesForToken(
  supabase: SBLike,
  tokenRow: {
    id: string
    org_id: string
    vendor: string
    vendor_workspace_id: string
  },
  period: FetchInvoicesPeriod,
  marketRate: number,
): Promise<InvoiceFetchSummary> {
  const summary: InvoiceFetchSummary = {
    tokenId: tokenRow.id,
    vendor: tokenRow.vendor,
    orgId: tokenRow.org_id,
    vendorWorkspaceId: tokenRow.vendor_workspace_id,
    fetched: 0,
    inserted: 0,
    duplicates: 0,
    errors: [],
  }

  try {
    const decrypted = await getDecryptedToken(supabase, {
      orgId: tokenRow.org_id,
      vendor: tokenRow.vendor,
      vendorWorkspaceId: tokenRow.vendor_workspace_id,
      usedFor: 'invoice_fetch',
    })
    if (!decrypted) throw new Error('token missing or revoked')

    const adapter = getVendorAdapter(tokenRow.vendor as VendorName)
    if (!adapter || typeof adapter.getInvoices !== 'function') {
      throw new Error(`vendor adapter ${tokenRow.vendor} does not implement getInvoices yet`)
    }

    const result = await adapter.getInvoices({
      vendorWorkspaceId: tokenRow.vendor_workspace_id,
      adminToken: decrypted.token,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    })
    if (!result.ok) {
      throw new Error(`getInvoices failed: ${result.error}`)
    }

    summary.fetched = result.invoices.length

    for (const raw of result.invoices) {
      const enriched: RawVendorInvoice = {
        ...raw,
        vendor: tokenRow.vendor,
        org_id: tokenRow.org_id,
        vendor_workspace_id: tokenRow.vendor_workspace_id,
      }
      try {
        const saved = await saveVendorInvoice(supabase, enriched, marketRate)
        if (saved.isNew) summary.inserted += 1
        else summary.duplicates += 1
      } catch (e) {
        summary.errors.push(`invoice ${raw.vendor_invoice_id}: ${String(e)}`)
      }
    }
  } catch (e) {
    summary.errors.push(String(e))
  }

  return summary
}

/**
 * pg_cron / 외부 cron 진입점 — 모든 활성 토큰에 대해 청구서 폴링.
 * 호출 빈도: 일/주 단위 (벤더 청구서 빈도에 맞춤).
 */
export async function runInvoicePolling(
  supabase: SBLike,
  period: FetchInvoicesPeriod,
  marketRate: number,
): Promise<InvoiceFetchSummary[]> {
  const { data: tokens } = (await supabase
    .from('vendor_admin_tokens')
    .select('id, org_id, vendor, vendor_workspace_id')
    .eq('status', 'active')) as {
    data: Array<{ id: string; org_id: string; vendor: string; vendor_workspace_id: string }> | null
  }

  const results: InvoiceFetchSummary[] = []
  for (const t of tokens ?? []) {
    results.push(await fetchInvoicesForToken(supabase, t, period, marketRate))
  }
  return results
}
