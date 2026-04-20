import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { StatCard } from '@/components/ui/stat-card'
import { formatKrw, formatBillingMonth, formatDate } from '@/lib/utils/format'
import type { Invoice } from '@/types/billing.types'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members').select('org_id, role').eq('user_id', user.id).eq('status', 'active').single()
  if (!member) redirect('/login')

  if (!['owner', 'admin'].includes(member.role)) {
    return (
      <div className="card p-12 text-center">
        <p className="text-sm text-gray-500">청구서는 Owner 또는 Admin만 열람할 수 있습니다.</p>
      </div>
    )
  }

  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('org_id', member.org_id)
    .neq('status', 'draft')
    .order('billing_month', { ascending: false })
    .limit(24)

  const list = (invoices ?? []) as Invoice[]

  const totalPaid = list.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.total_due_krw, 0)
  const pendingAmount = list.filter(i => i.status === 'issued').reduce((sum, i) => sum + i.total_due_krw, 0)
  const overdueCount = list.filter(i => i.status === 'overdue').length
  const latest = list[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">청구서</h1>
        <p className="text-sm text-gray-500 mt-1">
          월별 청구서와 세금계산서를 확인하세요.
        </p>
      </div>

      {/* StatCards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="이번 달 청구 예상"
          value={latest ? formatKrw(latest.total_due_krw) : '-'}
          subLabel={latest ? formatBillingMonth(latest.billing_month) : '청구서 없음'}
        />
        <StatCard
          label="미납 금액"
          value={formatKrw(pendingAmount)}
          trend={overdueCount > 0 ? 'down' : 'neutral'}
          trendValue={overdueCount > 0 ? `연체 ${overdueCount}건` : undefined}
        />
        <StatCard
          label="누적 납부 (최근 24개월)"
          value={formatKrw(totalPaid)}
        />
      </div>

      {/* 청구서 테이블 */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">청구서 내역</h2>
        </div>

        {list.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            청구서가 없습니다. 첫 청구서는 가입 후 다음 달 1일에 발행됩니다.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">청구월</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">원금</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">크레딧백</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">VAT</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">합계</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">납부기한</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">상태</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">세금계산서</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <Link href={`/billing/${inv.id}`} className="font-medium hover:text-brand-600">
                      {formatBillingMonth(inv.billing_month)}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-right font-mono">
                    {formatKrw(inv.subtotal_before_creditback)}
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-green-600">
                    {inv.credit_amount > 0 ? `-${formatKrw(inv.credit_amount)}` : '-'}
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-gray-500">
                    {formatKrw(inv.vat_krw)}
                  </td>
                  <td className="px-6 py-3 text-right font-mono font-semibold">
                    {formatKrw(inv.total_due_krw)}
                  </td>
                  <td className="px-6 py-3 text-gray-500">
                    {inv.due_date ? formatDate(inv.due_date) : '-'}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={inv.status === 'paid' ? 'completed' : inv.status} />
                  </td>
                  <td className="px-6 py-3 text-right">
                    {inv.tax_invoice_id ? (
                      <span className="text-xs text-brand-600 font-mono">{inv.tax_invoice_id.slice(0, 8)}</span>
                    ) : (
                      <span className="text-xs text-gray-400">발행 대기</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-gray-500">
        청구서 발행 약 3영업일 내 세금계산서가 Smart Bill을 통해 발행됩니다. 문의:{' '}
        <a href="mailto:finance@gridge.ai" className="text-brand-600 hover:underline">finance@gridge.ai</a>
      </div>
    </div>
  )
}
