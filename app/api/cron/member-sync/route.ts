/**
 * Cron — 1h 멤버 sync
 * Vercel Cron: 매 시간 (분=0)
 *
 * 모든 활성 vendor_admin_token에 대해 벤더 멤버 조회 + 그릿지 DB와 diff.
 * 그림자 발견 시 register_shadow_member_pending (24h 검수 모드).
 */

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { runHourlyMemberSync } from '@/lib/vendor-api/member-sync'
import { verifyCronAuth } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300 // 5분 (다수 토큰 + 벤더 API 지연)

export async function GET(request: Request) {
  const unauth = verifyCronAuth(request)
  if (unauth) return unauth

  const supabase = createServiceRoleClient()
  try {
    const results = await runHourlyMemberSync(supabase as never)
    const totalAdded = results.reduce((s, r) => s + r.added, 0)
    const totalRemoved = results.reduce((s, r) => s + r.removed, 0)
    return NextResponse.json({
      ok: true,
      tokenCount: results.length,
      totalAdded,
      totalRemoved,
      results,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export const POST = GET
