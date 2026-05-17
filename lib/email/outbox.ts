/**
 * Email Outbox — 큐 INSERT + 재시도 처리기 (PR B)
 *
 * 트랜잭션 메일 발송의 신뢰성 보장:
 *   - 이벤트 발생 시점에 enqueueEmail 으로 INSERT (status='pending')
 *   - 큐 처리기 (processOutbox) 가 pending + due 한 row 를 가져와 sendEmail 호출
 *   - 성공 → status='sent' + message_id 저장
 *   - 실패 → attempts++ + next_retry_at 갱신 (exponential backoff)
 *   - max_attempts 도달 → status='failed' (재시도 중단, 운영자 수동 처리)
 *
 * 사용 컨텍스트:
 *   - enqueueEmail: 이벤트 발생 사이트 (서버 액션 / 라우트) 에서 호출
 *   - processOutbox: cron / vercel scheduled function / supabase cron 등
 *
 * 후속:
 *   - PR C — dispatchNotification 이 enqueueEmail 을 호출 (notification_preferences 조회)
 *   - PR D — 이벤트 발생 사이트가 dispatchNotification 호출
 */

import { sendEmail, type SendEmailResult } from './client'

type SBLike = {
  from: (t: string) => any
  rpc?: (name: string, params?: Record<string, unknown>) => any
}

// ─── 백오프 정책 ─────────────────────────────────────────────
// try 0 = 첫 INSERT, 즉시 시도 (next_retry_at = now)
// try 1 실패 후 → 1분
// try 2 실패 후 → 5분
// try 3 실패 후 → 30분
// try 4 실패 후 → 1시간
// try 5 실패 → max_attempts 도달 → failed
const BACKOFF_MS: number[] = [
  60 * 1000,           // 1m
  5 * 60 * 1000,       // 5m
  30 * 60 * 1000,      // 30m
  60 * 60 * 1000,      // 1h
  6 * 60 * 60 * 1000,  // 6h
]

export function computeNextRetry(attempts: number, now: Date = new Date()): Date {
  const idx = Math.max(0, Math.min(attempts - 1, BACKOFF_MS.length - 1))
  const delayMs = BACKOFF_MS[idx]
  return new Date(now.getTime() + delayMs)
}

// ─── enqueueEmail ───────────────────────────────────────────
export interface EnqueueEmailInput {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  from?: string
  replyTo?: string
  bcc?: string | string[]
  tags?: Array<{ name: string; value: string }>

  // 분류 / 추적 (선택)
  eventType?: string
  orgId?: string | null
  refTable?: string
  refId?: string | null
  maxAttempts?: number
}

export type EnqueueResult =
  | { ok: true; outboxId: string }
  | { ok: false; error: string }

/**
 * 큐에 메일 한 건 INSERT. 즉시 발송 안 함 — processOutbox 가 픽업.
 * 호출자는 outboxId 로 추적 가능.
 */
export async function enqueueEmail(
  supabase: SBLike,
  input: EnqueueEmailInput,
): Promise<EnqueueResult> {
  if (!input.to || (Array.isArray(input.to) && input.to.length === 0)) {
    return { ok: false, error: 'to 주소 누락' }
  }
  if (!input.subject || input.subject.trim().length === 0) {
    return { ok: false, error: 'subject 누락' }
  }
  if (!input.html && !input.text) {
    return { ok: false, error: 'html 또는 text 본문 필요' }
  }

  const row: Record<string, unknown> = {
    to_addrs: Array.isArray(input.to) ? input.to : [input.to],
    from_addr: input.from ?? null,
    reply_to: input.replyTo ?? null,
    bcc_addrs: input.bcc ? (Array.isArray(input.bcc) ? input.bcc : [input.bcc]) : null,
    subject: input.subject,
    body_html: input.html ?? null,
    body_text: input.text ?? null,
    tags: input.tags ?? [],
    event_type: input.eventType ?? null,
    org_id: input.orgId ?? null,
    ref_table: input.refTable ?? null,
    ref_id: input.refId ?? null,
    status: 'pending',
    attempts: 0,
    max_attempts: input.maxAttempts ?? 5,
    next_retry_at: new Date().toISOString(),
  }

  const { data, error } = (await supabase
    .from('email_outbox')
    .insert(row)
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown }

  if (error || !data) {
    return { ok: false, error: `email_outbox INSERT 실패: ${JSON.stringify(error)}` }
  }
  return { ok: true, outboxId: data.id }
}

