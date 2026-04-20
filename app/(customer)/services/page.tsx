import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatKrw } from '@/lib/utils/format'
import type { Account, ServiceCategory } from '@/types/billing.types'

const TABS: { id: ServiceCategory | 'all'; label: string }[] = [
  { id: 'all',           label: '전체' },
  { id: 'subscription',  label: '구독형' },
  { id: 'api',           label: 'API' },
  { id: 'agent_credit',  label: '에이전트 크레딧' },
]

interface AccountWithJoin {
  id: string
  org_id: string
  member_id: string
  service_id: string
  status: Account['status']
  monthly_limit_krw: number
  allow_overseas: boolean
  purpose: string | null
  activated_at: string | null
  terminated_at: string | null
  created_at: string
  updated_at: string
  member: { name: string; email: string } | null
  service: { name: string; vendor: string; category: ServiceCategory } | null
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!member) redirect('/login')

  const activeTab = (searchParams.tab ?? 'all') as ServiceCategory | 'all'

  let query = supabase
    .from('accounts')
    .select(`
      *,
      member:members!member_id(name, email),
      service:services!service_id(name, vendor, category)
    `)
    .eq('org_id', member.org_id)
    .order('created_at', { ascending: false })

  // Owner/Admin 은 전체, Member 는 본인만 (서버에서 처리 — G-052)
  if (member.role === 'member') {
    const { data: selfMember } = await supabase
      .from('members')
      .select('id')
      .eq('user_id', user.id)
      .single()
    if (selfMember) query = query.eq('member_id', selfMember.id)
  }

  const { data: accounts } = await query
  const allAccounts = (accounts ?? []) as unknown as AccountWithJoin[]

  const filtered = activeTab === 'all'
    ? allAccounts
    : allAccounts.filter(a => a.service?.category === activeTab)

  const counts = TABS.reduce<Record<string, number>>((acc, tab) => {
    acc[tab.id] = tab.id === 'all'
      ? allAccounts.length
      : allAccounts.filter(a => a.service?.category === tab.id).length
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">서비스 관리</h1>
        <Link
          href="/services/new"
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium
                     px-4 py-2 rounded-lg transition-colors"
        >
          + 신규 요청
        </Link>
      </div>

      {/* 4탭 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map(tab => (
            <Link
              key={tab.id}
              href={`/services?tab=${tab.id}`}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-gray-400">({counts[tab.id]})</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* 계정 카드 그리드 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          해당 카테고리의 계정이 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((account) => (
            <Link key={account.id} href={`/services/${account.id}`}>
              <div className="card p-5 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {account.service?.name ?? '-'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 capitalize">
                      {account.service?.vendor ?? '-'}
                    </p>
                  </div>
                  <StatusBadge status={account.status} />
                </div>

                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">사용자</span>
                    <span className="text-gray-900">{account.member?.name ?? '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">월 한도</span>
                    <span className="text-gray-900 font-mono">
                      {formatKrw(account.monthly_limit_krw)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">해외결제</span>
                    <span className={account.allow_overseas ? 'text-green-600' : 'text-gray-400'}>
                      {account.allow_overseas ? '허용' : '미허용'}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
