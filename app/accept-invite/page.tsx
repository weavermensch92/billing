import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { acceptInvite } from './actions'

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 세션 없으면 초대 메일에서 다시 들어와야 함
  if (!user) {
    redirect('/login?error=' + encodeURIComponent('초대 메일의 링크를 클릭해 주세요.'))
  }

  // 이미 active member 면 그냥 /home
  const { data: activeMember } = await supabase
    .from('members')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (activeMember) {
    redirect('/home')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-brand-700">Gridge</h1>
          <p className="text-sm text-gray-500 mt-1">초대 수락</p>
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">비밀번호 설정</h2>
          <p className="text-sm text-gray-500 mb-1">
            <span className="font-medium text-gray-700">{user.email}</span> 으로 초대받으셨습니다.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            이후 로그인에 사용할 비밀번호를 설정해 주세요.
          </p>

          {searchParams.error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {searchParams.error}
            </div>
          )}

          <form action={acceptInvite} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호 (8자 이상)
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호 확인
              </label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium
                         py-2.5 px-4 rounded-lg transition-colors"
            >
              설정 완료하고 시작하기
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