// ─── processOutbox ──────────────────────────────────────────
export interface ProcessOutboxOptions {
  /** 한 번에 처리할 최대 row 수. 기본 25. */
  batchSize?: number
  /** sendEmail 호출 인젝션 (테스트용). 미지정 시 기본 client 사용. */
  send?: (input: { to: string[]; subject: string; html?: string; text?: string; from?: string; replyTo?: string; bcc?: string[]; tags?: Array<{ name: string; value: string }> }) => Promise<SendEmailResult>
}

export interface ProcessOutboxResult {
  picked: number
  sent: number
  retried: number
  failed: number
}

type OutboxRow = {
  id: string
  to_addrs: string[]
  from_addr: string | null
  reply_to: string | null
  bcc_addrs: string[] | null
  subject: string
  body_html: string | null
  body_text: string | null
  tags: Array<{ name: string; value: string }> | null
  attempts: number
  max_attempts: number
}

/**
 * 큐 처리기. cron 또는 vercel scheduled function 에서 호출.
 *
 * 흐름:
 *   1. pending + next_retry_at <= now 인 row 선택 (max batchSize)
 *   2. 각 row: sendEmail 호출
 *      - 성공 → status='sent', sent_at, message_id 갱신
 *      - 실패 + attempts+1 < max → next_retry_at 갱신 (backoff)
 *      - 실패 + attempts+1 >= max → status='failed'
 *   3. 통계 반환
 */
export async function processOutbox(
  supabase: SBLike,
  options: ProcessOutboxOptions = {},
): Promise<ProcessOutboxResult> {
  const batchSize = options.batchSize ?? 25
  const sender = options.send ?? ((input) => sendEmail(input))

  const nowIso = new Date().toISOString()

  const { data: rows } = (await supabase
    .from('email_outbox')
    .select('id, to_addrs, from_addr, reply_to, bcc_addrs, subject, body_html, body_text, tags, attempts, max_attempts')
    .eq('status', 'pending')
    .lte('next_retry_at', nowIso)
    .order('next_retry_at', { ascending: true })
    .limit(batchSize)) as { data: OutboxRow[] | null }

  const picked = rows?.length ?? 0
  let sent = 0
  let retried = 0
  let failed = 0

  if (!rows || rows.length === 0) {
    return { picked: 0, sent: 0, retried: 0, failed: 0 }
  }

  for (const row of rows) {
    const result = await sender({
      to: row.to_addrs,
      subject: row.subject,
      html: row.body_html ?? undefined,
      text: row.body_text ?? undefined,
      from: row.from_addr ?? undefined,
      replyTo: row.reply_to ?? undefined,
      bcc: row.bcc_addrs ?? undefined,
      tags: row.tags ?? undefined,
    })

    if (result.ok) {
      await supabase
        .from('email_outbox')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          message_id: result.messageId,
          last_error: null,
        })
        .eq('id', row.id)
      sent++
    } else {
      const nextAttempts = row.attempts + 1
      const isFinal = nextAttempts >= row.max_attempts
      const update: Record<string, unknown> = {
        attempts: nextAttempts,
        last_error: result.error,
      }
      if (isFinal) {
        update.status = 'failed'
        failed++
      } else {
        update.next_retry_at = computeNextRetry(nextAttempts).toISOString()
        retried++
      }
      await supabase.from('email_outbox').update(update).eq('id', row.id)
    }
  }

  return { picked, sent, retried, failed }
}

// ─── cancelEmail (운영용) ───────────────────────────────────
/**
 * 미발송 메일 취소. pending 상태인 경우만 cancelled 로 전이.
 * 발송된 메일은 회수 불가 (Resend 는 회수 API 없음).
 */
export async function cancelEmail(
  supabase: SBLike,
  outboxId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('email_outbox')
    .update({ status: 'cancelled' })
    .eq('id', outboxId)
    .eq('status', 'pending')

  if (error) return { ok: false, error: JSON.stringify(error) }
  return { ok: true }
}
