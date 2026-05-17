/**
 * Email client (Resend) 단위 테스트
 *
 * fetch 를 모킹해 Resend API 호출 형태와 결과 처리를 검증.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendEmail, checkEmailEnv } from '@/lib/email/client'

const ORIG_FETCH = global.fetch
const ORIG_ENV = { ...process.env }

function mockFetch(response: { status: number; body: unknown; throws?: boolean }) {
  global.fetch = vi.fn(async () => {
    if (response.throws) throw new Error('network')
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
    } as Response
  }) as unknown as typeof fetch
}

beforeEach(() => {
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.EMAIL_FROM = 'Gridge <noreply@gridge.test>'
})

afterEach(() => {
  global.fetch = ORIG_FETCH
  process.env = { ...ORIG_ENV }
})

describe('checkEmailEnv', () => {
  it('환경변수 모두 있으면 configured=true', () => {
    expect(checkEmailEnv()).toEqual({ configured: true, missing: [] })
  })

  it('RESEND_API_KEY 누락', () => {
    delete process.env.RESEND_API_KEY
    const r = checkEmailEnv()
    expect(r.configured).toBe(false)
    expect(r.missing).toContain('RESEND_API_KEY')
  })

  it('EMAIL_FROM 누락', () => {
    delete process.env.EMAIL_FROM
    const r = checkEmailEnv()
    expect(r.configured).toBe(false)
    expect(r.missing).toContain('EMAIL_FROM')
  })
})

describe('sendEmail — 입력 검증', () => {
  it('to 누락 → ok:false', async () => {
    const r = await sendEmail({ to: '', subject: 'x', text: 'y' } as never)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/to/)
  })

  it('to 빈 배열 → ok:false', async () => {
    const r = await sendEmail({ to: [], subject: 'x', text: 'y' })
    expect(r.ok).toBe(false)
  })

  it('subject 누락 → ok:false', async () => {
    const r = await sendEmail({ to: 'a@b.com', subject: '', text: 'y' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/subject/)
  })

  it('html/text 둘 다 없음 → ok:false', async () => {
    const r = await sendEmail({ to: 'a@b.com', subject: 'x' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/html|text/)
  })
})

describe('sendEmail — 환경변수', () => {
  it('RESEND_API_KEY 없으면 즉시 에러', async () => {
    delete process.env.RESEND_API_KEY
    const r = await sendEmail({ to: 'a@b.com', subject: 'x', text: 'y' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/RESEND_API_KEY/)
  })

  it('EMAIL_FROM 없으면 즉시 에러 (from 명시 안 한 경우)', async () => {
    delete process.env.EMAIL_FROM
    const r = await sendEmail({ to: 'a@b.com', subject: 'x', text: 'y' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/EMAIL_FROM/)
  })

  it('from 명시 시 EMAIL_FROM 없어도 OK', async () => {
    delete process.env.EMAIL_FROM
    mockFetch({ status: 200, body: { id: 'msg_1' } })
    const r = await sendEmail({
      to: 'a@b.com',
      subject: 'x',
      text: 'y',
      from: 'override@gridge.test',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.messageId).toBe('msg_1')
  })
})

describe('sendEmail — 정상 발송', () => {
  it('200 + id 응답 → ok:true', async () => {
    mockFetch({ status: 200, body: { id: 'msg_abc' } })
    const r = await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '<p>Hi</p>' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.messageId).toBe('msg_abc')
  })

  it('Authorization 헤더에 Bearer 키 포함', async () => {
    mockFetch({ status: 200, body: { id: 'x' } })
    await sendEmail({ to: 'a@b.com', subject: 'x', text: 'y' })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_key',
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('to 가 단일 string 이면 배열로 변환', async () => {
    mockFetch({ status: 200, body: { id: 'x' } })
    await sendEmail({ to: 'a@b.com', subject: 'x', text: 'y' })

    const call = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
    const body = JSON.parse((call[1] as { body: string }).body)
    expect(body.to).toEqual(['a@b.com'])
  })

  it('replyTo / bcc / tags 전달', async () => {
    mockFetch({ status: 200, body: { id: 'x' } })
    await sendEmail({
      to: 'a@b.com',
      subject: 'x',
      text: 'y',
      replyTo: 'reply@gridge.test',
      bcc: 'audit@gridge.test',
      tags: [{ name: 'event', value: 'member_invited' }],
    })

    const call = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
    const body = JSON.parse((call[1] as { body: string }).body)
    expect(body.reply_to).toBe('reply@gridge.test')
    expect(body.bcc).toEqual(['audit@gridge.test'])
    expect(body.tags).toEqual([{ name: 'event', value: 'member_invited' }])
  })
})

describe('sendEmail — 에러 처리', () => {
  it('4xx 응답 → ok:false + statusCode', async () => {
    mockFetch({
      status: 422,
      body: { name: 'validation_error', message: 'Invalid `to`' },
    })
    const r = await sendEmail({ to: 'invalid', subject: 'x', text: 'y' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.statusCode).toBe(422)
      expect(r.error).toMatch(/422/)
    }
  })

  it('500 응답 → ok:false', async () => {
    mockFetch({ status: 500, body: { message: 'internal' } })
    const r = await sendEmail({ to: 'a@b.com', subject: 'x', text: 'y' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.statusCode).toBe(500)
  })

  it('network 에러 (fetch throw) → ok:false', async () => {
    mockFetch({ status: 0, body: null, throws: true })
    const r = await sendEmail({ to: 'a@b.com', subject: 'x', text: 'y' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/network|Resend API 호출 실패/)
  })

  it('200 응답인데 id 없음 → ok:false', async () => {
    mockFetch({ status: 200, body: { something_else: 'oops' } })
    const r = await sendEmail({ to: 'a@b.com', subject: 'x', text: 'y' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/id/)
  })
})
