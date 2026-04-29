import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { NotificationBell } from '@/components/customer/notification-bell'
import { HeadroomBadge } from '@/components/customer/headroom-badge'

const NAV_ITEMS = [
  { href: '/home',     label: '홈' },
  { href: '/services', label: '서비스 관리' },
  { href: '/requests', label: '요청 내역' },
  { href: '/org/members', label: '멤버' },
]

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members').select('id, org_id, role').eq('user_id', user.id).eq('status', 'active').single()

  // 미읽음 메시지 카운트 + 자율 승인 잔액
  let unreadCount = 0
  let headroomKrw = 0
  let headroomUsed = 0
  if (member) {
    const [unreadRes, orgRes] = await Promise.all([
      supabase
        .from('request_messages')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', member.org_id)
        .eq('sender_type', 'admin')
        .is('read_by_member_at', null),
      supabase
        .from('orgs')
        .select('self_approval_headroom_krw, self_approval_used_krw')
        .eq('id', member.org_id)
        .single(),
    ])
    unreadCount = unreadRes.count ?? 0
    const org = (orgRes.data as { self_approval_headroom_krw?: number; self_approval_used_krw?: number } | null) ?? {}
    headroomKrw = org.self_approval_headroom_krw ?? 0
    headroomUsed = org.self_approval_used_krw ?? 0
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 내비게이션 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/home" className="flex items-center gap-2">
                <span className="font-bold text-brand-700 text-lg">Gridge</span>
                <span className="text-xs text-gray-400 font-mono">Billing MSP</span>
              </Link>
              <nav className="hidden md:flex items-center gap-6">
                {NAV_ITEMS.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              {member && (
                <HeadroomBadge
                  headroomKrw={headroomKrw}
                  usedKrw={headroomUsed}
                  role={(member as { role: 'owner' | 'admin' | 'member' }).role}
                />
              )}
              {member && (
                <NotificationBell
                  orgId={member.org_id}
                  memberId={member.id}
                  initialUnreadCount={unreadCount}
                />
              )}
              <span className="text-xs text-gray-500">{user.email}</span>
              <form action="/auth/signout" method="post">
                <button type="submit" className="text-xs text-gray-400 hover:text-gray-600">
                  로그아웃
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
