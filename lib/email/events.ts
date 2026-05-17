/**
 * Email Events — 표준 페이로드 + dispatchNotification 호출 헬퍼 (PR D)
 *
 * 각 이벤트마다 본문/제목을 빌드하고 dispatcher 를 호출하는 단일 함수.
 * 호출 사이트 (서버 액션 / 라우트) 는 1 line 으로 호출 가능.
 *
 * 호출자에 영향 주지 않도록 Result 타입 반환 + best-effort 패턴 권장.
 */

import { dispatchNotification, type DispatchResult } from './dispatcher'

type SBLike = {
  from: (t: string) => any
  rpc?: (name: string, params?: Record<string, unknown>) => any
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.gridge.ai'
}

function consoleUrl(): string {
  return process.env.NEXT_PUBLIC_CONSOLE_URL ?? 'https://console.gridge.ai'
}

function fmtKrw(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return `₩${amount.toLocaleString('ko-KR')}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ─── 1. invoice_issued ──────────────────────────────────
export interface NotifyInvoiceIssuedInput {
  invoiceId: string
  orgId: string
  billingMonth: string
  totalDueKrw: number
}

export async function notifyInvoiceIssued(
  supabase: SBLike,
  input: NotifyInvoiceIssuedInput,
): Promise<DispatchResult> {
  const link = `${appUrl()}/billing/${escapeHtml(input.invoiceId)}`
  const subject = `[Gridge] ${input.billingMonth} 청구서가 발행됐습니다 (${fmtKrw(input.totalDueKrw)})`
  const text = [
    `안녕하세요, Gridge 청구서가 발행됐습니다.`,
    ``,
    `청구 월: ${input.billingMonth}`,
    `청구 금액: ${fmtKrw(input.totalDueKrw)} (VAT 포함)`,
    ``,
    `상세 확인: ${link}`,
    ``,
    `납부 방법 및 일정은 청구서 페이지에서 확인하실 수 있습니다.`,
  ].join('\n')
  const html = `
    <p>안녕하세요, Gridge 청구서가 발행됐습니다.</p>
    <table>
      <tr><td>청구 월</td><td><strong>${escapeHtml(input.billingMonth)}</strong></td></tr>
      <tr><td>청구 금액</td><td><strong>${fmtKrw(input.totalDueKrw)}</strong> (VAT 포함)</td></tr>
    </table>
    <p><a href="${link}">청구서 상세 보기 →</a></p>
    <p>납부 방법 및 일정은 청구서 페이지에서 확인하실 수 있습니다.</p>
  `

  return dispatchNotification(supabase, {
    eventType: 'invoice_issued',
    orgId: input.orgId,
    payload: { subject, text, html },
    targetRoles: ['owner', 'admin'],
    refTable: 'invoices',
    refId: input.invoiceId,
  })
}

// ─── 2. member_invited ──────────────────────────────────
export interface NotifyMemberInvitedInput {
  orgId: string
  /** 초대된 멤버의 정보 (본인은 Auth 매직링크로 별도 수신) */
  invitedEmail: string
  invitedName: string
  invitedRole: 'owner' | 'admin' | 'member'
  /** 초대를 수행한 사람 (확인용 정보 — 본인은 발송 대상에서 제외) */
  invitedByEmail: string | null
  /** 추적용 */
  memberId?: string | null
}

export async function notifyMemberInvited(
  supabase: SBLike,
  input: NotifyMemberInvitedInput,
): Promise<DispatchResult> {
  // 초대된 본인은 Auth 매직링크로 별도 수신. 본 알림은 org 의 다른 owner/admin
  // 에게 "초대가 일어났다" 를 알리는 용도.
  const subject = `[Gridge] 새 멤버 초대 — ${input.invitedEmail} (${input.invitedRole})`
  const text = [
    `조직에 새 멤버가 초대됐습니다.`,
    ``,
    `이메일: ${input.invitedEmail}`,
    `이름: ${input.invitedName}`,
    `역할: ${input.invitedRole}`,
    input.invitedByEmail ? `초대자: ${input.invitedByEmail}` : '',
    ``,
    `멤버 페이지: ${appUrl()}/org/members`,
  ].filter(Boolean).join('\n')
  const html = `
    <p>조직에 새 멤버가 초대됐습니다.</p>
    <table>
      <tr><td>이메일</td><td><strong>${escapeHtml(input.invitedEmail)}</strong></td></tr>
      <tr><td>이름</td><td>${escapeHtml(input.invitedName)}</td></tr>
      <tr><td>역할</td><td>${escapeHtml(input.invitedRole)}</td></tr>
      ${input.invitedByEmail ? `<tr><td>초대자</td><td>${escapeHtml(input.invitedByEmail)}</td></tr>` : ''}
    </table>
    <p><a href="${appUrl()}/org/members">멤버 페이지 →</a></p>
  `

  return dispatchNotification(supabase, {
    eventType: 'member_invited',
    orgId: input.orgId,
    payload: { subject, text, html },
    targetRoles: ['owner', 'admin'],
    refTable: 'members',
    refId: input.memberId ?? null,
  })
}

// ─── 3. payment_declined ────────────────────────────────
export interface NotifyPaymentDeclinedInput {
  orgId: string
  transactionId: string
  vendor: string
  amountKrw: number | null
  reason: string | null
  merchant: string | null
}

export async function notifyPaymentDeclined(
  supabase: SBLike,
  input: NotifyPaymentDeclinedInput,
): Promise<DispatchResult> {
  const subject = `[Gridge ⚠] 결제 거절 — ${input.vendor}${input.amountKrw ? ` (${fmtKrw(input.amountKrw)})` : ''}`
  const text = [
    `결제 거절이 발생했습니다. 즉시 확인이 필요합니다.`,
    ``,
    `벤더: ${input.vendor}`,
    input.merchant ? `가맹점: ${input.merchant}` : '',
    `금액: ${fmtKrw(input.amountKrw)}`,
    input.reason ? `사유: ${input.reason}` : '',
    ``,
    `결제 페이지: ${appUrl()}/billing`,
    `상세: ${consoleUrl()}/console/payments`,
  ].filter(Boolean).join('\n')
  const html = `
    <p><strong>⚠ 결제 거절이 발생했습니다.</strong> 즉시 확인이 필요합니다.</p>
    <table>
      <tr><td>벤더</td><td><strong>${escapeHtml(input.vendor)}</strong></td></tr>
      ${input.merchant ? `<tr><td>가맹점</td><td>${escapeHtml(input.merchant)}</td></tr>` : ''}
      <tr><td>금액</td><td><strong>${fmtKrw(input.amountKrw)}</strong></td></tr>
      ${input.reason ? `<tr><td>사유</td><td>${escapeHtml(input.reason)}</td></tr>` : ''}
    </table>
    <p><a href="${appUrl()}/billing">결제 페이지 보기 →</a></p>
  `

  return dispatchNotification(supabase, {
    eventType: 'payment_declined',
    orgId: input.orgId,
    payload: { subject, text, html },
    targetRoles: ['owner', 'admin'],
    refTable: 'transactions',
    refId: input.transactionId,
  })
}
