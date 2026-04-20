import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDateTime } from '@/lib/utils/format'
import { ACTION_TYPE_LABELS } from '@/types/request.types'
import type { ActionRequest } from '@/types/billing.types'

type FilterTab = 'active' | 'completed' | 'all'

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'active',    label: '진행 중' },
  { id: 'completed', label: '완료' },
  { id: 'all',       label: '전체' },
]

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: { tab?: FilterTab }
}) {
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

  const activeTab = searchParams.tab ?? 'active'

  let query = supabase
    .from('action_requests')
    .select('*')
    .eq('org_id', member.org_id)
    .order('created_at', { ascending: false })

  if (activeTab === 'active') {
    query = query.in('status', ['pending', 'in_review', 'awaiting_customer'])
  } else if (activeTab === 'completed') {
    query = query.in('status', ['approved', 'completed', 'rejected', 'cancelled'])
  }

  // Member는 본인 요청만
  if (member.role === 'member') {
    query = query.eq('requester_id', member.id)
  }

  const { data: requests } = await query
  const list = (requests ?? []) as ActionRequest[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">요청 내역</h1>
        <Link
          href="/services/new"
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          + 신규 요청
        </Link>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map(t => (
            <Link
              key={t.id}
              href={`/requests?tab=${t.id}`}
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
        <div className="card p-12 text-center">
          <p className="text-sm text-gray-500">
            {activeTab === 'active' ? '진행 중인 요청이 없습니다.' : '요청 내역이 없습니다.'}
          </p>
          <Link
            href="/services/new"
            className="mt-4 inline-block text-sm text-brand-600 hover:underline"
          >
            신규 요청 만들기 →
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {list.map(req => {
              const info = ACTION_TYPE_LABELS[req.action_type]
              return (
                <li key={req.id}>
                  <Link
                    href={`/requests/${req.id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl">{info.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{info.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDateTime(req.created_at)}
                          {req.sla_deadline && (
                            <span className="ml-2">· SLA: {formatDateTime(req.sla_deadline)}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={req.status} />
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
