import { adminLogin } from './actions'

export default function ConsoleLoginPage({
  searchParams,
}: {
  searchParams: { error?: string; step?: string }
}) {
  const step = searchParams.step ?? '1'

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Gridge Console</h1>
          <p className="text-sm text-gray-400 mt-1">운영 전용 콘솔 · 2FA 필수</p>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 p-8">
          {searchParams.error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-400">
              {searchParams.error}
            </div>
          )}

          {step === '1' ? (
            <>
              <h2 className="text-base font-semibold text-white mb-5">관리자 로그인</h2>
              <form action={adminLogin} className="space-y-4">
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
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">비밀번호</label>
                  <input
                    name="password"
                    type="password"
                    required
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
                  다음 (2FA 인증)
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold text-white mb-2">2FA 인증</h2>
              <p className="text-sm text-gray-400 mb-5">
                인증 앱의 6자리 코드를 입력하세요.
              </p>
              <form action={adminLogin} className="space-y-4">
                <input type="hidden" name="step" value="2" />
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">TOTP 코드</label>
                  <input
                    name="totp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    placeholder="000000"
                    autoFocus
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg
                               text-white text-sm font-mono text-center tracking-widest
                               focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium
                             py-2.5 px-4 rounded-lg transition-colors"
                >
                  콘솔 진입
                </button>
              </form>
            </>
          )}
        </div>

        {process.env.NEXT_PUBLIC_MOCK_MODE === 'true' && (
          <div className="mt-4 p-5 bg-yellow-900/20 border border-yellow-700 rounded-xl">
            <p className="text-xs font-semibold text-yellow-300 mb-2">
              DEV — Mock 관리자 계정
            </p>
            <div className="space-y-2">
              {[
                { email: 'luna@gridge.ai',  label: 'Luna (AM)',       desc: '요청 처리·CSM·고객사' },
                { email: 'weber@gridge.ai', label: '위버 (Super)',    desc: '전체 권한·VCN 전체번호 조회' },
              ].map(u => (
                <form key={u.email} action="/api/dev-login" method="POST">
                  <input type="hidden" name="email" value={u.email} />
                  <button type="submit" className="w-full text-left p-2 bg-gray-800 border border-yellow-700 rounded hover:bg-gray-700 transition-colors">
                    <p className="text-sm font-medium text-yellow-200">{u.label}</p>
                    <p className="text-xs text-yellow-400">{u.desc}</p>
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
