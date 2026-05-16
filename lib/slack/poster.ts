/**
 * Slack Poster — 채널 자동 포스팅 + slack_messages 기록
 *
 * 5번 흐름 (충전 컨펌 → 슬랙 자동 포스팅) 트리거 진입점.
 * Block Kit 메시지 생성 후 Slack chat.postMessage API 호출.
 * 응답의 ts를 slack_messages.message_ts에 저장 → 추후 ✅ 리액션 매칭.
 *
 * Env:
 *   SLACK_BOT_TOKEN  (xoxb-)
 *   SLACK_TAX_INVOICE_CHANNEL_ID
 */

type SBLike = { from: (t: string) => any }

const SLACK_API = 'https://slack.com/api/chat.postMessage'

export interface PostTaxInvoiceRequestInput {
  orgId: string
  orgName: string
  walletChargeId: string
  amountKrwGross: number     // 충전 신청 금액
  amountKrwNet: number       // 90% 가격 (세계 발행액)
  discountRate: number
  taxContact: {
    name: string
    email: string
    phone?: string
  }
  businessRegistrationNumber?: string
}

export interface PostResult {
  ok: boolean
  messageTs?: string
  channelId?: string
  error?: string
}

export async function postTaxInvoiceRequest(
  supabase: SBLike,
  input: PostTaxInvoiceRequestInput,
  config?: { botToken?: string; channelId?: string },
): Promise<PostResult> {
  const botToken = config?.botToken ?? process.env.SLACK_BOT_TOKEN
  const channelId = config?.channelId ?? process.env.SLACK_TAX_INVOICE_CHANNEL_ID
  if (!botToken || !channelId) {
    return { ok: false, error: 'SLACK_BOT_TOKEN or SLACK_TAX_INVOICE_CHANNEL_ID missing' }
  }

  const blocks = buildTaxInvoiceBlocks(input)
  const text = `세금계산서 발행 신청 — ${input.orgName} / ₩${formatKrw(input.amountKrwNet)} (${(input.discountRate * 100).toFixed(0)}% 할인 적용)`

  const res = await fetch(SLACK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify({ channel: channelId, text, blocks }),
  })

  const body = (await res.json()) as { ok: boolean; ts?: string; error?: string }
  if (!body.ok) {
    return { ok: false, error: body.error ?? 'unknown' }
  }

  // slack_messages 기록 + wallet_charge와 연결
  await supabase.from('slack_messages').insert({
    channel_id: channelId,
    message_ts: body.ts!,
    subject: 'tax_invoice_request',
    related_org_id: input.orgId,
    related_wallet_charge_id: input.walletChargeId,
    posted_by: 'system',
    posted_payload: { text, blocks, input },
    status: 'posted',
  })

  return { ok: true, messageTs: body.ts, channelId }
}

function buildTaxInvoiceBlocks(input: PostTaxInvoiceRequestInput) {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `🧾 세금계산서 발행 신청 — ${input.orgName}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*충전 신청액 (gross)*\n₩${formatKrw(input.amountKrwGross)}` },
        { type: 'mrkdwn', text: `*할인율*\n${(input.discountRate * 100).toFixed(0)}%` },
        { type: 'mrkdwn', text: `*세금계산서 발행액 (net)*\n*₩${formatKrw(input.amountKrwNet)}*` },
        { type: 'mrkdwn', text: `*담당자*\n${input.taxContact.name}` },
        { type: 'mrkdwn', text: `*이메일*\n${input.taxContact.email}` },
        ...(input.taxContact.phone ? [{ type: 'mrkdwn', text: `*전화*\n${input.taxContact.phone}` }] : []),
        ...(input.businessRegistrationNumber
          ? [{ type: 'mrkdwn', text: `*사업자등록번호*\n${input.businessRegistrationNumber}` }]
          : []),
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_wallet_charge: \`${input.walletChargeId}\` · 발행 완료 시 ✅ 리액션_`,
        },
      ],
    },
  ]
}

function formatKrw(n: number): string {
  return n.toLocaleString('ko-KR')
}
