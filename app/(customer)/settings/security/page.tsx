import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SecurityForms } from './security-forms'

export default async function SecurityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members').select('name, role').eq('user_id', user.id).eq('status', 'active').single()
  if (!member) redirect('/login')

  // MFA factors
  const { data: factorsData } = await supabase.auth.mfa.listFactors()
  const totpFactor = factorsData?.totp?.[0] ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">보안 · 2FA</h1>
        <p className="text-sm text-gray-500 mt-1">
          계정 보안을 강화하세요.
        </p>
      </div>

      {/* 프로필 요약 */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-3">계정 정보</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">이름</dt>
            <dd className="font-medium mt-0.5">{member.name}</dd>
          </div>
          <div>
            <dt className="text-gray-500">이메일</dt>
            <dd className="font-medium mt-0.5">{user.email}</dd>
          </div>
          <div>
            <dt className="text-gray-500">역할</dt>
            <dd className="font-medium mt-0.5 capitalize">{member.role}</dd>
          </div>
          <div>
            <dt className="text-gray-500">마지막 로그인</dt>
            <dd className="font-medium mt-0.5 text-xs">
              {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('ko-KR') : '-'}
            </dd>
          </div>
        </dl>
      </div>

      {/* 2FA */}
      <SecurityForms
        totpFactorId={totpFactor?.id ?? null}
        totpStatus={totpFactor?.status ?? null}
      />

      {/* 세션 관리 (Phase 1 예고) */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-2">활성 세션</h2>
        <p className="text-sm text-gray-500">
          현재 이 브라우저에서 활성 중인 세션. 다른 기기 세션 원격 종료는 Phase 1에서 지원됩니다.
        </p>
        <div className="mt-3 flex items-center justify-between p-3 bg-gray-50 rounded">
          <div>
            <p className="text-sm font-medium text-gray-900">현재 브라우저</p>
            <p className="text-xs text-gray-500">
              {user.last_sign_in_at ? `로그인: ${new Date(user.last_sign_in_at).toLocaleString('ko-KR')}` : '-'}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-xs border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-100"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
