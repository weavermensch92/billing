/**
 * Vendor Invoice ↔ Workspace Link (M-2005)
 *
 * vendor_invoices.workspace_id 매칭/연결.
 * - 백필 마이그레이션에서 매칭 실패한 청구서를 콘솔에서 식별 (v_vendor_invoices_unlinked)
 * - Super 가 vendor_workspaces row 를 만들거나 기존 row 를 선택해 연결
 * - 연결 시 source_type='workspace_invoice' 로 승격
 */

type SBLike = {
  from: (t: string) => any
}

export type VendorInvoiceSourceType =
  | 'workspace_invoice'
  | 'account_invoice'
  | 'subscription_invoice'

export interface UnlinkedInvoiceRow {
  id: string
  orgId: string
  vendor: string
  externalWorkspaceId: string
  billingPeriodStart: string
  billingPeriodEnd: string
  totalKrw: number
  sourceType: VendorInvoiceSourceType
  fetchedAt: string
}

/** 매칭 실패 청구서 목록 (Super 콘솔 사후 정리용) */
export async function listUnlinkedInvoices(
  supabase: SBLike,
  opts?: { orgId?: string; vendor?: string; limit?: number },
): Promise<UnlinkedInvoiceRow[]> {
  let q = supabase
    .from('v_vendor_invoices_unlinked')
    .select('*')
    .order('fetched_at', { ascending: false })

  if (opts?.orgId) q = q.eq('org_id', opts.orgId)
  if (opts?.vendor) q = q.eq('vendor', opts.vendor)
  if (opts?.limit) q = q.limit(opts.limit)

  const { data, error } = (await q) as {
    data:
      | Array<{
          id: string
          org_id: string
          vendor: string
          external_workspace_id: string
          billing_period_start: string
          billing_period_end: string
          total_krw: number
          source_type: VendorInvoiceSourceType
          fetched_at: string
        }>
      | null
    error: unknown
  }

  if (error) {
    throw new Error(`listUnlinkedInvoices failed: ${JSON.stringify(error)}`)
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    orgId: r.org_id,
    vendor: r.vendor,
    externalWorkspaceId: r.external_workspace_id,
    billingPeriodStart: r.billing_period_start,
    billingPeriodEnd: r.billing_period_end,
    totalKrw: r.total_krw,
    sourceType: r.source_type,
    fetchedAt: r.fetched_at,
  }))
}

/**
 * 청구서를 워크스페이스에 연결.
 * - 트리거 `trg_vendor_invoices_workspace_lock` 으로 한 번 설정 후 재배치 불가.
 * - source_type 도 'workspace_invoice' 로 동시 승격 (CHECK 정합성 보장).
 */
export async function linkInvoiceToWorkspace(
  supabase: SBLike,
  invoiceId: string,
  workspaceId: string,
): Promise<void> {
  const { error } = (await supabase
    .from('vendor_invoices')
    .update({
      workspace_id: workspaceId,
      source_type: 'workspace_invoice',
    })
    .eq('id', invoiceId)
    .is('workspace_id', null)) as { error: unknown }

  if (error) {
    throw new Error(
      `linkInvoiceToWorkspace failed (invoice=${invoiceId}, workspace=${workspaceId}): ${JSON.stringify(error)}`,
    )
  }
}

/** source_type → 한글 라벨 (콘솔 표시용) */
export function sourceTypeLabel(s: VendorInvoiceSourceType): string {
  switch (s) {
    case 'workspace_invoice':
      return '워크스페이스 청구'
    case 'account_invoice':
      return '계정 청구 (매칭 실패)'
    case 'subscription_invoice':
      return '구독 청구 (Q3)'
  }
}
