'use client'

import { useEffect } from 'react'

/**
 * 운영 콘솔 라우트 그룹 에러 바운더리.
 * /console/* 하위의 모든 Server Action / Server Component 미처리 예외 캐치.
 *
 * 운영용이므로 일반 사용자 대비 더 구체적인 안내 (digest + 추정 원인 + Vercel logs 가이드).
 */
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[ConsoleError]', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          서버 오류 — 작업 미완료
        </h1>
        <p className="text-sm text-gray-500 mb-4">
          요청 처리 중 예외가 발생했습니다. Vercel Functions 로그에서 아래 Digest 로 검색해 원인을 확인할 수 있습니다.
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 space-y-2">
          {error.digest ? (
            <div>
              <div className="text-xs text-gray-500 mb-1">Digest</div>
              <code className="text-xs text-gray-700 font-mono break-all">{error.digest}</code>
            </div>
          ) : null}
        </div>

        <div className="text-xs text-gray-500 mb-4">
          <p className="font-medium text-gray-700 mb-1">자주 발생하는 원인:</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>환경 변수 누락 (SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL)</li>
            <li>외부 서비스 (Supabase / Slack / Vault) 일시적 응답 실패</li>
            <li>권한 정책(RLS) 변경 후 누락</li>
          </ul>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => reset()}
            className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            다시 시도
          </button>
          <a
            href="/console/home"
            className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors text-center"
          >
            콘솔 홈
          </a>
        </div>
      </div>
    </div>
  )
}
