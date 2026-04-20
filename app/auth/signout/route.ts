import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const url = new URL(request.url)
  const isConsole = url.searchParams.get('scope') === 'console'
  const res = NextResponse.redirect(new URL(isConsole ? '/console/login' : '/login', request.url))
  // Mock mode cookie 제거
  res.cookies.set('dev_mock_user', '', { maxAge: 0, path: '/' })
  return res
}
