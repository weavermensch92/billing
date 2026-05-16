/**
 * Slack Events Webhook
 *
 * Slack Events API → POST /api/slack/events
 *
 * 처리:
 *   - url_verification (Slack 등록 시 challenge 응답)
 *   - reaction_added (✅ → confirm_slack_ack RPC)
 *
 * 인증:
 *   - X-Slack-Signature (HMAC SHA-256, lib/slack/webhook 의 verifySlackSignature)
 *   - X-Slack-Request-Timestamp (±5분)
 *
 * Env:
 *   SLACK_SIGNING_SECRET
 */

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  verifySlackSignature,
  buildChallengeResponse,
  handleSlackEvent,
  type SlackEventEnvelope,
} from '@/lib/slack/webhook'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-slack-signature') ?? ''
  const timestamp = request.headers.get('x-slack-request-timestamp') ?? ''

  const signingSecret = process.env.SLACK_SIGNING_SECRET
  if (!signingSecret) {
    return NextResponse.json({ error: 'SLACK_SIGNING_SECRET missing' }, { status: 500 })
  }

  // 1) 서명 검증
  const validSig = verifySlackSignature({
    signingSecret,
    signature,
    timestamp,
    rawBody,
  })

  if (!validSig) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  // 2) JSON 파싱
  let envelope: SlackEventEnvelope
  try {
    envelope = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // 3) URL verification challenge
  const challenge = buildChallengeResponse(envelope)
  if (challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    })
  }

  // 4) 이벤트 처리
  const supabase = createServiceRoleClient()
  const result = await handleSlackEvent(supabase as never, envelope)

  return NextResponse.json({ ok: true, handled: result.handled, result: result.result }, { status: 200 })
}
