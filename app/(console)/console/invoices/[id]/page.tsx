import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatKrw, formatBillingMonth, formatDate, formatDateTime } from '@/lib/utils/format'
import { approveInvoice, issueInvoice, recordTaxInvoice, superApprove } from './actions'
import type { Invoice, Transaction } from '@/types/billing.types'

interface InvoiceWithOrg extends Invoice {
  org: { id: string; name: string } | null
}

export default async function ConsoleInvoiceDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { error?: string; success?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: adminUser } = await supabase
    .from('admin_users').select('id, role').eq('email', user.email ?? '').eq('is_active', true).single()
  if (!adminUser) redirect('/console/login')

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, org:orgs!org_id(id, name)')
    .eq('id', params.id)
    .single()

  if (!invoice) notFound()
  const inv = invoice as unknown as InvoiceWithOrg

  // 해당 월 거래 (내부 — 원가/마진 포함)
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('org_id', inv.org_id)
    .eq('billing_month', inv.billing_month)
    .order('transacted_at', { ascending: false })

  const txList = (transactions ?? []) as Transaction[]

  const settledTotal = txList.filter(t => t.status === 'settled').reduce((sum, t) => sum + t.customer_charge_krw, 0)
  const costTotal = txList.filter(t => t.status === 'settled').reduce((sum, t) => sum + t.gridge_cost_krw, 0)
  const marginTotal = txList.filter(t => t.status === 'settled').reduce((sum, t) => sum + t.gridge_margin_krw, 0)
  const passthroughCount = txList.filter(t => t.is_anthropic_passthrough).length

  const isFinance = adminUser.role === 'finance' || adminUser.role === 'super'
  const isSuper = adminUser.role === 'super'

  return (
    <div className="space-y-6">
      <div>
        <Link href="/console/invoices" className="text-sm text-gray-500 hover:text-gray-700">
          ← 청구서 관리
        </Link>
      </div>

      {searchParams.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}
      {searchParams.success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {searchParams.success}
        </div>
      )}

      {/* 헤더 */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {inv.org?.name} · {formatBillingMonth(inv.billing_month)}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              납부기한: {inv.due_date ? formatDate(inv.due_date) : '-'}
            </p>
          </div>
          <StatusBadge status={inv.status === 'paid' ? 'completed' : inv.status} />
        </div>
      </div>

      {/* 검수 체크리스트 (draft 상태) */}
      {inv.status === 'draft' && (
        <div className="card p-5 bg-orange-50 border-orange-200">
          <h3 className="text-sm font-semibold text-orange-900 mb-3">📋 월말 검수 체크리스트</h3>
          <ul className="space-y-1 text-sm text-orange-800">
            <li>□ 결제 내역 {txList.length}건 확인 ({txList.filter(t => t.status === 'settled').length}건 승인)</li>
            <li>□ 교차 검증: AiOPS usage ↔ Billing transactions 오차 &lt; 0.5%</li>
            <li>□ Anthropic 패스스루 적용 건수: {passthroughCount}건</li>
            <li>□ 크레딧백 자동 계산 확인 ({formatKrw(inv.credit_amount)})</li>
            {inv.requires_super_approval && <li className="font-semibold">□ Super 2차 승인 (고액 ≥ ₩10M)</li>}
          </ul>
        </div>
      )}

      {/* 3단계 breakdown (내부 — 원가/마진 포함) */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">금액 내역 (내부)</h2>
          <span className="text-xs text-gray-400">internal_only — 고객 비노출</span>
        </div>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="px-6 py-3 text-gray-700">결제 원가 (Gridge cost)</td>
              <td className="px-6 py-3 text-right font-mono">{formatKrw(costTotal)}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-6 py-3 text-gray-700">Gridge 마진 (PB-007 Anthropic 패스스루 포함)</td>
              <td className="px-6 py-3 text-right font-mono text-purple-700">{formatKrw(marginTotal)}</td>
            </tr>
            <tr className="border-b border-gray-100 font-semibold">
              <td className="px-6 py-3">고객 청구액 소계</td>
              <td className="px-6 py-3 text-right font-mono">{formatKrw(settledTotal)}</td>
            </tr>
            <tr className="border-b border-gray-100 text-green-600">
              <td className="px-6 py-3">크레딧백</td>
              <td className="px-6 py-3 text-right font-mono">-{formatKrw(inv.credit_amount)}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-6 py-3 text-gray-700">VAT (10%)</td>
              <td className="px-6 py-3 text-right font-mono">{formatKrw(inv.vat_krw)}</td>
            </tr>
            <tr className="bg-brand-50 font-semibold">
              <td className="px-6 py-3 text-gray-900">총 청구 금액</td>
              <td className="px-6 py-3 text-right font-mono text-lg">{formatKrw(inv.total_due_krw)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Finance 액션 */}
      {isFinance && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Finance 액션</h3>
          <div className="flex flex-wrap gap-3">
            {inv.status === 'draft' && !inv.requires_super_approval && (
              <form action={issueInvoice}>
                <input type="hidden" name="invoice_id" value={inv.id} />
                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  발행 확정 (draft → issued)
                </button>
              </form>
            )}

            {inv.status === 'draft' && inv.requires_super_approval && !inv.super_approved_at && isSuper && (
              <form action={superApprove}>
                <input type="hidden" name="invoice_id" value={inv.id} />
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  ★ Super 승인 (고액)
                </button>
              </form>
            )}

            {inv.status === 'draft' && inv.requires_super_approval && inv.super_approved_at && (
              <form action={issueInvoice}>
                <input type="hidden" name="invoice_id" value={inv.id} />
                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  발행 확정 (Super 승인됨)
                </button>
              </form>
            )}

            {inv.status === 'issued' && !inv.tax_invoice_id && (
              <form action={recordTaxInvoice} className="flex gap-2">
                <input type="hidden" name="invoice_id" value={inv.id} />
                <input
                  type="text"
                  name="tax_invoice_id"
                  placeholder="Smart Bill 거래번호"
                  required
                  className="px-3 py-2 border border-gray-300 rounded text-sm font-mono"
                />
                <button
                  type="submit"
                  className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  세금계산서 발행 기록
                </button>
              </form>
            )}
          </div>

          {inv.requires_super_approval && (
            <p className="mt-3 text-xs text-orange-600">
              ⚠ 고액 청구서 (≥ ₩10M). Super 2차 승인이 필요합니다.
              {inv.super_approved_at && ` (승인 완료: ${formatDateTime(inv.super_approved_at)})`}
            </p>
          )}
        </div>
      )}

      {/* 거래 상세 */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">거래 상세 ({txList.length}건)</h3>
        </div>
        {txList.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">거래 내역이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">시각</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">가맹점</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">원가</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">마진</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">고객 청구</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {txList.map(tx => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-xs text-gray-500">{formatDateTime(tx.transacted_at)}</td>
                  <td className="px-6 py-3 font-medium">
                    {tx.merchant_name ?? '-'}
                    {tx.is_anthropic_passthrough && (
                      <span className="ml-2 text-xs text-purple-600">★ Anthropic PT</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-gray-500">{formatKrw(tx.gridge_cost_krw)}</td>
                  <td className="px-6 py-3 text-right font-mono text-purple-700">{formatKrw(tx.gridge_margin_krw)}</td>
                  <td className="px-6 py-3 text-right font-mono font-semibold">{formatKrw(tx.customer_charge_krw)}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={tx.status === 'settled' ? 'completed' : tx.status === 'declined' ? 'rejected' : tx.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
