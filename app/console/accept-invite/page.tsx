import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { acceptConsoleInvite } from './actions'

export default async function ConsoleAcceptInvitePage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(
      '/console/login?error=' +
        encodeURIComponent('초대 메일의 링크를 클릭해 주세요.'),
    )
  }

  // 이미 admin_users.user_id 와 매칭 + active 면 콘솔 홈으로
  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('id, user_id, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  // user_id 가 채워져 있고 이미 last_sign_in 이력이 있으면 (즉 비번 설정 완료) 콘솔로
  if (adminRow && user.last_sign_in_at) {
    const firstAuth = new Date(user.created_at).getTime()
    const lastSignIn = new Date(user.last_sign_in_at).getTime()
    // invite 시점 = created_at. last_sign_in_at 이 created_at 보다 1분 이상 늦으면 두번째 이상 로그인
    if (lastSignIn - firstAuth > 60_000) {
      redirect('/console/home')
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Gridge Console</h1>
          <p className="text-sm text-gray-400 mt-1">관리자 초대 수락</p>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 p-8">
          <h2 className="text-base font-semibold text-white mb-2">비밀번호 설정</h2>
          <p className="text-sm text-gray-400 mb-1">
            <span className="font-medium text-gray-200">{user.email}</span> 으로 초대받으셨습니다.
          </p>
          <p className="text-sm text-gray-400 mb-6">
            로그인에 사용할 비밀번호를 설정하세요. 다음 단계에서 2FA(TOTP) 를 등록합니다.
          </p>

          {searchParams.error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-400">
              {searchParams.error}
            </div>
          )}

          <form action={acceptConsoleInvite} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">새 비밀번호 (8자 이상)</label>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg
                           text-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">비밀번호 확인</label>
              <input
                name="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg
                           text-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium
                         py-2.5 px-4 rounded-lg transition-colors"
            >
              설정 완료하고 콘솔 진입
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
