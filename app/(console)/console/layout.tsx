import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/console/home',     label: '홈' },
  { href: '/console/orgs',     label: '고객사' },
  { href: '/console/requests', label: '요청 큐' },
  { href: '/console/payments', label: '결제 모니터링' },
]

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  // admin_users 매칭 (user.email 기준)
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('name, role')
    .eq('email', user.email ?? '')
    .eq('is_active', true)
    .single()

  if (!adminUser) redirect('/console/login?error=관리자 계정이 아닙니다.')

  const roleLabel: Record<string, string> = {
    super: '슈퍼 어드민',
    am: 'AM',
    finance: 'Finance',
    ops: 'Ops',
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* 사이드바 */}
      <div className="flex">
        <aside className="w-56 min-h-screen bg-gray-800 border-r border-gray-700 fixed top-0 left-0">
          <div className="p-5 border-b border-gray-700">
            <p className="font-bold text-white">Gridge Console</p>
            <p className="text-xs text-gray-400 mt-1">Billing MSP 운영</p>
          </div>
          <nav className="p-4 space-y-1">
            {NAV_ITEMS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center px-3 py-2 text-sm text-gray-300
                           hover:bg-gray-700 hover:text-white rounded-lg transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700 space-y-2">
            <div>
              <p className="text-xs text-gray-400">{adminUser.name}</p>
              <p className="text-xs text-gray-500">{roleLabel[adminUser.role] ?? adminUser.role}</p>
            </div>
            <form action="/auth/signout?scope=console" method="post">
              <button type="submit" className="text-xs text-gray-500 hover:text-gray-300">
                로그아웃
              </button>
            </form>
          </div>
        </aside>

        {/* 메인 컨텐츠 */}
        <main className="flex-1 ml-56 bg-gray-50 text-gray-900 min-h-screen p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
