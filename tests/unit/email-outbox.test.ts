/**
 * Email outbox 단위 테스트 (PR B)
 *
 * enqueueEmail / processOutbox / cancelEmail / computeNextRetry 검증.
 * Supabase 클라이언트 + sendEmail 호출자 모킹.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  enqueueEmail,
  processOutbox,
  cancelEmail,
  computeNextRetry,
} from '@/lib/email/outbox'
import type { SendEmailResult } from '@/lib/email/client'

// ─── Supabase mock builder ────────────────────────────────
function makeInsertMock(returnRow: { id: string } | null, error: unknown = null) {
  const builder: any = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: returnRow, error }),
  }
  return {
    from: vi.fn().mockReturnValue(builder),
    builder,
  }
}

function makeSelectMock(rows: unknown[] | null) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
  const fromImpl = vi.fn((_table: string) => {
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows }),
      update: vi.fn((patch: Record<string, unknown>) => {
        // update().eq(id, value).eq(status, 'pending') 등 다중 체이닝 모두 지원.
        // 첫 .eq() 호출 시 id 추출 → updates 기록 → thenable 객체 반환.
        // 후속 .eq() 호출은 동일 thenable 을 반환해 await 시 { error: null } 로 resolve.
        let captured = false
        const thenable: any = {
          eq: vi.fn(function (col: string, value: string) {
            if (!captured && col === 'id') {
              updates.push({ id: value, patch })
              captured = true
            }
            return thenable
          }),
          then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
        }
        return thenable
      }),
    }
    return builder
  })
  return { from: fromImpl, updates }
}

// ─── computeNextRetry ─────────────────────────────────────
describe('computeNextRetry — exponential backoff', () => {
  const base = new Date('2026-05-17T00:00:00Z')

  it('attempts=1 → +1m', () => {
    const next = computeNextRetry(1, base)
    expect(next.getTime() - base.getTime()).toBe(60 * 1000)
  })

  it('attempts=2 → +5m', () => {
    const next = computeNextRetry(2, base)
    expect(next.getTime() - base.getTime()).toBe(5 * 60 * 1000)
  })

  it('attempts=3 → +30m', () => {
    const next = computeNextRetry(3, base)
    expect(next.getTime() - base.getTime()).toBe(30 * 60 * 1000)
  })

  it('attempts=4 → +1h', () => {
    const next = computeNextRetry(4, base)
    expect(next.getTime() - base.getTime()).toBe(60 * 60 * 1000)
  })

  it('attempts=5 → +6h (마지막)', () => {
    const next = computeNextRetry(5, base)
    expect(next.getTime() - base.getTime()).toBe(6 * 60 * 60 * 1000)
  })

  it('attempts > 5 도 +6h 로 cap (배열 인덱스 초과 보호)', () => {
    const next = computeNextRetry(10, base)
    expect(next.getTime() - base.getTime()).toBe(6 * 60 * 60 * 1000)
  })
})

// ─── enqueueEmail ─────────────────────────────────────────
describe('enqueueEmail', () => {
  it('입력 검증: to 누락', async () => {
    const supa = makeInsertMock({ id: 'x' })
    const r = await enqueueEmail(supa as any, { to: '', subject: 'x', text: 'y' } as never)
    expect(r.ok).toBe(false)
  })

  it('입력 검증: subject 누락', async () => {
    const supa = makeInsertMock({ id: 'x' })
    const r = await enqueueEmail(supa as any, { to: 'a@b.com', subject: '', text: 'y' })
    expect(r.ok).toBe(false)
  })

  it('입력 검증: html / text 둘 다 없음', async () => {
    const supa = makeInsertMock({ id: 'x' })
    const r = await enqueueEmail(supa as any, { to: 'a@b.com', subject: 'x' })
    expect(r.ok).toBe(false)
  })

  it('정상 INSERT → outboxId 반환', async () => {
    const supa = makeInsertMock({ id: 'box_1' })
    const r = await enqueueEmail(supa as any, {
      to: 'a@b.com',
      subject: 'Welcome',
      html: '<p>hi</p>',
      eventType: 'member_invited',
      orgId: 'org-1',
      refTable: 'members',
      refId: 'mem-1',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.outboxId).toBe('box_1')

    const insertCall = supa.builder.insert.mock.calls[0][0]
    expect(insertCall.to_addrs).toEqual(['a@b.com'])
    expect(insertCall.subject).toBe('Welcome')
    expect(insertCall.body_html).toBe('<p>hi</p>')
    expect(insertCall.event_type).toBe('member_invited')
    expect(insertCall.org_id).toBe('org-1')
    expect(insertCall.ref_table).toBe('members')
    expect(insertCall.ref_id).toBe('mem-1')
    expect(insertCall.status).toBe('pending')
    expect(insertCall.attempts).toBe(0)
    expect(insertCall.max_attempts).toBe(5)
  })

  it('to 가 string → 배열로 변환', async () => {
    const supa = makeInsertMock({ id: 'box_1' })
    await enqueueEmail(supa as any, { to: 'a@b.com', subject: 'x', text: 'y' })
    const insertCall = supa.builder.insert.mock.calls[0][0]
    expect(insertCall.to_addrs).toEqual(['a@b.com'])
  })

  it('bcc string → 배열로 변환, replyTo/tags 전달', async () => {
    const supa = makeInsertMock({ id: 'box_1' })
    await enqueueEmail(supa as any, {
      to: 'a@b.com',
      subject: 'x',
      text: 'y',
      bcc: 'audit@gridge.test',
      replyTo: 'r@gridge.test',
      tags: [{ name: 'event', value: 'x' }],
    })
    const insertCall = supa.builder.insert.mock.calls[0][0]
    expect(insertCall.bcc_addrs).toEqual(['audit@gridge.test'])
    expect(insertCall.reply_to).toBe('r@gridge.test')
    expect(insertCall.tags).toEqual([{ name: 'event', value: 'x' }])
  })

  it('DB error → ok:false', async () => {
    const supa = makeInsertMock(null, { message: 'fail' })
    const r = await enqueueEmail(supa as any, { to: 'a@b.com', subject: 'x', text: 'y' })
    expect(r.ok).toBe(false)
  })
})

// ─── processOutbox ────────────────────────────────────────
describe('processOutbox', () => {
  const row = (over: Partial<{ id: string; attempts: number; max_attempts: number }> = {}) => ({
    id: over.id ?? 'box_1',
    to_addrs: ['a@b.com'],
    from_addr: null,
    reply_to: null,
    bcc_addrs: null,
    subject: 'x',
    body_html: '<p>y</p>',
    body_text: null,
    tags: [],
    attempts: over.attempts ?? 0,
    max_attempts: over.max_attempts ?? 5,
  })

  it('큐 비어있을 때 → 0,0,0,0', async () => {
    const supa = makeSelectMock([])
    const send = vi.fn<[], Promise<SendEmailResult>>()
    const r = await processOutbox(supa as any, { send })
    expect(r).toEqual({ picked: 0, sent: 0, retried: 0, failed: 0 })
    expect(send).not.toHaveBeenCalled()
  })

  it('성공 → status=sent + message_id', async () => {
    const supa = makeSelectMock([row({ id: 'box_1' })])
    const send = vi.fn(async (): Promise<SendEmailResult> => ({ ok: true, messageId: 'msg_x' }))

    const r = await processOutbox(supa as any, { send })
    expect(r).toEqual({ picked: 1, sent: 1, retried: 0, failed: 0 })

    expect(supa.updates).toHaveLength(1)
    const u = supa.updates[0]
    expect(u.id).toBe('box_1')
    expect(u.patch.status).toBe('sent')
    expect(u.patch.message_id).toBe('msg_x')
    expect(u.patch.sent_at).toBeTypeOf('string')
  })

  it('실패 + 재시도 여유 → retried + next_retry_at 갱신', async () => {
    const supa = makeSelectMock([row({ id: 'box_2', attempts: 0, max_attempts: 5 })])
    const send = vi.fn(async (): Promise<SendEmailResult> => ({ ok: false, error: '503' }))

    const r = await processOutbox(supa as any, { send })
    expect(r).toEqual({ picked: 1, sent: 0, retried: 1, failed: 0 })

    const u = supa.updates[0]
    expect(u.patch.attempts).toBe(1)
    expect(u.patch.last_error).toBe('503')
    expect(u.patch.next_retry_at).toBeTypeOf('string')
    expect(u.patch.status).toBeUndefined() // 아직 failed 아님
  })

  it('실패 + 마지막 시도 → failed', async () => {
    // 이미 attempts=4 (다음이 5 = max)
    const supa = makeSelectMock([row({ id: 'box_3', attempts: 4, max_attempts: 5 })])
    const send = vi.fn(async (): Promise<SendEmailResult> => ({ ok: false, error: 'final' }))

    const r = await processOutbox(supa as any, { send })
    expect(r).toEqual({ picked: 1, sent: 0, retried: 0, failed: 1 })

    const u = supa.updates[0]
    expect(u.patch.attempts).toBe(5)
    expect(u.patch.status).toBe('failed')
  })

  it('batchSize 옵션 전달 (limit 호출 검증)', async () => {
    const supa = makeSelectMock([])
    await processOutbox(supa as any, { batchSize: 50, send: vi.fn() })
    // limit(50) 호출 — mock 의 마지막 chain
    const builder = supa.from.mock.results[0].value
    expect(builder.limit).toHaveBeenCalledWith(50)
  })

  it('여러 row 혼합 (성공 + 재시도 + 실패)', async () => {
    const supa = makeSelectMock([
      row({ id: 'ok', attempts: 0, max_attempts: 5 }),
      row({ id: 'retry', attempts: 1, max_attempts: 5 }),
      row({ id: 'final', attempts: 4, max_attempts: 5 }),
    ])
    let call = 0
    const send = vi.fn(async (): Promise<SendEmailResult> => {
      call++
      if (call === 1) return { ok: true, messageId: 'm' }
      return { ok: false, error: 'x' }
    })

    const r = await processOutbox(supa as any, { send })
    expect(r).toEqual({ picked: 3, sent: 1, retried: 1, failed: 1 })

    const byId = Object.fromEntries(supa.updates.map(u => [u.id, u.patch]))
    expect(byId.ok.status).toBe('sent')
    expect(byId.retry.attempts).toBe(2)
    expect(byId.retry.status).toBeUndefined()
    expect(byId.final.status).toBe('failed')
  })
})

// ─── cancelEmail ──────────────────────────────────────────
describe('cancelEmail', () => {
  it('pending 인 outbox row 를 cancelled 로 전이', async () => {
    const supa = makeSelectMock([])
    const r = await cancelEmail(supa as any, 'box_1')
    expect(r.ok).toBe(true)
  })
})
