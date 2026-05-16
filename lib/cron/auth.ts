/**
 * Cron 공통 인증 헬퍼
 *
 * Vercel Cron 또는 외부 cron이 호출. CRON_SECRET 검증.
 *
 * Env:
 *   CRON_SECRET — Bearer 토큰
 */

import { NextResponse } from 'next/server'

export function verifyCronAuth(request: Request): NextResponse | null {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  return null // 통과
}
