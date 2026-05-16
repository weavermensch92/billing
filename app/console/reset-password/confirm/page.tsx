import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { confirmReset } from './actions'

export default async function ConfirmResetPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(
      '/console/reset-password/request?error=' +
        encodeURIComponent('세션이 만료되었습니다. 재설정 링크를 다시 요청해 주세요.'),
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">새 비밀번호 설정</h1>
          <p className="text-sm text-gray-400 mt-1">{user.email}</p>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 p-8">
          {searchParams.error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-400">
              {searchParams.error}
            </div>
          )}

          <form action={confirmReset} className="space-y-4">
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
                name="password_confirm"
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
              비밀번호 변경
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
