import { requestReset } from './actions'

export default function RequestResetPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string }
}) {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">비밀번호 재설정</h1>
          <p className="text-sm text-gray-400 mt-1">등록된 이메일로 재설정 링크를 보냅니다.</p>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 p-8">
          {searchParams.message && (
            <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded-lg text-sm text-green-400">
              {searchParams.message}
            </div>
          )}
          {searchParams.error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-400">
              {searchParams.error}
            </div>
          )}

          <form action={requestReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">이메일</label>
              <input
                name="email"
                type="email"
                required
                placeholder="admin@gridge.ai"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg
                           text-white text-sm placeholder-gray-500
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
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
            <a href="/console/login" className="hover:underline">로그인으로 돌아가기</a>
          </p>
        </div>
      </div>
    </div>
  )
}
