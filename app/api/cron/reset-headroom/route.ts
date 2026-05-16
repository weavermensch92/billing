/**
 * Cron — Org 결제일 헤드룸 리셋
 * Vercel Cron: 매일 자정
 *
 * 오늘이 결제일(billing_day_of_month)인 Org들에 대해:
 *   - self_approval_used_krw = 0
 *   - team_headroom.headroom_used_krw = 0
 *
 * SQL RPC daily_headroom_reset() 가정 (M-1007에서 이미 정의됨).
 */

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { verifyCronAuth } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const unauth = verifyCronAuth(request)
  if (unauth) return unauth

  const supabase = createServiceRoleClient()
  try {
    // M-1007의 daily_headroom_reset() RPC 호출
    const { data, error } = await supabase.rpc('daily_headroom_reset')
    if (error) {
      return NextResponse.json({ ok: false, error: JSON.stringify(error) }, { status: 500 })
    }
    return NextResponse.json({ ok: true, resetCount: Number(data ?? 0) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export const POST = GET
