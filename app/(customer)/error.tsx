'use client'

import { useEffect } from 'react'

/**
 * 고객 포털 라우트 그룹 에러 바운더리.
 * /home, /services, /billing, /requests, /org, /settings 하위의 모든
 * Server Action / Server Component 의 미처리 예외를 캐치.
 */
export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[CustomerError]', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          작업을 완료할 수 없습니다
        </h1>
        <p className="text-sm text-gray-500 mb-4">
          서버에서 예기치 못한 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
        </p>
        <p className="text-xs text-gray-400 mb-4">
          문제가 지속되면 운영팀(support@gridge.ai)에 아래 코드를 함께 전달해 주세요.
        </p>
        {error.digest && (
          <code className="block text-xs text-gray-700 bg-gray-100 px-3 py-2 rounded font-mono mb-6">
            Digest: {error.digest}
          </code>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => reset()}
            className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            다시 시도
          </button>
          <a
            href="/home"
            className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors text-center"
          >
            홈으로
          </a>
        </div>
      </div>
    </div>
  )
}
