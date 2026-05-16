/**
 * Cron — 그림자 멤버 24h 검수 만료 자동 active
 * Vercel Cron: 매일 자정 (또는 1h마다 — pending_approval_until 정확도 위해)
 *
 * 관대 모드: 24h 미응답 → 자동 'active'.
 * (Phase 2에 엄격 모드 옵션 검토)
 */

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { dailyAutoApprovePending } from '@/lib/billing/shadow-approval'
import { verifyCronAuth } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const unauth = verifyCronAuth(request)
  if (unauth) return unauth

  const supabase = createServiceRoleClient()
  try {
    const autoApprovedCount = await dailyAutoApprovePending(supabase as never)
    return NextResponse.json({ ok: true, autoApprovedCount })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export const POST = GET
