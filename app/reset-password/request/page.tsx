import { requestCustomerReset } from './actions'

export default function CustomerResetRequestPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string }
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-brand-700">Gridge</h1>
          <p className="text-sm text-gray-500 mt-1">비밀번호 재설정</p>
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">재설정 링크 받기</h2>
          <p className="text-sm text-gray-500 mb-6">
            계정 이메일을 입력하시면 비밀번호 재설정 링크를 보내드립니다.
          </p>

          {searchParams.message && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              {searchParams.message}
            </div>
          )}
          {searchParams.error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {searchParams.error}
            </div>
          )}

          <form action={requestCustomerReset} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                이메일
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="your@company.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium
                         py-2.5 px-4 rounded-lg transition-colors"
            >
              재설정 링크 보내기
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-6">
            <a href="/login" className="text-brand-600 hover:underline">
              ← 로그인으로 돌아가기
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
