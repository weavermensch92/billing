import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function CustomerHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, org_id, role, name')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!member) redirect('/login')

  const [orgRes, balanceRes, discountRes, recentChargesRes, pendingApprovalsRes] = await Promise.all([
    supabase.from('orgs').select('name, self_approval_headroom_krw, self_approval_used_krw, billing_day_of_month').eq('id', member.org_id).single(),
    supabase.from('v_org_wallet_balance').select('*').eq('org_id', member.org_id).maybeSingle(),
    supabase.from('v_org_visible_discount').select('*').eq('org_id', member.org_id).maybeSingle(),
    supabase.from('wallet_charges').select('id, amount_krw_net, status, applied_at').eq('org_id', member.org_id).order('applied_at', { ascending: false }).limit(3),
    supabase.from('v_pending_approvals').select('account_id').eq('org_id', member.org_id),
  ])

  const org = orgRes.data as { name: string; self_approval_headroom_krw: number; self_approval_used_krw: number; billing_day_of_month: number } | null
  const balance = balanceRes.data as { remaining_krw?: number; next_expiring_at?: string } | null
  const discount = discountRes.data as { discount_rate: number; period_end_at: string; days_until_review: number } | null
  const recentCharges = recentChargesRes.data ?? []
  const pendingApprovals = pendingApprovalsRes.data ?? []

  const orgHeadroom = org?.self_approval_headroom_krw ?? 0
  const orgUsed = org?.self_approval_used_krw ?? 0
  const headroomRemaining = Math.max(0, orgHeadroom - orgUsed)
  const isAdmin = member.role === 'owner' || member.role === 'admin'

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <div>
        <div className="text-xs text-gray-500">{org?.name}</div>
        <h1 className="text-2xl font-semibold">안녕하세요, {member.name}</h1>
      </div>

      {pendingApprovals.length > 0 && isAdmin && (
        <Link href="/org/members" className="block border-l-[3px] border-l-yellow-500 pl-4 py-3 bg-yellow-50 hover:bg-yellow-100">
          <div className="text-sm font-medium">24h 검수 대기: {pendingApprovals.length}건</div>
          <div className="text-xs text-gray-600 mt-1">새 멤버가 워크스페이스에 추가되었습니다. 결정하지 않으면 24h 후 자동 active 됩니다.</div>
        </Link>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card label="잔액" value={balance?.remaining_krw ?? 0} href="/billing/wallet" />
        <Card label="Org headroom 잔여" value={headroomRemaining} sub={`결제일: 매월 ${org?.billing_day_of_month ?? 1}일`} href="/billing/teams" />
        <Card
          label="할인 정책"
          custom={discount ? `${(discount.discount_rate * 100).toFixed(0)}%` : '미적용'}
          sub={discount ? `검토 알림: D-${discount.days_until_review}` : '–'}
        />
      </div>

      {balance?.next_expiring_at && (
        <div className="text-xs text-gray-500">
          가장 빠른 잔액 만료: {new Date(balance.next_expiring_at).toLocaleDateString('ko-KR')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">최근 충전</h2>
            {isAdmin && <Link href="/billing/charge" className="text-xs text-gray-500 hover:underline">신청 →</Link>}
          </div>
          <div className="space-y-2">
            {recentCharges.length === 0 && <div className="text-sm text-gray-400 py-4">충전 이력 없음</div>}
            {recentCharges.map((c: { id: string; amount_krw_net: number; status: string; applied_at: string }) => (
              <div key={c.id} className="flex justify-between text-sm border-b border-gray-100 py-2">
                <span className="text-xs text-gray-500 font-mono">{new Date(c.applied_at).toLocaleDateString('ko-KR')}</span>
                <span className="font-mono">₩{c.amount_krw_net.toLocaleString('ko-KR')}</span>
                <span className="text-xs text-gray-500">{c.status}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium mb-3">바로가기</h2>
          <div className="space-y-2 text-sm">
            <QuickLink href="/billing/api-keys" label="API 키 발급·관리" />
            <QuickLink href="/billing/cards" label="카드" />
            <QuickLink href="/services/new" label="신규 계정 신청" />
            {isAdmin && <QuickLink href="/billing/teams" label="팀 헤드룸 분배" />}
            {isAdmin && <QuickLink href="/org/members" label="멤버 관리" />}
          </div>
        </section>
      </div>
    </div>
  )
}

function Card({ label, value, custom, sub, href }: { label: string; value?: number; custom?: string; sub?: string; href?: string }) {
  const body = (
    <div className="border border-gray-200 p-5">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-3xl font-mono mt-1">
        {custom ?? `₩${(value ?? 0).toLocaleString('ko-KR')}`}
      </div>
      {sub && <div className="text-xs text-gray-500 mt-2">{sub}</div>}
    </div>
  )
  return href ? <Link href={href} className="block hover:bg-gray-50">{body}</Link> : body
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="block border border-gray-200 px-4 py-3 hover:bg-gray-50">
      {label} →
    </Link>
  )
}
