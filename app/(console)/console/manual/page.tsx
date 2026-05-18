import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { loadManualSections } from '@/lib/manual/parse'

export default async function ManualPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: me } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!me) redirect('/console/login')

  const sections = loadManualSections()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">콘솔 사용 설명서</h1>
        <p className="text-sm text-gray-500 mt-1">
          좌측에서 페이지를 선택하면 우측에 사용법이 표시됩니다.
          원본은 <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">docs/console-manual.md</code> — 추가/수정 시 빌드 후 자동 반영.
        </p>
      </div>

      <div className="flex gap-6">
        <nav className="w-56 shrink-0 sticky top-6 self-start">
          <div className="card p-3">
            <ul className="space-y-1 text-sm">
              {sections.map(s => (
                <li key={s.slug}>
                  <a
                    href={`#${s.slug}`}
                    className="block px-2 py-1 rounded hover:bg-gray-100 text-gray-700 hover:text-gray-900"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <main className="flex-1 space-y-10">
          {sections.map(s => (
            <section key={s.slug} id={s.slug} className="card p-6 scroll-mt-6">
              <h2 className="text-lg font-semibold text-gray-900 font-mono">{s.title}</h2>
              <div
                className="manual-body mt-4 text-sm text-gray-700"
                dangerouslySetInnerHTML={{ __html: s.bodyHtml }}
              />
            </section>
          ))}
        </main>
      </div>
    </div>
  )
}
