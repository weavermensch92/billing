import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDateTime } from '@/lib/utils/format'
import { ACTION_TYPE_LABELS } from '@/types/request.types'
import type { ActionRequest } from '@/types/billing.types'
// Omit 사용으로 불필요한 경고 억제
export const dynamic = 'force-dynamic'

type Filter = 'pending' | 'in_review' | 'awaiting_customer' | 'all'

const FILTER_TABS: { id: Filter; label: string }[] = [
  { id: 'pending',           label: '대기' },
  { id: 'in_review',         label: '검토 중' },
  { id: 'awaiting_customer', label: '고객 확인 대기' },
  { id: 'all',               label: '전체 (활성)' },
]

interface RequestWithOrg extends Omit<ActionRequest, 'requester' | 'assigned_admin'> {
  org: { name: string } | null
  requester: { name: string; email: string } | null
}

export default async function ConsoleRequestsPage({
  searchParams,
}: {
  searchParams: { tab?: Filter }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const activeTab = searchParams.tab ?? 'pending'

  let query = supabase
    .from('action_requests')
    .select('*, org:orgs!org_id(name), requester:members!requester_id(name, email)')
    .order('sla_deadline', { ascending: true, nullsFirst: false })

  if (activeTab === 'all') {
    query = query.in('status', ['pending', 'in_review', 'awaiting_customer'])
  } else {
    query = query.eq('status', activeTab)
  }

  const { data: requests } = await query
  const list = (requests ?? []) as unknown as RequestWithOrg[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">요청 처리 큐</h1>
        <p className="text-sm text-gray-500 mt-1">SLA 순으로 정렬 · 위에서부터 처리하세요.</p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {FILTER_TABS.map(t => (
            <Link
              key={t.id}
              href={`/console/requests?tab=${t.id}`}
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

      {list.length === 0 ? (
        <div className="card p-12 text-center text-sm text-gray-400">
          해당 상태의 요청이 없습니다.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">SLA</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">유형</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">고객사</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">요청자</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">경로</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map(req => {
                const isUrgent = req.sla_deadline
                  && new Date(req.sla_deadline) <= new Date(Date.now() + 4 * 3600 * 1000)
                return (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      {req.sla_deadline ? (
                        <div className="flex items-center gap-2">
                          {isUrgent && <span className="w-2 h-2 rounded-full bg-red-500" />}
                          <span className="text-xs text-gray-500">{formatDateTime(req.sla_deadline)}</span>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-3">
                      <Link href={`/console/requests/${req.id}`} className="hover:text-brand-600">
                        <span className="text-lg mr-2">{ACTION_TYPE_LABELS[req.action_type].icon}</span>
                        <span className="font-medium">{ACTION_TYPE_LABELS[req.action_type].label}</span>
                      </Link>
                    </td>
                    <td className="px-6 py-3">{req.org?.name ?? '-'}</td>
                    <td className="px-6 py-3 text-gray-600">
                      {req.requester?.name ?? '-'}
                      <span className="block text-xs text-gray-400">{req.requester?.email}</span>
                    </td>
                    <td className="px-6 py-3">
                      {req.path_type ? (
                        <span className={`text-xs font-medium ${req.path_type === 'fast' ? 'text-green-600' : 'text-blue-600'}`}>
                          {req.path_type === 'fast' ? 'Fast' : 'Full'}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-3"><StatusBadge status={req.status} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
