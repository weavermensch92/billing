import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatKrw, formatDateTime } from '@/lib/utils/format'
import type { Account, ActionRequest, Invoice, CreditBack } from '@/types/billing.types'

async function getHomeData(orgId: string) {
  const supabase = await createClient()

  const [accountsRes, requestsRes, invoiceRes, creditBackRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, status')
      .eq('org_id', orgId),
    supabase
      .from('action_requests')
      .select('id, action_type, status, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('invoices')
      .select('id, billing_month, total_due_krw, status')
      .eq('org_id', orgId)
      .order('billing_month', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('credit_backs')
      .select('id, month_seq, credit_amount_krw, is_final')
      .eq('org_id', orgId)
      .order('month_seq', { ascending: false })
      .limit(1)
      .single(),
  ])

  return {
    accounts: (accountsRes.data ?? []) as Pick<Account, 'id' | 'status'>[],
    recentRequests: (requestsRes.data ?? []) as Pick<ActionRequest, 'id' | 'action_type' | 'status' | 'created_at'>[],
    latestInvoice: invoiceRes.data as Pick<Invoice, 'id' | 'billing_month' | 'total_due_krw' | 'status'> | null,
    creditBack: creditBackRes.data as Pick<CreditBack, 'id' | 'month_seq' | 'credit_amount_krw' | 'is_final'> | null,
  }
}

const ACTION_LABEL: Record<string, string> = {
  new_account:      '신규 계정 요청',
  terminate:        '계정 해지 요청',
  limit_change:     '한도 변경 요청',
  vcn_replace:      'VCN 교체 요청',
  decline_response: '결제 거절 대응',
  bulk_terminate:   '일괄 해지 요청',
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 현재 멤버 소속 조직 확인
  const { data: member } = await supabase
    .from('members')
    .select('org_id, name, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!member) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">소속 조직이 없습니다. 담당자에게 문의해 주세요.</p>
        <p className="text-xs text-gray-400 mt-2">support@gridge.ai</p>
      </div>
    )
  }

  const { accounts, recentRequests, latestInvoice, creditBack } = await getHomeData(member.org_id)

  const activeAccounts = accounts.filter(a => a.status === 'active').length
  const pendingRequests = recentRequests.filter(r => ['pending','in_review'].includes(r.status)).length
  const creditBackSeq = creditBack?.month_seq ?? 0

  const stats = [
    {
      label: '활성 계정',
      value: `${activeAccounts}개`,
      subLabel: `전체 ${accounts.length}개`,
    },
    {
      label: '이번 달 청구 예상',
      value: latestInvoice ? formatKrw(latestInvoice.total_due_krw) : '-',
      subLabel: latestInvoice?.billing_month ?? '청구서 없음',
    },
    {
      label: '진행 중인 요청',
      value: `${pendingRequests}건`,
      subLabel: pendingRequests > 0 ? '처리 중' : '없음',
    },
    {
      label: '크레딧백 진행',
      value: creditBackSeq > 0 ? `M${creditBackSeq} / M6` : '미시작',
      subLabel: creditBack ? formatKrw(creditBack.credit_amount_krw) + ' 적용' : '-',
    },
  ]

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">안녕하세요, {member.name}님</h1>
        <p className="text-sm text-gray-500 mt-1">AI 서비스 현황을 한눈에 확인하세요.</p>
      </div>

      {/* StatCard 4개 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* 최근 활동 */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">최근 요청 내역</h2>
        </div>
        {recentRequests.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            요청 내역이 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentRequests.map((req) => (
              <li key={req.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {ACTION_LABEL[req.action_type] ?? req.action_type}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(req.created_at)}</p>
                </div>
                <StatusBadge status={req.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
