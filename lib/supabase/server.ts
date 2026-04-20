import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createMockSupabase } from '@/lib/mock/client'

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'
export const MOCK_COOKIE = 'dev_mock_user'

export async function createClient() {
  const cookieStore = cookies()

  if (MOCK_MODE) {
    const email = cookieStore.get(MOCK_COOKIE)?.value ?? null
    return createMockSupabase(email) as unknown as ReturnType<typeof createServerClient>
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'billing' },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // 서버 컴포넌트에서 쿠키 설정 불가 시 무시
          }
        },
      },
    },
  )
}
