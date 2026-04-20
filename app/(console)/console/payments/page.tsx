import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { RealtimeTransactions } from '@/components/console/realtime-transactions'
import { formatKrw, formatDateTime } from '@/lib/utils/format'
import type { Transaction } from '@/types/billing.types'

type FilterTab = 'feed' | 'declined' | 'anomaly' | 'unsettled'

const TABS: { id: FilterTab; label: string; desc: string }[] = [
  { id: 'feed',      label: '실시간 피드',  desc: '최신 결제 스트림' },
  { id: 'declined',  label: '거절 큐',       desc: 'SLA 24h 기준 대응' },
  { id: 'anomaly',   label: '이상 이벤트',   desc: '자동 감지된 이상' },
  { id: 'unsettled', label: '매입 미확정',   desc: '정산 대기 거래' },
]

interface TxWithOrg extends Transaction {
  org?: { name: string } | null
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: { tab?: FilterTab }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const activeTab = searchParams.tab ?? 'feed'

  // Summary stats (실시간)
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()

  const [todayTxsRes, declinedTodayRes, pendingRes] = await Promise.all([
    supabase.from('transactions').select('amount_krw, status', { count: 'exact' }).gte('transacted_at', todayStart),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).gte('transacted_at', todayStart).eq('status', 'declined'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  const todayCount = todayTxsRes.count ?? 0
  const todayAmount = ((todayTxsRes.data ?? []) as { status: string; amount_krw: number }[])
    .filter(t => t.status === 'settled')
    .reduce((sum: number, t) => sum + t.amount_krw, 0)
  const declinedToday = declinedTodayRes.count ?? 0
  const pendingCount = pendingRes.count ?? 0
  const declineRate = todayCount > 0 ? ((declinedToday / todayCount) * 100).toFixed(1) : '0'

  // Feed
  let feedData: TxWithOrg[] = []
  if (activeTab === 'feed') {
    const { data } = await supabase
      .from('transactions')
      .select('*, org:orgs!org_id(name)')
      .order('transacted_at', { ascending: false })
      .limit(50)
    feedData = (data ?? []) as unknown as TxWithOrg[]
  }

  // Declined queue
  let declinedData: TxWithOrg[] = []
  if (activeTab === 'declined') {
    const { data } = await supabase
      .from('transactions')
      .select('*, org:orgs!org_id(name)')
      .eq('status', 'declined')
      .order('transacted_at', { ascending: false })
      .limit(100)
    declinedData = (data ?? []) as unknown as TxWithOrg[]
  }

  // Unsettled
  let unsettledData: TxWithOrg[] = []
  if (activeTab === 'unsettled') {
    const { data } = await supabase
      .from('transactions')
      .select('*, org:orgs!org_id(name)')
      .eq('status', 'pending')
      .order('transacted_at', { ascending: false })
      .limit(100)
    unsettledData = (data ?? []) as unknown as TxWithOrg[]
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">결제 모니터링</h1>
        <p className="text-sm text-gray-500 mt-1">실시간 결제 현황 + 거절 대응 SOP</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard label="오늘 결제 건수" value={`${todayCount}건`} subLabel={formatKrw(todayAmount) + ' 승인'} />
        <StatCard label="오늘 거절" value={`${declinedToday}건`}
                  trend={declinedToday > 0 ? 'down' : 'neutral'}
                  trendValue={`${declineRate}% 거절율`} />
        <StatCard label="미정산 (pending)" value={`${pendingCount}건`} />
        <StatCard label="실시간" value="ON" subLabel="Supabase Realtime" />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map(t => (
            <Link
              key={t.id}
              href={`/console/payments?tab=${t.id}`}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      <p className="text-xs text-gray-500">{TABS.find(t => t.id === activeTab)?.desc}</p>

      {/* Content */}
      <div className="card overflow-hidden">
        {activeTab === 'feed' && <RealtimeTransactions initial={feedData} />}

        {activeTab === 'declined' && (
          declinedData.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">거절된 결제가 없습니다. 🎉</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">시각</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">고객사</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">가맹점</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">금액</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">거절 사유</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {declinedData.map(tx => (
                  <tr key={tx.id} className="hover:bg-red-50">
                    <td className="px-6 py-3 text-xs text-gray-500">{formatDateTime(tx.transacted_at)}</td>
                    <td className="px-6 py-3">
                      <Link href={`/console/orgs/${tx.org_id}`} className="hover:text-brand-600">
                        {tx.org?.name ?? '-'}
                      </Link>
                    </td>
                    <td className="px-6 py-3 font-medium">{tx.merchant_name ?? '-'}</td>
                    <td className="px-6 py-3 text-right font-mono">{formatKrw(tx.amount_krw)}</td>
                    <td className="px-6 py-3 text-xs text-red-600">{tx.decline_reason ?? '사유 불명'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'unsettled' && (
          unsettledData.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">미정산 거래가 없습니다.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">시각</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">고객사</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">가맹점</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">금액</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {unsettledData.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-xs text-gray-500">{formatDateTime(tx.transacted_at)}</td>
                    <td className="px-6 py-3">{tx.org?.name ?? '-'}</td>
                    <td className="px-6 py-3 font-medium">{tx.merchant_name ?? '-'}</td>
                    <td className="px-6 py-3 text-right font-mono">{formatKrw(tx.amount_krw)}</td>
                    <td className="px-6 py-3"><StatusBadge status="pending" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'anomaly' && (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            <p>이상 감지 — Sprint 3 후반 anomaly_rules 활성화 예정</p>
            <p className="mt-1 text-xs text-gray-400">
              decline_burst / unusual_amount / vendor_anomaly 등 자동 탐지
            </p>
          </div>
        )}
      </div>

      {/* 거절 대응 SOP 링크 (decline-response.md 콘솔 임베드) */}
      {activeTab === 'declined' && declinedData.length > 0 && (
        <div className="card p-5 bg-blue-50 border-blue-200">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">📋 거절 대응 체크리스트</h3>
          <ol className="space-y-1 text-sm text-blue-800 list-decimal list-inside">
            <li>원인 파악 (한도/MCC/해외결제/카드사 이슈 구분)</li>
            <li>VCN 설정 변경 (카드사 포털)</li>
            <li>고객 Slack Connect으로 즉시 통지</li>
            <li>재결제 확인 (30분 내)</li>
            <li>5분 10건 이상 → Super 긴급 에스컬레이션</li>
          </ol>
          <p className="mt-3 text-xs text-blue-700">
            SLA: 24시간 내 대응. 상세: <code className="text-xs">playbook/decline-response.md</code>
          </p>
        </div>
      )}
    </div>
  )
}
