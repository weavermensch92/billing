import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { NewOrgWizard } from './wizard'

export default async function NewOrgPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  // 보안: Super 권한만 허용 (G-049 특수 행위 — 고객사 생성)
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('email', user.email ?? '')
    .eq('is_active', true)
    .single()

  if (!adminUser) redirect('/console/login')
  if (adminUser.role !== 'super') {
    redirect('/console/orgs?error=' + encodeURIComponent('Super 권한이 필요합니다.'))
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/console/orgs" className="text-sm text-gray-500 hover:text-gray-700">
        ← 고객사 목록
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">신규 고객사 등록</h1>
        <p className="text-sm text-gray-500 mt-1">
          계약 체결 후 Gridge Billing MSP 서비스를 시작하기 위한 절차입니다.
          이후 각 단계는 Immutable 감사 로그에 기록됩니다.
        </p>
      </div>

      {searchParams.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      <NewOrgWizard />
    </div>
  )
}
