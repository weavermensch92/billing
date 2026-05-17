/**
 * Email Client — Resend Provider 통합 (PR A)
 *
 * 트랜잭션 메일 발송 인프라. 모든 메일 발송은 본 모듈을 경유한다.
 *
 * 정책:
 *   - Resend HTTPS API 직접 호출 (의존성 없음, fetch 사용)
 *   - 환경변수 RESEND_API_KEY / EMAIL_FROM 필수 — 미설정 시 즉시 오류
 *   - 이 모듈은 단일 발송 단위만 처리. 큐 / 재시도 / 디스패처는 별도 모듈.
 *   - 발송 결과는 호출자가 핸들링 (Result 타입 반환)
 *
 * 후속 모듈:
 *   - lib/email/outbox.ts (PR B) — email_outbox 테이블 큐 + 재시도
 *   - lib/email/dispatcher.ts (PR C) — notification_preferences 3계층 fallback
 *
 * Resend API 명세: https://resend.com/docs/api-reference/emails/send-email
 */

export interface SendEmailInput {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  /** 발신자. 미지정 시 EMAIL_FROM env 사용. 'Name <email@domain>' 또는 'email@domain' */
  from?: string
  /** 답장받을 주소 (선택) */
  replyTo?: string
  /** 비공개 참조 (선택) */
  bcc?: string | string[]
  /** Resend tag — 분류/추적용 (선택) */
  tags?: Array<{ name: string; value: string }>
}

export type SendEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; statusCode?: number }

const RESEND_API_URL = 'https://api.resend.com/emails'

function getApiKey(): string {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    throw new Error('RESEND_API_KEY env 미설정 — 메일 발송 불가')
  }
  return key
}

function getDefaultFrom(): string {
  const from = process.env.EMAIL_FROM
  if (!from) {
    throw new Error('EMAIL_FROM env 미설정 — 발신자 주소 필요')
  }
  return from
}

/**
 * Resend API 로 메일 발송.
 *
 * @returns ok: true (messageId 반환) / ok: false (에러 메시지 + statusCode)
 *          호출자가 결과를 결정 — throw 안 함.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  // 입력 검증
  if (!input.to || (Array.isArray(input.to) && input.to.length === 0)) {
    return { ok: false, error: 'to 주소 누락' }
  }
  if (!input.subject || input.subject.trim().length === 0) {
    return { ok: false, error: 'subject 누락' }
  }
  if (!input.html && !input.text) {
    return { ok: false, error: 'html 또는 text 본문 필요' }
  }

  let apiKey: string
  let from: string
  try {
    apiKey = getApiKey()
    from = input.from ?? getDefaultFrom()
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  const body: Record<string, unknown> = {
    from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
  }
  if (input.html) body.html = input.html
  if (input.text) body.text = input.text
  if (input.replyTo) body.reply_to = input.replyTo
  if (input.bcc) body.bcc = Array.isArray(input.bcc) ? input.bcc : [input.bcc]
  if (input.tags && input.tags.length > 0) body.tags = input.tags

  let res: Response
  try {
    res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    return { ok: false, error: `Resend API 호출 실패: ${String(err)}` }
  }

  let json: Record<string, unknown>
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    return {
      ok: false,
      error: `Resend 응답 파싱 실패 (status ${res.status})`,
      statusCode: res.status,
    }
  }

  if (!res.ok) {
    const message = (json.message as string) ?? (json.name as string) ?? 'unknown'
    return { ok: false, error: `Resend ${res.status}: ${message}`, statusCode: res.status }
  }

  const messageId = (json.id as string) ?? null
  if (!messageId) {
    return { ok: false, error: 'Resend 응답에 id 없음', statusCode: res.status }
  }

  return { ok: true, messageId }
}

/**
 * 환경 검증 — 운영 셋업 시작 시 호출 가능. 미설정 항목 목록 반환.
 */
export function checkEmailEnv(): { configured: boolean; missing: string[] } {
  const missing: string[] = []
  if (!process.env.RESEND_API_KEY) missing.push('RESEND_API_KEY')
  if (!process.env.EMAIL_FROM) missing.push('EMAIL_FROM')
  return { configured: missing.length === 0, missing }
}
