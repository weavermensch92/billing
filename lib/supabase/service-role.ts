/**
 * Service-Role Supabase Client
 *
 * 용도:
 *   - API routes (cron / vendor webhook / slack webhook)
 *   - Server Actions 중 RLS bypass가 필요한 케이스 (관리 작업)
 *
 * 인증:
 *   - SUPABASE_SERVICE_ROLE_KEY (RLS bypass, 절대 클라이언트 노출 X)
 *
 * Mock 모드:
 *   - NEXT_PUBLIC_MOCK_MODE=true 면 createMockSupabase 사용 (RLS 무관)
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createMockSupabase } from '@/lib/mock/client'
import { ConfigError, actionErrorMessage } from '@/lib/errors'

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

export function createServiceRoleClient() {
  if (MOCK_MODE) {
    return createMockSupabase(null) as unknown as ReturnType<typeof createSupabaseClient>
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new ConfigError('NEXT_PUBLIC_SUPABASE_URL')
  }
  if (!serviceKey) {
    throw new ConfigError('SUPABASE_SERVICE_ROLE_KEY')
  }

  return createSupabaseClient(url, serviceKey, {
    db: { schema: 'billing' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Server Action 용 안전 래퍼. 환경 변수 누락 등 throw 시
 * errorPath 로 redirect (한국어 메시지 포함). 정상이면 client 반환.
 *
 * 사용:
 *   const service = createServiceRoleClientOrRedirect(PAGE)
 */
export function createServiceRoleClientOrRedirect(errorPath: string) {
  try {
    return createServiceRoleClient()
  } catch (err) {
    console.error('[createServiceRoleClient]', err)
    redirect(`${errorPath}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }
}
