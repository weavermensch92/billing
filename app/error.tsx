'use client'

import { useEffect } from 'react'

/**
 * 루트 에러 바운더리. 어떤 라우트에서도 잡지 못한 예외의 최종 캐치-올.
 * Next.js 가 자동으로 사용 (https://nextjs.org/docs/app/api-reference/file-conventions/error).
 *
 * 운영 환경에선 error.message 가 "An error occurred..." 로 마스킹되고
 * digest 만 노출됨. 자세한 메시지는 Vercel Functions 로그에서 digest 로 조회.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[RootError]', error)
  }, [error])

  return (
    <html>
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f9fafb',
          padding: '1rem',
        }}>
          <div style={{ maxWidth: 500, width: '100%' }}>
            <div style={{
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: '2rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827', marginTop: 0, marginBottom: '0.5rem' }}>
                예기치 못한 오류가 발생했습니다
              </h1>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
                잠시 후 다시 시도해 주세요. 문제가 지속되면 운영팀에 아래 코드를 전달해 주세요.
              </p>
              {error.digest && (
                <code style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  color: '#374151',
                  background: '#f3f4f6',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 4,
                  fontFamily: 'ui-monospace, monospace',
                  marginBottom: '1.5rem',
                }}>
                  Digest: {error.digest}
                </code>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => reset()}
                  style={{
                    flex: 1,
                    padding: '0.5rem 1rem',
                    background: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  다시 시도
                </button>
                <a
                  href="/"
                  style={{
                    flex: 1,
                    padding: '0.5rem 1rem',
                    background: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    textDecoration: 'none',
                    textAlign: 'center',
                  }}
                >
                  홈으로
                </a>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
