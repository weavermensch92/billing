import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
// Vercel 데모/프리뷰 환경에서 Supabase env 미설정이면 자동 Mock — 미들웨어 throw 방지
const MOCK_MODE =
  process.env.NEXT_PUBLIC_MOCK_MODE === 'true' || !SUPABASE_URL || !SUPABASE_KEY
const MOCK_COOKIE = 'dev_mock_user'

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname

  if (MOCK_MODE) {
    const email = request.cookies.get(MOCK_COOKIE)?.value ?? null
    const hasUser = !!email
    const isConsoleScope = email?.endsWith('@gridge.ai') ?? false

    // 콘솔 보호
    if (path.startsWith('/console') && path !== '/console/login' && !hasUser) {
      const url = request.nextUrl.clone(); url.pathname = '/console/login'
      return NextResponse.redirect(url)
    }
    // 콘솔 로그인 이후 고객 경로 접근 차단 (혼선 방지)
    if (path.startsWith('/console') && path !== '/console/login' && hasUser && !isConsoleScope) {
      const url = request.nextUrl.clone(); url.pathname = '/home'
      return NextResponse.redirect(url)
    }

    const isCustomerAuthRequired =
      path.startsWith('/home') || path.startsWith('/services') ||
      path.startsWith('/billing') || path.startsWith('/requests') ||
      path.startsWith('/org') || path.startsWith('/settings')

    if (isCustomerAuthRequired && !hasUser) {
      const url = request.nextUrl.clone(); url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    if (isCustomerAuthRequired && hasUser && isConsoleScope) {
      const url = request.nextUrl.clone(); url.pathname = '/console/home'
      return NextResponse.redirect(url)
    }

    return NextResponse.next({ request })
  }

  // ─── 실제 Supabase 모드 ───
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    SUPABASE_URL!,
    SUPABASE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (path.startsWith('/console') && path !== '/console/login' && !user) {
    const url = request.nextUrl.clone(); url.pathname = '/console/login'
    return NextResponse.redirect(url)
  }

  const isCustomerAuthRequired =
    path.startsWith('/home') || path.startsWith('/services') ||
    path.startsWith('/billing') || path.startsWith('/requests') ||
    path.startsWith('/org') || path.startsWith('/settings')

  if (isCustomerAuthRequired && !user) {
    const url = request.nextUrl.clone(); url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
