import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatKrw, formatBillingMonth, formatDate, formatDateTime } from '@/lib/utils/format'
import type { Invoice, Transaction } from '@/types/billing.types'

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members').select('org_id, role').eq('user_id', user.id).eq('status', 'active').single()
  if (!member || !['owner', 'admin'].includes(member.role)) redirect('/home')

  const { data: invoice } = await supabase
    .from('invoices').select('*').eq('id', params.id).single()

  if (!invoice) notFound()

  const inv = invoice as Invoice

  // 해당 월의 결제 내역 (고객용 뷰 — margin/cost 숨김)
  const { data: transactions } = await supabase
    .from('v_transaction_customer')
    .select('*')
    .eq('org_id', inv.org_id)
    .eq('billing_month', inv.billing_month)
    .eq('status', 'settled')
    .order('transacted_at', { ascending: false })

  const txList = (transactions ?? []) as Pick<Transaction,
    'id' | 'amount_krw' | 'merchant_name' | 'currency' | 'transacted_at' | 'settled_at'>[]

  // 3단계 breakdown
  const breakdown = [
    { label: '원금 (Gridge 공급가)', amount: inv.subtotal_before_creditback, note: '결제 원가 합계' },
    { label: '크레딧백', amount: -inv.credit_amount, note: inv.credit_amount > 0 ? '10% 6개월 크레딧백 적용' : '미적용' },
    { label: '공급가액 소계', amount: inv.subtotal_krw, note: null, bold: true },
    { label: 'VAT (10%)', amount: inv.vat_krw, note: null },
    { label: '총 청구 금액', amount: inv.total_due_krw, note: null, bold: true, hilite: true },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/billing" className="text-sm text-gray-500 hover:text-gray-700">
        ← 청구서 내역
      </Link>

      {/* 헤더 */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {formatBillingMonth(inv.billing_month)} 청구서
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              납부기한: <strong>{inv.due_date ? formatDate(inv.due_date) : '-'}</strong>
            </p>
            {inv.tax_invoice_id && (
              <p className="text-xs text-gray-400 mt-1 font-mono">
                세금계산서 거래번호: {inv.tax_invoice_id}
              </p>
            )}
          </div>
          <StatusBadge status={inv.status === 'paid' ? 'completed' : inv.status} />
        </div>

        {/* 연체 경고 */}
        {inv.status === 'overdue' && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-medium text-red-900">⚠ 연체 상태</p>
            <p className="text-sm text-red-700 mt-1">
              납부기한이 지났습니다. 자세한 안내는 Luna (AM)에게 문의해 주세요.
            </p>
          </div>
        )}
      </div>

      {/* 3단계 breakdown */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">금액 내역</h2>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {breakdown.map((row, i) => (
              <tr
                key={i}
                className={`
                  ${i < breakdown.length - 1 ? 'border-b border-gray-100' : ''}
                  ${row.hilite ? 'bg-brand-50' : ''}
                `}
              >
                <td className={`px-6 py-3 ${row.bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                  {row.label}
                </td>
                <td className="px-6 py-3 text-xs text-gray-400">{row.note ?? ''}</td>
                <td className={`px-6 py-3 text-right font-mono ${
                  row.bold ? 'font-semibold text-gray-900' : 'text-gray-700'
                } ${row.amount < 0 ? 'text-green-600' : ''}`}>
                  {row.amount < 0 ? `-${formatKrw(-row.amount)}` : formatKrw(row.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 결제 내역 */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            결제 내역 ({txList.length}건)
          </h2>
        </div>
        {txList.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            이 달의 결제 내역이 없습니다.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">거래일시</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">가맹점</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">금액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {txList.map(tx => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-500">{formatDateTime(tx.transacted_at)}</td>
                  <td className="px-6 py-3 font-medium">{tx.merchant_name ?? '-'}</td>
                  <td className="px-6 py-3 text-right font-mono">
                    {formatKrw(tx.amount_krw)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 참고 */}
      <div className="card p-5 bg-blue-50 border-blue-100">
        <p className="text-sm text-blue-900">
          <strong>참고</strong>: 위 금액은 실제 AI 서비스 결제 원가에 Gridge 공급가 구조가 적용된 금액입니다.
          Anthropic 파트너십 10% 패스스루가 적용된 건은 원가가 자동 할인되어 반영됩니다.
        </p>
      </div>
    </div>
  )
}
