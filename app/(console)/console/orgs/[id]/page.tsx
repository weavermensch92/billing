import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { StatCard } from '@/components/ui/stat-card'
import { formatKrw, formatDate, formatBillingMonth } from '@/lib/utils/format'
import type { Org, Member, Account, Invoice, ActionRequest } from '@/types/billing.types'

const TABS = ['overview', 'accounts', 'transactions', 'invoices', 'requests', 'members'] as const
type TabId = typeof TABS[number]

const TAB_LABEL: Record<TabId, string> = {
  overview:     'Overview',
  accounts:     '계정',
  transactions: '결제',
  invoices:     '청구서',
  requests:     '요청',
  members:      '멤버',
}

export default async function OrgDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string; created?: string; headroom_updated?: string; error?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: adminUser } = await supabase
    .from('admin_users').select('role').eq('email', user.email ?? '').eq('is_active', true).single()
  const isSuper = adminUser?.role === 'super'

  const { data: org } = await supabase
    .from('orgs')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!org) notFound()

  const orgData = org as Org
  const activeTab = (searchParams.tab ?? 'overview') as TabId

  // 탭별 데이터 병렬 로드
  const [membersRes, accountsRes, invoicesRes, requestsRes] = await Promise.all([
    supabase.from('members').select('*').eq('org_id', params.id).order('role'),
    supabase.from('accounts').select('*, service:services!service_id(name, vendor), member:members!member_id(name)').eq('org_id', params.id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('*').eq('org_id', params.id).order('billing_month', { ascending: false }).limit(12),
    supabase.from('action_requests').select('*').eq('org_id', params.id).order('created_at', { ascending: false }).limit(20),
  ])

  const members = (membersRes.data ?? []) as Member[]
  const accounts = (accountsRes.data ?? []) as unknown as Account[]
  const invoices = (invoicesRes.data ?? []) as Invoice[]
  const requests = (requestsRes.data ?? []) as ActionRequest[]

  const activeAccounts = accounts.filter(a => a.status === 'active').length
  const latestInvoice = invoices[0]
  const pendingRequests = requests.filter(r => ['pending','in_review'].includes(r.status)).length

  return (
    <div className="space-y-6">
      {searchParams.created && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          조직이 등록되었습니다. Owner 초대 이메일을 Luna에게 요청하세요.
          현재 status는 <strong>pending</strong>이며 Owner 가입 완료 시 자동 <strong>active</strong> 전환됩니다.
        </div>
      )}
      {searchParams.headroom_updated && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          자율 승인 한도가 변경되었습니다. 감사 로그에 기록되었습니다.
        </div>
      )}
      {searchParams.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/console/orgs" className="text-sm text-gray-500 hover:text-gray-700">
            ← 고객사 목록
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">{orgData.name}</h1>
          <p className="text-sm text-gray-500 font-mono">{orgData.business_reg_no}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={orgData.status} />
          <button className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">
            신규 요청 대신 제출
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map(tab => (
            <Link
              key={tab}
              href={`/console/orgs/${params.id}?tab=${tab}`}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {TAB_LABEL[tab]}
            </Link>
          ))}
        </nav>
      </div>

      {/* Overview 탭 */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 요약 StatCard */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="활성 계정" value={`${activeAccounts}개`} subLabel={`전체 ${accounts.length}개`} />
            <StatCard
              label="이번 달 청구 예상"
              value={latestInvoice ? formatKrw(latestInvoice.total_due_krw) : '-'}
              subLabel={latestInvoice ? formatBillingMonth(latestInvoice.billing_month) : '-'}
            />
            <StatCard label="진행 중인 요청" value={`${pendingRequests}건`} />
          </div>

          {/* 계약 정보 */}
          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">계약 정보</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500">결제 티어</dt>
                <dd className="font-medium mt-0.5 capitalize">{orgData.plan}</dd>
              </div>
              <div>
                <dt className="text-gray-500">신용 한도</dt>
                <dd className="font-medium font-mono mt-0.5">{formatKrw(orgData.credit_limit_krw)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">예치금 잔액</dt>
                <dd className="font-medium font-mono mt-0.5">{formatKrw(orgData.deposit_remaining_krw)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">크레딧백 기간</dt>
                <dd className="font-medium mt-0.5">
                  {orgData.creditback_start_at
                    ? `${formatDate(orgData.creditback_start_at)} ~ ${orgData.creditback_end_at ? formatDate(orgData.creditback_end_at) : '진행 중'}`
                    : '미시작'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">인프라 모드</dt>
                <dd className="font-medium mt-0.5">Mode {orgData.infra_mode}</dd>
              </div>
              <div>
                <dt className="text-gray-500">등록일</dt>
                <dd className="font-medium mt-0.5">{formatDate(orgData.created_at)}</dd>
              </div>
            </dl>
          </div>

          {/* 자율 승인 한도 (Self-Approval Headroom) */}
          <div className="card p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">자율 승인 한도</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Admin이 AM 경유 없이 이 범위 내 요청을 즉시 승인 가능 · 매월 1일 리셋
                </p>
              </div>
              {isSuper && (
                <Link
                  href={`/console/orgs/${params.id}/headroom`}
                  className="text-xs font-medium px-3 py-1.5 border border-brand-600 text-brand-600 rounded hover:bg-brand-50"
                >
                  한도 조정
                </Link>
              )}
            </div>

            {(() => {
              const headroom = orgData.self_approval_headroom_krw ?? 0
              const used = orgData.self_approval_used_krw ?? 0
              const remaining = Math.max(0, headroom - used)
              const usedPct = headroom > 0 ? Math.round((used / headroom) * 100) : 0
              return (
                <>
                  <dl className="grid grid-cols-3 gap-4 text-sm mb-4">
                    <div>
                      <dt className="text-gray-500">월간 한도</dt>
                      <dd className="font-semibold font-mono mt-0.5">{formatKrw(headroom)}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">이번 달 사용</dt>
                      <dd className="font-semibold font-mono mt-0.5">{formatKrw(used)}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">남은 여유분</dt>
                      <dd className={`font-semibold font-mono mt-0.5 ${remaining > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                        {formatKrw(remaining)}
                      </dd>
                    </div>
                  </dl>
                  {headroom > 0 && (
                    <div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${usedPct >= 90 ? 'bg-red-500' : usedPct >= 70 ? 'bg-orange-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(usedPct, 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">사용률 {usedPct}%</p>
                    </div>
                  )}
                  {headroom === 0 && (
                    <p className="text-sm text-gray-500 italic">
                      비활성 상태 — Super가 한도를 할당하면 Admin 자율 승인이 활성화됩니다.
                    </p>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* 계정 탭 */}
      {activeTab === 'accounts' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">서비스</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">멤버</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">월 한도</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.map(account => (
                <tr key={account.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium">{(account as any).service?.name ?? '-'}</td>
                  <td className="px-6 py-3 text-gray-600">{(account as any).member?.name ?? '-'}</td>
                  <td className="px-6 py-3 font-mono">{formatKrw(account.monthly_limit_krw)}</td>
                  <td className="px-6 py-3"><StatusBadge status={account.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 청구서 탭 */}
      {activeTab === 'invoices' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">청구월</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">청구 금액</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">VAT</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">합계</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">상태</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">세금계산서</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium">{formatBillingMonth(inv.billing_month)}</td>
                  <td className="px-6 py-3 font-mono">{formatKrw(inv.subtotal_krw)}</td>
                  <td className="px-6 py-3 font-mono text-gray-500">{formatKrw(inv.vat_krw)}</td>
                  <td className="px-6 py-3 font-mono font-semibold">{formatKrw(inv.total_due_krw)}</td>
                  <td className="px-6 py-3"><StatusBadge status={inv.status} /></td>
                  <td className="px-6 py-3 text-gray-500">{inv.tax_invoice_id ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 멤버 탭 */}
      {activeTab === 'members' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">이름</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">이메일</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">역할</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium">{m.name}</td>
                  <td className="px-6 py-3 text-gray-600">{m.email}</td>
                  <td className="px-6 py-3">
                    <span className={`text-xs font-medium ${m.role === 'owner' ? 'text-brand-600' : 'text-gray-600'}`}>
                      {m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Admin' : 'Member'}
                    </span>
                  </td>
                  <td className="px-6 py-3"><StatusBadge status={m.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 요청 탭 */}
      {activeTab === 'requests' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">유형</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">경로</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">SLA</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map(req => (
                <tr key={req.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium capitalize">{req.action_type.replace('_', ' ')}</td>
                  <td className="px-6 py-3">
                    {req.path_type ? (
                      <span className={`text-xs font-medium ${req.path_type === 'fast' ? 'text-green-600' : 'text-blue-600'}`}>
                        {req.path_type === 'fast' ? 'Fast Path' : 'Full Path'}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-3 text-gray-500 text-xs">
                    {req.sla_deadline ? formatDate(req.sla_deadline) : '-'}
                  </td>
                  <td className="px-6 py-3"><StatusBadge status={req.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
