/**
 * Cron — Org 해지 grace 만료 처리
 * Vercel Cron: 매일 자정
 *
 * grace_until ≤ today 인 Org들을 finalize_termination (M-1011).
 * 자원 회수 + 잔액 만료 처리.
 */

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { dailyTerminationFinalize } from '@/lib/billing/termination'
import { verifyCronAuth } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const unauth = verifyCronAuth(request)
  if (unauth) return unauth

  const supabase = createServiceRoleClient()
  try {
    const finalizedCount = await dailyTerminationFinalize(supabase as never)
    return NextResponse.json({ ok: true, finalizedCount })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export const POST = GET
