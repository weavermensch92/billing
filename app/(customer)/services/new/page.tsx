import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RequestWizard } from './wizard'
import type { ActionType } from '@/types/billing.types'

/**
 * v2.0 재작성 — 기존 wizard.tsx 활용.
 * 추가 컨텍스트: 첫 active accounts 생성 시 discount_policy 자동 트리거 (M-1002).
 * 카드 등록은 Idea 1 (수동 가이드) — wizard 내 안내 + 발급 후 /services/[id]/replace 진행.
 */
export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: { type?: ActionType; account_id?: string; error?: string }
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

  const [servicesRes, membersRes, accountsRes, orgRes, balanceRes] = await Promise.all([
    supabase
      .from('services')
      .select('id, name, vendor, category, tos_review_status, unit_price_krw')
      .in('tos_review_status', ['approved', 'conditional'])
      .eq('is_active', true)
      .order('vendor'),
    supabase.from('members').select('id, name, email, role').eq('org_id', member.org_id).eq('status', 'active').order('role'),
    supabase
      .from('accounts')
      .select('id, status, monthly_limit_krw, service:services!service_id(name, vendor), member:members!member_id(name)')
      .eq('org_id', member.org_id)
      .eq('status', 'active'),
    supabase
      .from('orgs')
      .select('self_approval_headroom_krw, self_approval_used_krw, default_discount_rate, billing_day_of_month')
      .eq('id', member.org_id)
      .single(),
    supabase.from('v_org_wallet_balance').select('remaining_krw').eq('org_id', member.org_id).maybeSingle(),
  ])

  const org = (orgRes.data ?? {}) as Record<string, number | undefined>
  const orgHeadroom = org.self_approval_headroom_krw ?? 0
  const orgUsed = org.self_approval_used_krw ?? 0
  const headroomRemaining = Math.max(0, orgHeadroom - orgUsed)
  const walletRemaining = (balanceRes.data as { remaining_krw?: number } | null)?.remaining_krw ?? 0

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">신규 요청</h1>
        <div className="text-xs text-gray-500 mt-1">
          잔액 ₩{walletRemaining.toLocaleString('ko-KR')} · Org headroom 잔여 ₩{headroomRemaining.toLocaleString('ko-KR')}
        </div>
      </div>

      {searchParams.error && (
        <div className="border-l-[3px] border-l-red-500 pl-3 py-2 text-sm text-red-700 bg-red-50">
          {decodeURIComponent(searchParams.error)}
        </div>
      )}

      <RequestWizard
        currentMemberRole={member.role as 'owner' | 'admin' | 'member'}
        services={servicesRes.data ?? []}
        members={membersRes.data ?? []}
        accounts={accountsRes.data ?? []}
        headroomKrw={orgHeadroom}
        headroomRemainingKrw={headroomRemaining}
        initialType={searchParams.type ?? 'new_account'}
        initialAccountId={searchParams.account_id ?? undefined}
      />

      <div className="border border-gray-200 p-4 bg-gray-50 text-xs space-y-1">
        <div>v2.0 안내</div>
        <div>· 신규 계정의 첫 active 전이 시 6개월 할인 정책이 자동 시작됩니다.</div>
        <div>· 카드 등록은 Idea 1 (벤더 콘솔에서 수동 입력) 흐름입니다. 발급 후 /services/[id] 에서 진행.</div>
        <div>· 결제일: 매월 {org.billing_day_of_month ?? 1}일 헤드룸 리셋.</div>
      </div>
    </div>
  )
}
