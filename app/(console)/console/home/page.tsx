import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function ConsoleHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: admin } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!admin) redirect('/console/login')

  const [pendingChargesRes, mismatchedInvoicesRes, pendingApprovalsRes, gracingOrgsRes, expiringCardsRes] = await Promise.all([
    supabase.from('action_requests').select('id', { count: 'exact', head: true }).eq('action_type', 'charge_request').in('status', ['pending', 'awaiting_gate']),
    supabase.from('vendor_invoices').select('id', { count: 'exact', head: true }).in('match_status', ['pending', 'partial', 'mismatched']),
    supabase.from('v_pending_approvals').select('account_id', { count: 'exact', head: true }),
    supabase.from('v_orgs_in_grace').select('org_id', { count: 'exact', head: true }),
    supabase.from('card_expiry_notifications').select('id', { count: 'exact', head: true }).in('notification_type', ['D-7', 'D-0', 'past_due']).eq('status', 'queued'),
  ])

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-semibold">콘솔</h1>

      <div className="grid grid-cols-3 gap-4">
        <ActionCard
          href="/console/charges"
          label="충전 컨펌 대기"
          count={pendingChargesRes.count ?? 0}
          subtitle="Gate #1 — 슈퍼어드민 컨펌 필요"
          urgent
        />
        <ActionCard
          href="/console/vendor-invoices"
          label="청구서 검수"
          count={mismatchedInvoicesRes.count ?? 0}
          subtitle="pending / partial / mismatched"
        />
        <ActionCard
          href="/console/sync"
          label="24h 검수 대기"
          count={pendingApprovalsRes.count ?? 0}
          subtitle="그림자 멤버 자동 등록 대기"
        />
        <ActionCard
          href="/console/orgs"
          label="해지 grace 진행 Org"
          count={gracingOrgsRes.count ?? 0}
          subtitle="결제일 도래 시 자동 정리"
        />
        <ActionCard
          href="/console/sync"
          label="카드 만료 임박"
          count={expiringCardsRes.count ?? 0}
          subtitle="D-7 / D-0 / past_due — AM 전화 푸시"
          urgent={(expiringCardsRes.count ?? 0) > 0}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <Link href="/console/orgs" className="border border-gray-200 px-4 py-3 hover:bg-gray-50">Org 관리 →</Link>
        <Link href="/console/vcn" className="border border-gray-200 px-4 py-3 hover:bg-gray-50">VCN 관리 →</Link>
        <Link href="/console/requests" className="border border-gray-200 px-4 py-3 hover:bg-gray-50">전체 요청 →</Link>
      </div>
    </div>
  )
}

function ActionCard({ href, label, count, subtitle, urgent }: { href: string; label: string; count: number; subtitle: string; urgent?: boolean }) {
  const borderColor = urgent && count > 0 ? 'border-l-red-500' : 'border-l-gray-300'
  return (
    <Link href={href} className={`block border border-gray-200 border-l-[3px] ${borderColor} p-5 hover:bg-gray-50`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-3xl font-mono mt-2 ${urgent && count > 0 ? 'text-red-600' : ''}`}>{count}</div>
      <div className="text-xs text-gray-500 mt-2">{subtitle}</div>
    </Link>
  )
}
