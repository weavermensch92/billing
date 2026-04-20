import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatKrw, formatDateTime } from '@/lib/utils/format'
import type { ActionRequest, AdminRole } from '@/types/billing.types'

const PRIORITY_LABEL: Record<string, string> = {
  new_account:      '신규 계정',
  terminate:        '계정 해지',
  limit_change:     '한도 변경',
  vcn_replace:      'VCN 교체',
  decline_response: '결제 거절',
  bulk_terminate:   '일괄 해지',
}

export default async function ConsoleHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('name, role')
    .eq('email', user.email ?? '')
    .eq('is_active', true)
    .single()

  if (!adminUser) redirect('/console/login?error=관리자 계정이 아닙니다.')

  const role = adminUser.role as AdminRole

  // 오늘 할 일 — 대기 중인 요청
  const { data: pendingRequests } = await supabase
    .from('action_requests')
    .select('id, org_id, action_type, status, sla_deadline, created_at')
    .in('status', ['pending','in_review'])
    .order('sla_deadline', { ascending: true, nullsFirst: false })
    .limit(10)

  // 담당 고객사 수
  const { count: orgCount } = await supabase
    .from('orgs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')

  // 이번 달 미발행 청구서
  const thisMonth = new Date().toISOString().slice(0, 7)
  const { count: draftInvoiceCount } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('billing_month', thisMonth)
    .eq('status', 'draft')

  const requests = (pendingRequests ?? []) as Pick<ActionRequest,
    'id' | 'org_id' | 'action_type' | 'status' | 'sla_deadline' | 'created_at'>[]

  const urgentCount = requests.filter(r => {
    if (!r.sla_deadline) return false
    return new Date(r.sla_deadline) <= new Date(Date.now() + 4 * 60 * 60 * 1000)
  }).length

  const stats = [
    { label: '처리 대기 요청', value: `${requests.length}건`, subLabel: urgentCount > 0 ? `긴급 ${urgentCount}건` : '양호', trend: urgentCount > 0 ? 'down' as const : 'neutral' as const },
    { label: '활성 고객사', value: `${orgCount ?? 0}개` },
    { label: '미발행 청구서', value: `${draftInvoiceCount ?? 0}건`, subLabel: thisMonth },
    { label: 'AM 역할', value: adminUser.name, subLabel: role.toUpperCase() },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          안녕하세요, {adminUser.name}
        </h1>
        <p className="text-sm text-gray-500 mt-1">오늘의 할 일을 확인하세요.</p>
      </div>

      {/* StatCard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* 요청 처리 큐 */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">처리 대기 요청</h2>
          <Link href="/console/requests" className="text-sm text-brand-600 hover:underline">
            전체 보기 →
          </Link>
        </div>

        {requests.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            처리 대기 중인 요청이 없습니다. 🎉
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {requests.slice(0, 5).map(req => {
              const isUrgent = req.sla_deadline
                && new Date(req.sla_deadline) <= new Date(Date.now() + 4 * 60 * 60 * 1000)
              return (
                <li key={req.id}>
                  <Link
                    href={`/console/requests/${req.id}`}
                    className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isUrgent && (
                        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {PRIORITY_LABEL[req.action_type] ?? req.action_type}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {req.sla_deadline
                            ? `SLA: ${formatDateTime(req.sla_deadline)}`
                            : formatDateTime(req.created_at)}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={req.status} />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 역할별 추가 섹션 */}
      {role === 'finance' && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Finance 할 일</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center gap-2">
              <span className="text-gray-400">□</span>
              {thisMonth} 청구서 검수 ({draftInvoiceCount ?? 0}건)
            </li>
            <li className="flex items-center gap-2">
              <span className="text-gray-400">□</span>
              수납 미매칭 확인 (오픈뱅킹)
            </li>
            <li className="flex items-center gap-2">
              <span className="text-gray-400">□</span>
              Smart Bill 발행 확인
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
