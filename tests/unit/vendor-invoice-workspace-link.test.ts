/**
 * Vendor Invoice ↔ Workspace Link 헬퍼 단위 테스트 (M-2005)
 */

import { describe, it, expect, vi } from 'vitest'
import {
  listUnlinkedInvoices,
  linkInvoiceToWorkspace,
  sourceTypeLabel,
} from '@/lib/billing/vendor-invoice/workspace-link'

// Supabase fluent chain mock
function mockSupabase(handlers: {
  view?: () => Promise<{ data: unknown; error: unknown }>
  update?: (payload: Record<string, unknown>) => Promise<{ error: unknown }>
}) {
  const updateChain = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockImplementation(() => handlers.update?.({}) ?? Promise.resolve({ error: null })),
  }
  const selectChain = {
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => handlers.view?.() ?? Promise.resolve({ data: [], error: null })),
  }
  // when no .limit called, awaiting the chain itself
  ;(selectChain as any).then = (onResolve: any) =>
    (handlers.view?.() ?? Promise.resolve({ data: [], error: null })).then(onResolve)

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'v_vendor_invoices_unlinked') {
        return { select: vi.fn().mockReturnValue(selectChain) }
      }
      if (table === 'vendor_invoices') {
        return {
          update: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            ;(updateChain.is as any).mockImplementation(() =>
              handlers.update?.(payload) ?? Promise.resolve({ error: null }),
            )
            return updateChain
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    }),
  }
}

describe('listUnlinkedInvoices', () => {
  it('returns mapped camelCase rows', async () => {
    const sb = mockSupabase({
      view: async () => ({
        data: [
          {
            id: 'inv-1',
            org_id: 'org-1',
            vendor: 'anthropic',
            external_workspace_id: 'ws-ext-1',
            billing_period_start: '2026-04-01',
            billing_period_end: '2026-04-30',
            total_krw: 1_234_500,
            source_type: 'account_invoice',
            fetched_at: '2026-05-01T00:00:00Z',
          },
        ],
        error: null,
      }),
    })

    const rows = await listUnlinkedInvoices(sb as any)
    expect(rows).toEqual([
      {
        id: 'inv-1',
        orgId: 'org-1',
        vendor: 'anthropic',
        externalWorkspaceId: 'ws-ext-1',
        billingPeriodStart: '2026-04-01',
        billingPeriodEnd: '2026-04-30',
        totalKrw: 1_234_500,
        sourceType: 'account_invoice',
        fetchedAt: '2026-05-01T00:00:00Z',
      },
    ])
  })

  it('throws when supabase returns error', async () => {
    const sb = mockSupabase({
      view: async () => ({ data: null, error: { code: 'PGRST116' } }),
    })
    await expect(listUnlinkedInvoices(sb as any)).rejects.toThrow(/listUnlinkedInvoices failed/)
  })
})

describe('linkInvoiceToWorkspace', () => {
  it('sends update with workspace_id + source_type', async () => {
    const seen: Record<string, unknown>[] = []
    const sb = mockSupabase({
      update: async (payload) => {
        seen.push(payload)
        return { error: null }
      },
    })

    await linkInvoiceToWorkspace(sb as any, 'inv-1', 'ws-1')

    expect(seen).toEqual([
      { workspace_id: 'ws-1', source_type: 'workspace_invoice' },
    ])
  })

  it('throws on db error', async () => {
    const sb = mockSupabase({
      update: async () => ({ error: { message: 'trigger reject' } }),
    })
    await expect(linkInvoiceToWorkspace(sb as any, 'inv-1', 'ws-1')).rejects.toThrow(
      /linkInvoiceToWorkspace failed/,
    )
  })
})

describe('sourceTypeLabel', () => {
  it.each([
    ['workspace_invoice', '워크스페이스 청구'],
    ['account_invoice', '계정 청구 (매칭 실패)'],
    ['subscription_invoice', '구독 청구 (Q3)'],
  ] as const)('%s → %s', (input, expected) => {
    expect(sourceTypeLabel(input)).toBe(expected)
  })
})
