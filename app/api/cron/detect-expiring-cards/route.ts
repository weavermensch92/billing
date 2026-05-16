/**
 * Cron — 카드 만료 임박 알림 큐 INSERT + 발송
 * Vercel Cron: 매일 자정
 *
 * 1단계: detect_expiring_cards RPC (D-30/D-7/D-0/past_due 식별)
 * 2단계: 큐의 알림을 채널별로 발송 (email/slack/dashboard/phone)
 *
 * phone 채널은 자동 발송 안 함 — AM SOP. 큐에 남아 대시보드에서 처리.
 */

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  runDetectExpiringCards,
  dispatchQueuedNotifications,
  type ChannelDispatcher,
} from '@/lib/billing/card-expiry-notifier'
import { verifyCronAuth } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

// 기본 dispatchers — Phase 1에서는 stub (TODO: SendGrid/SES + Slack 연동)
const dispatchers: { email?: ChannelDispatcher; slack?: ChannelDispatcher } = {
  email: async () => ({ ok: false, error: 'email dispatcher not configured' }),
  slack: async () => ({ ok: false, error: 'slack dispatcher not configured' }),
}

export async function GET(request: Request) {
  const unauth = verifyCronAuth(request)
  if (unauth) return unauth

  const supabase = createServiceRoleClient()
  try {
    const detected = await runDetectExpiringCards(supabase as never)
    const dispatchResults = await dispatchQueuedNotifications(supabase as never, dispatchers)
    return NextResponse.json({
      ok: true,
      detected,
      dispatched: dispatchResults.length,
      dispatchResults: dispatchResults.slice(0, 50), // 응답 크기 제한
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export const POST = GET
