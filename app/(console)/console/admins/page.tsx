import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/format'

interface AdminRow {
  id: string
  email: string
  name: string
  role: 'super' | 'am' | 'finance' | 'ops'
  is_active: boolean
  totp_secret: string | null
  last_login_at: string | null
  created_at: string
}

const ROLE_LABEL: Record<AdminRow['role'], string> = {
  super: '슈퍼 어드민',
  am: 'AM',
  finance: 'Finance',
  ops: 'Ops',
}

export default async function AdminsPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: me } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('email', user.email ?? '')
    .eq('is_active', true)
    .maybeSingle()
  if (!me) redirect('/console/login')

  const isSuper = me.role === 'super'

  const { data: admins } = await supabase
    .from('admin_users')
    .select('id, email, name, role, is_active, totp_secret, last_login_at, created_at')
    .order('created_at', { ascending: false })

  const list = (admins ?? []) as AdminRow[]
  const activeSuperCount = list.filter(a => a.role === 'super' && a.is_active).length

  return (
    <div className="space-y-6">
      {searchParams.error && (
        <div className="border-l-[3px] border-l-red-500 pl-3 py-2 text-sm text-red-700 bg-red-50">
          {decodeURIComponent(searchParams.error)}
        </div>
      )}
      {searchParams.ok && (
        <div className="border-l-[3px] border-l-green-500 pl-3 py-2 text-sm text-green-700 bg-green-50">
          {decodeURIComponent(searchParams.ok)}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">관리자 계정</h1>
          <p className="text-xs text-gray-500 mt-1">
            콘솔 운영 계정 · 활성 Super {activeSuperCount}명 (최소 1명 보장)
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">총 {list.length}명</span>
          {isSuper ? (
            <Link
              href="/console/admins/new"
              className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              + 신규 초대
            </Link>
          ) : (
            <span className="text-xs text-gray-400">초대는 Super 권한 필요</span>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">이름 / 이메일</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">역할</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">2FA</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">상태</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">최근 로그인</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">생성일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                  관리자 계정이 없습니다.
                </td>
              </tr>
            ) : (
              list.map(a => {
                const isMe = a.id === me.id
                return (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      {isSuper ? (
                        <Link href={`/console/admins/${a.id}`} className="hover:text-brand-600">
                          <p className="font-medium text-gray-900">
                            {a.name}
                            {isMe && <span className="ml-2 text-xs text-gray-400">(나)</span>}
                          </p>
                          <p className="text-xs text-gray-400">{a.email}</p>
                        </Link>
                      ) : (
                        <>
                          <p className="font-medium text-gray-900">
                            {a.name}
                            {isMe && <span className="ml-2 text-xs text-gray-400">(나)</span>}
                          </p>
                          <p className="text-xs text-gray-400">{a.email}</p>
                        </>
                      )}
                    </td>
                    <td className="px-6 py-4">{ROLE_LABEL[a.role] ?? a.role}</td>
                    <td className="px-6 py-4 text-xs">
                      {a.totp_secret ? (
                        <span className="text-green-600">등록됨</span>
                      ) : (
                        <span className="text-gray-400">미등록</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {a.is_active ? (
                        <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded">활성</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">비활성</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {a.last_login_at ? formatDate(a.last_login_at) : '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(a.created_at)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
