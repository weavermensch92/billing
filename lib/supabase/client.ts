'use client'

import { createBrowserClient } from '@supabase/ssr'
import { createMockSupabase } from '@/lib/mock/client'

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split('; ').find(c => c.startsWith(name + '='))
  return match ? decodeURIComponent(match.split('=')[1]) : null
}

export function createClient() {
  if (MOCK_MODE) {
    const email = readCookie('dev_mock_user')
    return createMockSupabase(email) as unknown as ReturnType<typeof createBrowserClient>
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'billing' } },
  )
}
