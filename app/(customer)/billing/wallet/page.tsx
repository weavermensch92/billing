import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

interface WalletCharge {
  id: string
  amount_krw_gross: number
  amount_krw_net: number
  amount_krw_used: number
  discount_rate: number
  status: string
  applied_at: string
  expires_at: string
  refundable: boolean
  exchange_rate_at_charge: number | null
}

interface VisibleDiscount {
  discount_rate: number
  period_end_at: string
  days_until_review: number
}

export default async function WalletPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, org_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!member) redirect('/login')

  const [balanceRes, chargesRes, discountRes] = await Promise.all([
    supabase.from('v_org_wallet_balance').select('*').eq('org_id', member.org_id).maybeSingle(),
    supabase.from('wallet_charges').select('*').eq('org_id', member.org_id).order('applied_at', { ascending: false }).limit(20),
    supabase.from('v_org_visible_discount').select('*').eq('org_id', member.org_id).maybeSingle(),
  ])

  const balance = balanceRes.data as { remaining_krw?: number; next_expiring_at?: string } | null
  const charges = (chargesRes.data ?? []) as WalletCharge[]
  const discount = discountRes.data as VisibleDiscount | null
  const remaining = balance?.remaining_krw ?? 0

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">잔액</h1>
        {(member.role === 'owner' || member.role === 'admin') && (
          <Link href="/billing/charge" className="px-4 py-2 bg-black text-white text-sm">
            충전 신청
          </Link>
        )}
      </div>

      <div className="border border-gray-200 p-6">
        <div className="text-sm text-gray-500">사용 가능 잔액</div>
        <div className="text-4xl font-mono mt-2">₩{remaining.toLocaleString('ko-KR')}</div>
        {balance?.next_expiring_at && (
          <div className="text-sm text-gray-500 mt-2">
            가장 빠른 만료: {new Date(balance.next_expiring_at).toLocaleDateString('ko-KR')}
          </div>
        )}
      </div>

      {discount && (
        <div className="border-l-[3px] border-l-black pl-4 py-3 bg-gray-50">
          <div className="text-sm font-medium">
            할인 적용 중: <span className="font-mono">{(discount.discount_rate * 100).toFixed(0)}%</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            검토 알림 기준일: {new Date(discount.period_end_at).toLocaleDateString('ko-KR')}
            {discount.days_until_review > 0 && ` (D-${discount.days_until_review})`}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-medium mb-3">충전 이력</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500 border-b">
            <tr>
              <th className="py-2">신청일</th>
              <th className="py-2 text-right">신청액</th>
              <th className="py-2 text-right">할인율</th>
              <th className="py-2 text-right">발행액</th>
              <th className="py-2 text-right">사용액</th>
              <th className="py-2">상태</th>
              <th className="py-2">만료일</th>
            </tr>
          </thead>
          <tbody>
            {charges.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-gray-400">충전 이력 없음</td></tr>
            )}
            {charges.map((c) => (
              <tr key={c.id} className="border-b border-gray-100">
                <td className="py-2 font-mono text-xs">{new Date(c.applied_at).toLocaleDateString('ko-KR')}</td>
                <td className="py-2 text-right font-mono">₩{c.amount_krw_gross.toLocaleString('ko-KR')}</td>
                <td className="py-2 text-right font-mono">{(c.discount_rate * 100).toFixed(0)}%</td>
                <td className="py-2 text-right font-mono">₩{c.amount_krw_net.toLocaleString('ko-KR')}</td>
                <td className="py-2 text-right font-mono">₩{c.amount_krw_used.toLocaleString('ko-KR')}</td>
                <td className="py-2"><StatusBadge status={c.status} /></td>
                <td className="py-2 font-mono text-xs">{new Date(c.expires_at).toLocaleDateString('ko-KR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pending:   { label: '대기',  color: 'text-yellow-700 bg-yellow-50' },
    active:    { label: '활성',  color: 'text-green-700 bg-green-50' },
    exhausted: { label: '소진',  color: 'text-gray-700 bg-gray-100' },
    expired:   { label: '만료',  color: 'text-red-700 bg-red-50' },
    refunded:  { label: '환불',  color: 'text-blue-700 bg-blue-50' },
    rejected:  { label: '거부',  color: 'text-red-700 bg-red-50' },
  }
  const s = map[status] ?? { label: status, color: 'text-gray-600 bg-gray-50' }
  return <span className={`px-2 py-0.5 text-xs ${s.color}`}>{s.label}</span>
}
