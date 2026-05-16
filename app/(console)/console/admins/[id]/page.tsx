import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/format'
import { updateAdminRole, toggleAdminActive } from './actions'

interface AdminDetail {
  id: string
  email: string
  name: string
  role: 'super' | 'am' | 'finance' | 'ops'
  is_active: boolean
  totp_secret: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
}

const ROLE_OPTIONS: { value: AdminDetail['role']; label: string }[] = [
  { value: 'am',      label: 'AM' },
  { value: 'finance', label: 'Finance (2FA 필수)' },
  { value: 'ops',     label: 'Ops' },
  { value: 'super',   label: 'Super (모든 권한 + 관리자 계정 관리, 2FA 필수)' },
]

export default async function AdminDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
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

  if (me.role !== 'super') {
    redirect('/console/admins?error=' + encodeURIComponent(`관리자 상세는 Super 권한 필요 (현재 역할: ${me.role})`))
  }

  const { data: target } = await supabase
    .from('admin_users')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()
  if (!target) notFound()
  const t = target as AdminDetail

  // 활성 super 카운트 — "최소 1명 Super 보장" 가드용
  const { count: activeSuperCount } = await supabase
    .from('admin_users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'super')
    .eq('is_active', true)

  const isLastActiveSuper = t.role === 'super' && t.is_active && (activeSuperCount ?? 0) <= 1
  const isMe = t.id === me.id

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <Link href="/console/admins" className="text-xs text-gray-500 hover:underline">
          ← 관리자 목록
        </Link>
        <h1 className="text-2xl font-semibold mt-2">
          {t.name}
          {isMe && <span className="ml-2 text-sm text-gray-400">(나)</span>}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{t.email}</p>
      </div>

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

      <div className="card p-6 bg-white space-y-4">
        <h2 className="text-base font-semibold text-gray-900">기본 정보</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-gray-500">현재 역할</dt>
            <dd className="font-medium">{t.role}</dd>
          </div>
          <div>
            <dt className="text-gray-500">상태</dt>
            <dd>
              {t.is_active ? (
                <span className="text-green-600">활성</span>
              ) : (
                <span className="text-gray-500">비활성</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">2FA</dt>
            <dd>{t.totp_secret ? <span className="text-green-600">등록됨</span> : <span className="text-gray-400">미등록</span>}</dd>
          </div>
          <div>
            <dt className="text-gray-500">최근 로그인</dt>
            <dd>{t.last_login_at ? formatDate(t.last_login_at) : '-'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">생성일</dt>
            <dd>{formatDate(t.created_at)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">최종 수정</dt>
            <dd>{formatDate(t.updated_at)}</dd>
          </div>
        </dl>
      </div>

      {/* 역할 변경 */}
      <form action={updateAdminRole} className="card p-6 bg-white space-y-4">
        <h2 className="text-base font-semibold text-gray-900">역할 변경</h2>
        <input type="hidden" name="admin_id" value={t.id} />

        <div className="space-y-2">
          {ROLE_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-3 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
            >
              <input
                type="radio"
                name="role"
                value={opt.value}
                defaultChecked={opt.value === t.role}
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>

        {isLastActiveSuper && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            현재 마지막 활성 Super 입니다. Super 외 역할로 변경할 수 없습니다.
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            역할 저장
          </button>
        </div>
      </form>

      {/* 활성 / 비활성 토글 */}
      <form action={toggleAdminActive} className="card p-6 bg-white space-y-3">
        <h2 className="text-base font-semibold text-gray-900">계정 상태</h2>
        <input type="hidden" name="admin_id" value={t.id} />
        <input type="hidden" name="next_active" value={t.is_active ? 'false' : 'true'} />

        <p className="text-xs text-gray-500">
          비활성 계정은 로그인할 수 없으며, 콘솔의 모든 작업에서 제외됩니다.
        </p>

        {isLastActiveSuper && t.is_active && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            마지막 활성 Super 는 비활성화할 수 없습니다.
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isLastActiveSuper && t.is_active}
            className={
              t.is_active
                ? 'bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg'
                : 'bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg'
            }
          >
            {t.is_active ? '비활성화' : '활성화'}
          </button>
        </div>
      </form>
    </div>
  )
}
