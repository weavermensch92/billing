/**
 * Cron — 월간 벤더 청구서 폴링
 * Vercel Cron: 매월 5일 (전월 청구서 도착 기준)
 *
 * Query params:
 *   period_start (선택) — 디폴트: 전월 1일
 *   period_end   (선택) — 디폴트: 전월 말일
 *   market_rate  (선택) — 디폴트: 한국은행 환율 API 또는 1330 (fallback)
 */

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { runInvoicePolling } from '@/lib/vendor-api/invoice-fetcher'
import { verifyCronAuth } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 600 // 10분

function previousMonthRange(): { start: string; end: string } {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() // 0-indexed
  const prevMonthLastDay = new Date(Date.UTC(y, m, 0))
  const prevMonthFirstDay = new Date(Date.UTC(prevMonthLastDay.getUTCFullYear(), prevMonthLastDay.getUTCMonth(), 1))
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { start: fmt(prevMonthFirstDay), end: fmt(prevMonthLastDay) }
}

async function fetchKrwUsdRate(): Promise<number> {
  // TODO: 한국은행 또는 다른 환율 API 연동. 일단 fallback.
  return 1330
}

export async function GET(request: Request) {
  const unauth = verifyCronAuth(request)
  if (unauth) return unauth

  const url = new URL(request.url)
  const defaultRange = previousMonthRange()
  const periodStart = url.searchParams.get('period_start') ?? defaultRange.start
  const periodEnd = url.searchParams.get('period_end') ?? defaultRange.end
  const marketRateParam = url.searchParams.get('market_rate')
  const marketRate = marketRateParam ? Number(marketRateParam) : await fetchKrwUsdRate()

  const supabase = createServiceRoleClient()
  try {
    const results = await runInvoicePolling(
      supabase as never,
      { periodStart, periodEnd },
      marketRate,
    )
    const totalFetched = results.reduce((s, r) => s + r.fetched, 0)
    const totalInserted = results.reduce((s, r) => s + r.inserted, 0)
    return NextResponse.json({
      ok: true,
      periodStart,
      periodEnd,
      marketRate,
      tokenCount: results.length,
      totalFetched,
      totalInserted,
      results,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export const POST = GET
