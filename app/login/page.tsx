import { login } from './actions'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string }
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-brand-700">Gridge</h1>
          <p className="text-sm text-gray-500 mt-1">AI 서비스 통합 관리 플랫폼</p>
        </div>

        {/* 로그인 카드 */}
        <div className="card p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">이메일로 로그인</h2>
          <p className="text-sm text-gray-500 mb-6">
            등록된 이메일로 로그인 링크를 보내드립니다.
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

          <form action={login} className="space-y-4">
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
              로그인 링크 받기
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-6">
            Gridge Billing MSP 계약 고객만 사용 가능합니다.
            <br />문의: <a href="mailto:support@gridge.ai" className="text-brand-600 hover:underline">support@gridge.ai</a>
          </p>
        </div>

        {process.env.NEXT_PUBLIC_MOCK_MODE === 'true' && (
          <div className="mt-4 card p-5 bg-yellow-50 border-yellow-200">
            <p className="text-xs font-semibold text-yellow-900 mb-2">
              DEV — Mock 가상 계정 (DB 미연결)
            </p>
            <div className="space-y-2">
              {[
                { email: 'alice@acme.com',   label: '김앨리스 (Owner)',  desc: '청구서·크레딧백·전 기능' },
                { email: 'bob@acme.com',     label: '박밥 (Admin)',       desc: '멤버 초대·요청 제출' },
                { email: 'charlie@acme.com', label: '최찰리 (Member)',    desc: '본인 계정만 조회' },
              ].map(u => (
                <form key={u.email} action="/api/dev-login" method="POST">
                  <input type="hidden" name="email" value={u.email} />
                  <button type="submit" className="w-full text-left p-2 bg-white border border-yellow-200 rounded hover:bg-yellow-100 transition-colors">
                    <p className="text-sm font-medium text-yellow-900">{u.label}</p>
                    <p className="text-xs text-yellow-700">{u.desc}</p>
                  </button>
                </form>
              ))}
            </div>
            <p className="text-xs text-yellow-700 mt-3">
              운영 콘솔 로그인: <a href="/console/login" className="underline">/console/login</a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
