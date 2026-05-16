import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

interface InvoiceRow {
  id: string
  vendor: string
  org_id: string
  billing_period_start: string
  billing_period_end: string
  total_usd: number
  total_krw: number
  match_status: string
  matched_card_charge_krw: number | null
  match_diff_krw: number | null
  fetched_at: string
  matched_at: string | null
  org?: { name?: string }
}

export default async function VendorInvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: admin } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!admin) redirect('/console/login')

  const { data: invoices } = await supabase
    .from('vendor_invoices')
    .select('*, org:orgs(name)')
    .order('fetched_at', { ascending: false })
    .limit(50)

  const rows = (invoices ?? []) as InvoiceRow[]
  const pendingCount = rows.filter((r) => r.match_status === 'pending').length
  const mismatchedCount = rows.filter((r) => r.match_status === 'mismatched' || r.match_status === 'partial').length

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">벤더 청구서</h1>
        <div className="flex gap-3 text-sm">
          <span>대기 <span className="font-mono">{pendingCount}</span></span>
          <span className="text-red-600">불일치 <span className="font-mono">{mismatchedCount}</span></span>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-xs text-gray-500 border-b">
          <tr>
            <th className="py-2">벤더</th>
            <th className="py-2">Org</th>
            <th className="py-2">기간</th>
            <th className="py-2 text-right">청구액 (USD)</th>
            <th className="py-2 text-right">청구액 (KRW)</th>
            <th className="py-2 text-right">카드 거래</th>
            <th className="py-2 text-right">차액</th>
            <th className="py-2">상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={8} className="py-8 text-center text-gray-400">청구서 없음</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-100">
              <td className="py-2">{r.vendor}</td>
              <td className="py-2">{r.org?.name ?? r.org_id.slice(0, 8)}</td>
              <td className="py-2 font-mono text-xs">
                {r.billing_period_start.slice(0, 7)} ~ {r.billing_period_end.slice(8, 10)}
              </td>
              <td className="py-2 text-right font-mono">${r.total_usd.toFixed(2)}</td>
              <td className="py-2 text-right font-mono">₩{r.total_krw.toLocaleString('ko-KR')}</td>
              <td className="py-2 text-right font-mono">
                {r.matched_card_charge_krw != null ? `₩${r.matched_card_charge_krw.toLocaleString('ko-KR')}` : '–'}
              </td>
              <td className={`py-2 text-right font-mono ${r.match_diff_krw && Math.abs(r.match_diff_krw) > 10000 ? 'text-red-600' : ''}`}>
                {r.match_diff_krw != null ? `₩${r.match_diff_krw.toLocaleString('ko-KR')}` : '–'}
              </td>
              <td className="py-2"><MatchBadge status={r.match_status} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-xs text-gray-500 border-l-[3px] border-l-gray-300 pl-3 py-2">
        매칭 임계: matched(&lt;1%), partial(&lt;5%), mismatched(≥5%). 자동 매칭은 일별 cron.
        mismatched는 슈퍼어드민 수동 검수 필요.
      </div>
    </div>
  )
}

function MatchBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pending:    { label: '대기',   color: 'text-yellow-700 bg-yellow-50' },
    matched:    { label: '일치',   color: 'text-green-700 bg-green-50' },
    partial:    { label: '부분',   color: 'text-orange-700 bg-orange-50' },
    mismatched: { label: '불일치', color: 'text-red-700 bg-red-50' },
    processed:  { label: '처리됨', color: 'text-gray-700 bg-gray-100' },
  }
  const s = map[status] ?? { label: status, color: 'text-gray-600 bg-gray-50' }
  return <span className={`px-2 py-0.5 text-xs ${s.color}`}>{s.label}</span>
}
