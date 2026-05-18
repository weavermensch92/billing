import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { confirmCustomerReset } from './actions'

export default async function CustomerResetConfirmPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(
      '/reset-password/request?error=' +
        encodeURIComponent('세션이 만료되었습니다. 재설정 링크를 다시 요청해 주세요.'),
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-brand-700">Gridge</h1>
          <p className="text-sm text-gray-500 mt-1">새 비밀번호 설정</p>
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">비밀번호 변경</h2>
          <p className="text-sm text-gray-500 mb-6">
            <span className="font-medium text-gray-700">{user.email}</span> 의 비밀번호를 변경합니다.
          </p>

          {searchParams.error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {searchParams.error}
            </div>
          )}

          <form action={confirmCustomerReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호 (8자 이상)</label>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
              <input
                name="password_confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
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
