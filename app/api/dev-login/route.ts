import { NextResponse } from 'next/server'
import { MOCK_USERS } from '@/lib/mock/fixtures'

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function login(email: string | null, redirectPath: string | null, requestUrl: string) {
  if (IS_PRODUCTION || !MOCK_MODE) {
    return NextResponse.json({ error: 'Dev login disabled' }, { status: 403 })
  }

  const normalized = email?.toLowerCase() ?? ''
  const user = MOCK_USERS[normalized]

  if (!user) {
    return NextResponse.redirect(new URL('/login?error=' + encodeURIComponent('가상 계정이 아닙니다: ' + normalized), requestUrl))
  }

  const fallback = user.scope === 'console' ? '/console/home' : '/home'
  const target = redirectPath && redirectPath.startsWith('/') ? redirectPath : fallback

  const res = NextResponse.redirect(new URL(target, requestUrl))
  res.cookies.set('dev_mock_user', normalized, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  })
  return res
}

// GET /api/dev-login?email=alice@acme.com&redirect=/home
export async function GET(request: Request) {
  const url = new URL(request.url)
  return login(url.searchParams.get('email'), url.searchParams.get('redirect'), request.url)
}

// POST (form submit from /login page)
export async function POST(request: Request) {
  const formData = await request.formData()
  const email = formData.get('email') as string
  const redirectPath = (formData.get('redirect') as string) || null
  return login(email, redirectPath, request.url)
}
