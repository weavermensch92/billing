/**
 * Server Action 공통 에러 처리.
 *
 * 목적:
 *   - `throw new Error()` 가 그대로 500 + "Application error ... Digest: xxx" 로
 *     떨어지는 걸 막고, 사용자에게 의미 있는 한국어 메시지로 변환.
 *   - 환경 변수 누락 / 외부 호출 실패 같은 일반 케이스 일관 처리.
 *
 * 사용 패턴 (action 안):
 *   try {
 *     const serviceRole = createServiceRoleClient()
 *     ...
 *   } catch (err) {
 *     if (isRedirectError(err)) throw err
 *     redirect('/foo?error=' + encodeURIComponent(actionErrorMessage(err)))
 *   }
 */

export class ConfigError extends Error {
  constructor(public envName: string, message?: string) {
    super(
      message ??
        `필수 환경 변수가 누락되었습니다 (${envName}). Vercel 설정을 확인하세요.`,
    )
    this.name = 'ConfigError'
  }
}

/**
 * Next.js 의 redirect() / notFound() 가 던지는 특수 에러는
 * try/catch 에서 다시 던져야 정상 동작. digest 가 NEXT_REDIRECT / NEXT_NOT_FOUND 로 시작.
 */
export function isRedirectError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const digest = (err as { digest?: unknown }).digest
  return (
    typeof digest === 'string' &&
    (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_NOT_FOUND'))
  )
}

/** 알려진 에러 패턴 → 한국어 사용자 메시지. */
export function actionErrorMessage(err: unknown): string {
  if (err instanceof ConfigError) return err.message

  if (err instanceof Error) {
    const msg = err.message
    // Supabase env 누락 패턴 (service-role.ts 등에서 throw)
    if (/SUPABASE_SERVICE_ROLE_KEY/.test(msg)) {
      return '필수 환경 변수가 누락되었습니다 (SUPABASE_SERVICE_ROLE_KEY). Vercel 설정을 확인하세요.'
    }
    if (/NEXT_PUBLIC_SUPABASE_URL/.test(msg)) {
      return '필수 환경 변수가 누락되었습니다 (NEXT_PUBLIC_SUPABASE_URL). Vercel 설정을 확인하세요.'
    }
    if (/NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(msg)) {
      return '필수 환경 변수가 누락되었습니다 (NEXT_PUBLIC_SUPABASE_ANON_KEY). Vercel 설정을 확인하세요.'
    }
    // 일반 에러 — 너무 긴 메시지 잘라내기, 내부 path/stack 노출 방지
    const safe = msg.split('\n')[0].slice(0, 200)
    return `작업 중 오류가 발생했습니다: ${safe}`
  }

  return '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
}
