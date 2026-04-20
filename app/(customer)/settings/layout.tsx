import Link from 'next/link'

const SETTINGS_NAV = [
  { href: '/settings/notifications', label: '알림' },
  { href: '/settings/security',      label: '보안 · 2FA' },
  { href: '/settings/audit-log',     label: '감사 로그' },
  { href: '/settings/data-export',   label: '데이터 내보내기' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
      <aside>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">설정</h2>
        <nav className="space-y-1">
          {SETTINGS_NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <section>{children}</section>
    </div>
  )
}
