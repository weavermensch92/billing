import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatKrw, formatBillingMonth, formatDate } from '@/lib/utils/format'
import type { Invoice } from '@/types/billing.types'

interface InvoiceWithOrg extends Invoice {
  org: { name: string } | null
}

export default async function ConsoleInvoicesPage({
  searchParams,
}: {
  searchParams: { month?: string; status?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const thisMonth = new Date().toISOString().slice(0, 7)
  const filterMonth = searchParams.month ?? thisMonth

  let query = supabase
    .from('invoices')
    .select('*, org:orgs!org_id(name)')
    .order('billing_month', { ascending: false })
    .order('created_at', { ascending: false })

  if (filterMonth !== 'all') {
    query = query.eq('billing_month', filterMonth)
  }
  if (searchParams.status && searchParams.status !== 'all') {
    query = query.eq('status', searchParams.status)
  }

  const { data: invoices } = await query.limit(100)
  const list = (invoices ?? []) as unknown as InvoiceWithOrg[]

  const totalDraft = list.filter(i => i.status === 'draft').length
  const totalIssued = list.filter(i => i.status === 'issued').length
  const totalAmount = list.reduce((sum, i) => sum + i.total_due_krw, 0)
  const superApprovalNeeded = list.filter(i => i.requires_super_approval && !i.super_approved_at).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">청구서 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          월말 검수 · Smart Bill 발행 확인 · 고액 승인 관리
        </p>
      </div>

      {/* 월별 필터 */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">청구월:</label>
        <form action="/console/invoices" method="GET" className="flex gap-2">
          <input
            type="month"
            name="month"
            defaultValue={filterMonth === 'all' ? thisMonth : filterMonth}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm"
          />
          <select
            name="status"
            defaultValue={searchParams.status ?? 'all'}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm"
          >
            <option value="all">전체 상태</option>
            <option value="draft">초안</option>
            <option value="issued">발행됨</option>
            <option value="paid">납부됨</option>
            <option value="overdue">연체</option>
          </select>
          <button className="bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-1.5 rounded">
            필터
          </button>
        </form>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs text-gray-500">초안 (검수 대기)</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{totalDraft}건</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">발행 완료</p>
          <p className="text-xl font-semibold text-green-600 mt-1">{totalIssued}건</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Super 승인 대기</p>
          <p className="text-xl font-semibold text-orange-600 mt-1">{superApprovalNeeded}건</p>
          <p className="text-xs text-gray-400 mt-0.5">₩10M 이상 고액</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">합계 (필터)</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{formatKrw(totalAmount)}</p>
        </div>
      </div>

      {/* Invoice table */}
      <div className="card overflow-hidden">
        {list.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            조건에 맞는 청구서가 없습니다.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">고객사</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">청구월</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">합계</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">납부기한</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">상태</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">세금계산서</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium">{inv.org?.name ?? '-'}</td>
                  <td className="px-6 py-3">
                    <Link href={`/console/invoices/${inv.id}`} className="hover:text-brand-600">
                      {formatBillingMonth(inv.billing_month)}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-right font-mono font-semibold">
                    {formatKrw(inv.total_due_krw)}
                    {inv.requires_super_approval && !inv.super_approved_at && (
                      <span className="block text-xs text-orange-600 font-normal">⚠ Super 승인 필요</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-500">
                    {inv.due_date ? formatDate(inv.due_date) : '-'}
                  </td>
                  <td className="px-6 py-3"><StatusBadge status={inv.status === 'paid' ? 'completed' : inv.status} /></td>
                  <td className="px-6 py-3">
                    {inv.tax_invoice_id ? (
                      <span className="text-xs text-green-600 font-mono">{inv.tax_invoice_id.slice(0, 10)}</span>
                    ) : (
                      <span className="text-xs text-gray-400">미발행</span>
                    )}
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
