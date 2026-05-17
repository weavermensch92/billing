/**
 * Email dispatcher 단위 테스트 (PR C)
 *
 * - resolveEnabled: 3계층 fallback
 * - dispatchNotification: 대상 lookup + preference + enqueue
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { dispatchNotification, resolveEnabled } from '@/lib/email/dispatcher'

const ORIG_ENV = { ...process.env }

beforeEach(() => {
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.EMAIL_FROM = 'noreply@gridge.test'
})

afterEach(() => {
  process.env = { ...ORIG_ENV }
})

// ─── resolveEnabled 3계층 ────────────────────────────────
describe('resolveEnabled', () => {
  it('member 본인 설정 우선', () => {
    const r = resolveEnabled(
      'invoice_issued',
      'email',
      [{ channel: 'email', event_type: 'invoice_issued', enabled: false, scope: 'member' }],
      [{ channel: 'email', event_type: 'invoice_issued', enabled: true, scope: 'org' }],
      [{ event_type: 'invoice_issued', channel: 'email', enabled: true }],
    )
    expect(r).toBe(false)
  })

  it('member 없으면 org 사용', () => {
    const r = resolveEnabled(
      'invoice_issued',
      'email',
      [],
      [{ channel: 'email', event_type: 'invoice_issued', enabled: false, scope: 'org' }],
      [{ event_type: 'invoice_issued', channel: 'email', enabled: true }],
    )
    expect(r).toBe(false)
  })

  it('member / org 없으면 system 사용', () => {
    const r = resolveEnabled(
      'invoice_issued',
      'email',
      [],
      [],
      [{ event_type: 'invoice_issued', channel: 'email', enabled: true }],
    )
    expect(r).toBe(true)
  })

  it('전부 없으면 하드코딩 fallback — invoice_issued = true', () => {
    expect(resolveEnabled('invoice_issued', 'email', [], [], [])).toBe(true)
  })

  it('전부 없고 정의 안 된 이벤트 → false', () => {
    expect(resolveEnabled('unknown_event', 'email', [], [], [])).toBe(false)
  })

  it('upsell_signal 디폴트 false (opt-out)', () => {
    expect(resolveEnabled('upsell_signal', 'email', [], [], [])).toBe(false)
  })
})

// ─── dispatchNotification ────────────────────────────────
// 다중 .from() 호출을 시뮬레이션하는 mock builder
function makeSupabaseMock(opts: {
  members: Array<{ id: string; email: string; name: string; role: 'owner' | 'admin' | 'member' }>
  memberPrefs?: Array<{ member_id: string; channel: string; event_type: string; enabled: boolean; scope: string }>
  orgPrefs?: Array<{ channel: string; event_type: string; enabled: boolean; scope: string }>
  systemPrefs?: Array<{ event_type: string; channel: string; enabled: boolean }>
  outboxInsertId?: string | null
  outboxError?: unknown
}) {
  const inserts: Array<Record<string, unknown>> = []

  const fromImpl = vi.fn((table: string) => {
    if (table === 'members') {
      const builder: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: opts.members }),
      }
      // .eq() chain 의 final 도 await 가능하게
      builder.eq.mockImplementation(() => {
        const next: any = {
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: opts.members }),
          then: (resolve: (v: unknown) => unknown) => resolve({ data: opts.members }),
        }
        next.eq.mockReturnValue(next)
        return next
      })
      return builder
    }
    if (table === 'notification_preferences') {
      const builder: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown) => {
          // 마지막 chain 의 await 시 호출. 어떤 쿼리인지 구분 X — 단순화:
          // member_id IN(...) 호출이 있으면 memberPrefs, scope='org' 단독이면 orgPrefs
          // 단순화: 호출 순서로 구분 (loadPreferences 가 member → org 순서)
          return resolve({ data: [] })
        },
      }
      return builder
    }
    if (table === 'v_notification_defaults') {
      const builder: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: opts.systemPrefs ?? [] }),
      }
      return builder
    }
    if (table === 'email_outbox') {
      const builder: any = {
        insert: vi.fn((row: Record<string, unknown>) => {
          inserts.push(row)
          const sel: any = {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: opts.outboxInsertId ? { id: opts.outboxInsertId } : null,
              error: opts.outboxError ?? null,
            }),
          }
          return sel
        }),
      }
      return builder
    }
    return { select: vi.fn().mockReturnThis() }
  })

  return { from: fromImpl, inserts }
}

describe('dispatchNotification — 대상 lookup', () => {
  it('targetRoles 미지정 → owner+admin 만 대상', async () => {
    const supa = makeSupabaseMock({
      members: [
        { id: 'm1', email: 'a@b.com', name: 'A', role: 'owner' },
        { id: 'm2', email: 'b@b.com', name: 'B', role: 'admin' },
      ],
      outboxInsertId: 'box',
    })
    const r = await dispatchNotification(supa as any, {
      eventType: 'invoice_issued',
      orgId: 'org-1',
      payload: { subject: 'Invoice', text: 'hi' },
    })
    expect(r.targets).toBe(2)
    expect(r.enqueued).toBe(2)
    expect(r.outboxIds).toHaveLength(2)
  })

  it('대상 없음 → 0', async () => {
    const supa = makeSupabaseMock({ members: [], outboxInsertId: 'x' })
    const r = await dispatchNotification(supa as any, {
      eventType: 'invoice_issued',
      orgId: 'org-empty',
      payload: { subject: 'x', text: 'y' },
    })
    expect(r.targets).toBe(0)
    expect(r.enqueued).toBe(0)
  })
})

describe('dispatchNotification — channels', () => {
  it('channels=[slack] → 모두 skip (email 만 처리)', async () => {
    const supa = makeSupabaseMock({
      members: [{ id: 'm1', email: 'a@b.com', name: 'A', role: 'owner' }],
      outboxInsertId: 'box',
    })
    const r = await dispatchNotification(supa as any, {
      eventType: 'invoice_issued',
      orgId: 'org-1',
      payload: { subject: 'x', text: 'y' },
      channels: ['slack'],
    })
    expect(r.targets).toBe(1)
    expect(r.enqueued).toBe(0)
    expect(r.skipped).toBe(1)
  })

  it('channels=[email,slack] → email 만 enqueue, slack skip', async () => {
    const supa = makeSupabaseMock({
      members: [{ id: 'm1', email: 'a@b.com', name: 'A', role: 'owner' }],
      outboxInsertId: 'box',
    })
    const r = await dispatchNotification(supa as any, {
      eventType: 'invoice_issued',
      orgId: 'org-1',
      payload: { subject: 'x', text: 'y' },
      channels: ['email', 'slack'],
    })
    expect(r.targets).toBe(1)
    expect(r.enqueued).toBe(1)
    expect(r.skipped).toBe(1)
  })
})

describe('dispatchNotification — enqueue 페이로드', () => {
  it('event_type / org_id / ref / tags 가 큐 row 에 포함', async () => {
    const supa = makeSupabaseMock({
      members: [{ id: 'm1', email: 'a@b.com', name: 'A', role: 'owner' }],
      outboxInsertId: 'box-1',
    })
    await dispatchNotification(supa as any, {
      eventType: 'member_invited',
      orgId: 'org-1',
      payload: { subject: 'Welcome', html: '<p>hi</p>' },
      refTable: 'members',
      refId: 'm-new',
    })
    const row = supa.inserts[0]
    expect(row.event_type).toBe('member_invited')
    expect(row.org_id).toBe('org-1')
    expect(row.ref_table).toBe('members')
    expect(row.ref_id).toBe('m-new')
    expect(row.subject).toBe('Welcome')
    expect(row.body_html).toBe('<p>hi</p>')
    expect(row.to_addrs).toEqual(['a@b.com'])
    expect(row.tags).toEqual([
      { name: 'event', value: 'member_invited' },
      { name: 'org', value: 'org-1' },
      { name: 'member', value: 'm1' },
    ])
  })
})

describe('dispatchNotification — outbox 실패', () => {
  it('outbox INSERT 실패 → failed 카운트', async () => {
    const supa = makeSupabaseMock({
      members: [{ id: 'm1', email: 'a@b.com', name: 'A', role: 'owner' }],
      outboxInsertId: null,
      outboxError: { message: 'fail' },
    })
    const r = await dispatchNotification(supa as any, {
      eventType: 'invoice_issued',
      orgId: 'org-1',
      payload: { subject: 'x', text: 'y' },
    })
    expect(r.targets).toBe(1)
    expect(r.enqueued).toBe(0)
    expect(r.failed).toBe(1)
  })
})
