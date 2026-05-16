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
import { createMockSupabase } from '@/lib/mock/client'

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

export function createServiceRoleClient() {
  if (MOCK_MODE) {
    return createMockSupabase(null) as unknown as ReturnType<typeof createSupabaseClient>
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing — required for cron/webhook routes')
  }

  return createSupabaseClient(url, serviceKey, {
    db: { schema: 'billing' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
