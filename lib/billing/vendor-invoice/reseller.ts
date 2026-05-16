/**
 * Vendor Invoice Reseller — 마진 + 사용량 분배 → 고객 청구
 *
 * v2.0 청구 모델:
 *   - 그릿지가 벤더에서 받은 청구서(USD)를 KRW로 변환
 *   - 마진을 더한 금액을 고객에게 청구
 *   - 사용량은 팀별·멤버별로 분배 (allocate_invoice)
 *
 * v1.0 invoices 테이블을 v2 의미로 재사용:
 *   - subtotal_krw = 벤더 청구액 (할인 적용 후, 또는 wallet에서 차감된 금액)
 *   - total_due_krw = subtotal × (1 + 마진율) + VAT
 *
 * 참조:
 *   - vendor_invoices / vendor_invoice_items (M-1003)
 *   - usage-allocator.allocateInvoice (FIFO + 환차)
 *   - invoices (P1) — 고객 청구서 (v2 의미로 재사용)
 */

import { allocateInvoice } from '../usage-allocator'

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface CustomerInvoicePreview {
  vendorInvoiceId: string
  orgId: string
  vendor: string
  periodStart: string
  periodEnd: string
  vendorTotalKrw: number   // 벤더 청구액 (KRW)
  marginRate: number        // 0.0 ~ 1.0
  marginAmountKrw: number   // 마진 KRW
  subtotalKrw: number       // 벤더 + 마진
  vatKrw: number            // VAT (10%)
  totalDueKrw: number       // 최종 청구액
  fxPnlKrw: number          // 환차 손익 (그릿지 내부, 고객 미노출)
}

export interface CustomerInvoiceRecord extends CustomerInvoicePreview {
  customerInvoiceId: string
  generatedAt: string
}

const DEFAULT_VAT_RATE = 0.1 // 한국 부가가치세 10%

/**
 * 벤더 청구서를 기반으로 고객 청구액 사전 계산 (UI 미리보기).
 * 실제 INSERT는 generateCustomerInvoice에서.
 */
export async function previewCustomerInvoice(
  supabase: SBLike,
  params: {
    vendorInvoiceId: string
    marginRate: number    // 예: 0.10 = 10% 마진
    vatRate?: number      // 디폴트 0.1
  },
): Promise<CustomerInvoicePreview | null> {
  const { data: vi } = (await supabase
    .from('vendor_invoices')
    .select('id, vendor, org_id, billing_period_start, billing_period_end, total_krw')
    .eq('id', params.vendorInvoiceId)
    .maybeSingle()) as {
    data:
      | {
          id: string
          vendor: string
          org_id: string
          billing_period_start: string
          billing_period_end: string
          total_krw: number
        }
      | null
  }

  if (!vi) return null

  // 사용량 분배 합계로 fxPnl 계산 (이미 분배된 경우)
  const { data: allocRows } = (await supabase
    .from('usage_allocations')
    .select('fx_pnl_krw')
    .in(
      'vendor_invoice_item_id',
      // 서브쿼리 안 되니 item_id 직접 조회 후 IN
      (
        ((await supabase
          .from('vendor_invoice_items')
          .select('id')
          .eq('invoice_id', vi.id)) as { data: Array<{ id: string }> | null }
        ).data ?? []
      ).map((r) => r.id),
    )) as { data: Array<{ fx_pnl_krw: number }> | null }

  const fxPnlKrw = (allocRows ?? []).reduce((sum, r) => sum + Number(r.fx_pnl_krw ?? 0), 0)

  const vatRate = params.vatRate ?? DEFAULT_VAT_RATE
  const marginAmountKrw = Math.round(vi.total_krw * params.marginRate)
  const subtotalKrw = vi.total_krw + marginAmountKrw
  const vatKrw = Math.round(subtotalKrw * vatRate)
  const totalDueKrw = subtotalKrw + vatKrw

  return {
    vendorInvoiceId: vi.id,
    orgId: vi.org_id,
    vendor: vi.vendor,
    periodStart: vi.billing_period_start,
    periodEnd: vi.billing_period_end,
    vendorTotalKrw: vi.total_krw,
    marginRate: params.marginRate,
    marginAmountKrw,
    subtotalKrw,
    vatKrw,
    totalDueKrw,
    fxPnlKrw,
  }
}

/**
 * 벤더 청구서를 고객 청구서로 변환·발행.
 * 단계:
 *   1) usage_allocations 미존재 시 allocateInvoice 호출 (FIFO + 환차)
 *   2) preview 계산
 *   3) invoices 테이블에 row INSERT
 *   4) vendor_invoices.match_status = 'processed'
 */
export async function generateCustomerInvoice(
  supabase: SBLike,
  params: {
    vendorInvoiceId: string
    marginRate: number
    marketExchangeRate: number
    vatRate?: number
    issuedByAdminId: string
    runAllocationIfMissing?: boolean
  },
): Promise<CustomerInvoiceRecord> {
  // 1) 사용량 분배 (필요 시)
  if (params.runAllocationIfMissing !== false) {
    const existing = await countAllocations(supabase, params.vendorInvoiceId)
    if (existing === 0) {
      await allocateInvoice(supabase, params.vendorInvoiceId, params.marketExchangeRate)
    }
  }

  // 2) preview
  const preview = await previewCustomerInvoice(supabase, {
    vendorInvoiceId: params.vendorInvoiceId,
    marginRate: params.marginRate,
    vatRate: params.vatRate,
  })
  if (!preview) {
    throw new Error(`vendor_invoice not found: ${params.vendorInvoiceId}`)
  }

  // 3) invoices INSERT (P1 테이블 v2 의미로 재사용)
  const now = new Date().toISOString()
  const { data: invRow, error } = (await supabase
    .from('invoices')
    .insert({
      org_id: preview.orgId,
      period_start: preview.periodStart,
      period_end: preview.periodEnd,
      subtotal_krw: preview.subtotalKrw,
      vat_krw: preview.vatKrw,
      total_due_krw: preview.totalDueKrw,
      issued_at: now,
      status: 'issued',
      // v2 메타: 벤더 청구서·환차 연결
      meta: {
        vendor_invoice_id: params.vendorInvoiceId,
        vendor: preview.vendor,
        vendor_total_krw: preview.vendorTotalKrw,
        margin_rate: preview.marginRate,
        margin_amount_krw: preview.marginAmountKrw,
        fx_pnl_krw: preview.fxPnlKrw,
        issued_by: params.issuedByAdminId,
      },
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown }

  if (error || !invRow) {
    throw new Error(`customer invoice insert failed: ${JSON.stringify(error)}`)
  }

  // 4) vendor_invoices.match_status = 'processed'
  await supabase
    .from('vendor_invoices')
    .update({
      match_status: 'processed',
      matched_at: now,
      matched_by: params.issuedByAdminId,
    })
    .eq('id', params.vendorInvoiceId)

  return {
    ...preview,
    customerInvoiceId: invRow.id,
    generatedAt: now,
  }
}

async function countAllocations(supabase: SBLike, vendorInvoiceId: string): Promise<number> {
  const items = ((await supabase
    .from('vendor_invoice_items')
    .select('id')
    .eq('invoice_id', vendorInvoiceId)) as { data: Array<{ id: string }> | null }).data ?? []
  if (items.length === 0) return 0

  const { count } = (await supabase
    .from('usage_allocations')
    .select('*', { count: 'exact', head: true })
    .in(
      'vendor_invoice_item_id',
      items.map((i) => i.id),
    )) as { count: number | null }

  return count ?? 0
}
