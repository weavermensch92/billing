/**
 * Slack Events Webhook — ✅ 리액션 수신·처리
 *
 * Slack Events API → POST /api/slack/events (외부 라우트)
 * 본 모듈은 이벤트 검증·라우팅·confirm_slack_ack 호출 헬퍼.
 *
 * 검증:
 *   - X-Slack-Signature (v0=hmac-sha256(signing_secret, timestamp + body))
 *   - X-Slack-Request-Timestamp (±5분 내)
 *
 * 처리 이벤트:
 *   - reaction_added (item.type='message', reaction='white_check_mark')
 *
 * Env:
 *   SLACK_SIGNING_SECRET
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface SlackEventEnvelope {
  token?: string
  type: 'event_callback' | 'url_verification'
  challenge?: string
  team_id?: string
  event?: SlackEvent
}

export interface SlackEvent {
  type: string
  user: string
  reaction?: string
  item?: {
    type: 'message'
    channel: string
    ts: string
  }
  event_ts: string
}

const SIGNATURE_WINDOW_SECONDS = 300

/** Slack 서명 검증 (HMAC SHA-256). 5분 윈도우. */
export function verifySlackSignature(opts: {
  signingSecret: string
  signature: string             // X-Slack-Signature
  timestamp: string             // X-Slack-Request-Timestamp
  rawBody: string               // raw request body (JSON 변환 전)
  nowSeconds?: number
}): boolean {
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000)
  const ts = Number(opts.timestamp)
  if (!Number.isFinite(ts) || Math.abs(now - ts) > SIGNATURE_WINDOW_SECONDS) return false

  const base = `v0:${opts.timestamp}:${opts.rawBody}`
  const hmac = createHmac('sha256', opts.signingSecret).update(base).digest('hex')
  const expected = `v0=${hmac}`

  const a = Buffer.from(expected)
  const b = Buffer.from(opts.signature)
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** url_verification challenge 응답 */
export function buildChallengeResponse(envelope: SlackEventEnvelope): string | null {
  if (envelope.type === 'url_verification' && envelope.challenge) {
    return envelope.challenge
  }
  return null
}

/** ✅ 리액션 식별 (다른 이모지는 무시) */
const APPROVED_EMOJIS = new Set(['white_check_mark', 'heavy_check_mark', 'ballot_box_with_check'])

export async function handleSlackEvent(
  supabase: SBLike,
  envelope: SlackEventEnvelope,
): Promise<{ handled: boolean; result?: string; walletChargeId?: string | null }> {
  if (envelope.type !== 'event_callback' || !envelope.event) {
    return { handled: false }
  }

  const ev = envelope.event
  if (ev.type !== 'reaction_added') return { handled: false }
  if (!ev.reaction || !APPROVED_EMOJIS.has(ev.reaction)) return { handled: false }
  if (!ev.item || ev.item.type !== 'message') return { handled: false }

  const { data, error } = await supabase.rpc('confirm_slack_ack', {
    p_channel_id: ev.item.channel,
    p_message_ts: ev.item.ts,
    p_emoji: ev.reaction,
    p_slack_user_id: ev.user,
    p_event_payload: ev as unknown as Record<string, unknown>,
  })

  if (error) {
    return { handled: true, result: `error: ${JSON.stringify(error)}` }
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    handled: true,
    result: String(row?.reason ?? 'unknown'),
    walletChargeId: row?.wallet_charge_id ?? null,
  }
}
