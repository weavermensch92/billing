/**
 * Gridge 게이트웨이 — POST /api/v1/gateway/messages
 *
 * Anthropic Messages API 호환 인터페이스. 향후 OpenAI Chat Completions 도 동일 경로
 * 또는 분기로 확장 (현재는 product.upstream_vendor 가 'anthropic' 인 경우만 지원).
 *
 * 흐름:
 *   1) Bearer 키 인증 (lib/gateway/auth.ts)
 *   2) Product 조회 + is_active + rate_limit / daily_cap 확인 (생략 — 단순화)
 *   3) wallet 잔액 사전 체크 (옵션)
 *   4) upstream fetch
 *   5) 토큰 사용량 → cost_krw 계산 (단가 스냅샷)
 *   6) consume_wallet 호출
 *   7) gridge_api_usage_events INSERT (Immutable)
 *   8) 응답 반환
 *
 * 실패 매트릭스:
 *   401 Unauthorized — 키 없음/잘못됨/revoked
 *   402 Payment Required — wallet 잔액 부족
 *   403 Forbidden — product 비활성
 *   429 Too Many Requests — rate limit (PR #5 본 PR 에서는 미구현, 차후 강화)
 *   502 Bad Gateway — upstream 실패
 */

import { NextResponse } from 'next/server'
import { authenticateGridgeKey, touchKeyUsage } from '@/lib/gateway/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

type AnthropicUsage = { input_tokens?: number; output_tokens?: number }

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { type: 'gridge_gateway_error', code, message } },
    { status },
  )
}

export async function POST(req: Request) {
  const startedAt = Date.now()
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null

  // 1) 인증
  const auth = await authenticateGridgeKey(req)
  if (!auth.ok) {
    return errorResponse(auth.status, 'unauthorized', auth.error)
  }
  const key = auth.key

  // 2) Product 조회
  const service = createServiceRoleClient()
  const { data: productRaw } = await service
    .from('gridge_api_products')
    .select('id, code, is_active, upstream_vendor, upstream_model, input_price_per_1k_krw, output_price_per_1k_krw, min_charge_krw')
    .eq('id', key.product_id)
    .maybeSingle()

  const product = productRaw as {
    id: string
    code: string
    is_active: boolean
    upstream_vendor: string
    upstream_model: string
    input_price_per_1k_krw: number
    output_price_per_1k_krw: number
    min_charge_krw: number
  } | null

  if (!product) {
    return errorResponse(500, 'product_not_found', '상품 정보를 찾을 수 없습니다.')
  }
  if (!product.is_active) {
    return errorResponse(403, 'product_inactive', `상품이 비활성화되었습니다: ${product.code}`)
  }
  if (product.upstream_vendor !== 'anthropic') {
    return errorResponse(
      501,
      'upstream_not_supported',
      `${product.upstream_vendor} 라우팅은 아직 미구현 (PR #5 v1: anthropic 만).`,
    )
  }

  // 3) Body 파싱 + 모델 강제 (보안: 고객이 임의 모델 지정 못함)
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return errorResponse(400, 'invalid_json', 'Request body 가 올바른 JSON 이 아닙니다.')
  }

  // 모델은 product 의 upstream_model 로 고정 — 고객이 임의 변경 못 함
  body.model = product.upstream_model

  // 4) Upstream API 호출 (Anthropic)
  const upstreamKey = process.env.ANTHROPIC_API_KEY
  if (!upstreamKey) {
    return errorResponse(500, 'upstream_config_missing', 'Upstream 키 미설정 (ANTHROPIC_API_KEY)')
  }

  let upstreamRes: Response
  let upstreamJson: Record<string, unknown>
  try {
    upstreamRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': upstreamKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    upstreamJson = (await upstreamRes.json()) as Record<string, unknown>
  } catch (err) {
    return errorResponse(502, 'upstream_error', `Upstream 호출 실패: ${String(err)}`)
  }

  const latencyMs = Date.now() - startedAt

  // 5) 토큰 사용량 + 단가 스냅샷 → cost_krw
  const usage = (upstreamJson.usage as AnthropicUsage) ?? {}
  const inputTokens = usage.input_tokens ?? 0
  const outputTokens = usage.output_tokens ?? 0
  const inputCost = (inputTokens / 1000) * product.input_price_per_1k_krw
  const outputCost = (outputTokens / 1000) * product.output_price_per_1k_krw
  const rawCost = Math.ceil(inputCost + outputCost)
  const costKrw = Math.max(product.min_charge_krw, rawCost)

  // 6) Wallet 차감 (성공 응답일 때만)
  let walletLedgerId: string | null = null
  let errorCode: string | null = null
  if (upstreamRes.ok && costKrw > 0) {
    try {
      const { data: consumeRes } = await service.rpc('consume_wallet', {
        p_org_id: key.org_id,
        p_amount_krw: costKrw,
        p_reason: 'gridge_api_usage',
        p_detail: {
          key_id: key.id,
          product_code: product.code,
          model: product.upstream_model,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        },
      })
      const result = (consumeRes ?? [])[0] as { success: boolean; consumed_krw: number; remaining_krw: number } | undefined
      if (!result?.success) {
        errorCode = 'wallet_insufficient'
        // 잔액 부족이지만 upstream 이 이미 호출됨 — 사용은 기록하되 결과는 402 반환
      }
      // wallet_ledger_id 는 별도 SELECT 필요 (consume_wallet 반환에 없음)
    } catch (err) {
      console.error('[gateway consume_wallet]', err)
      errorCode = 'wallet_error'
    }
  }

  // 7) Usage event 기록 (Immutable, best-effort)
  try {
    await service.from('gridge_api_usage_events').insert({
      key_id: key.id,
      org_id: key.org_id,
      product_id: product.id,
      request_id: (upstreamJson.id as string) ?? null,
      model_used: product.upstream_model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      status_code: upstreamRes.status,
      error_code: errorCode,
      input_price_per_1k_krw_snapshot: product.input_price_per_1k_krw,
      output_price_per_1k_krw_snapshot: product.output_price_per_1k_krw,
      cost_krw: costKrw,
      upstream_vendor: product.upstream_vendor,
      upstream_request_id: (upstreamJson.id as string) ?? null,
      upstream_cost_usd: null, // PR #5 v2 에서 환율 계산 추가
      wallet_ledger_id: walletLedgerId,
    })
  } catch (err) {
    console.error('[gateway usage event]', err)
  }

  // 8) key 사용량 메타 갱신 (fire-and-forget)
  void touchKeyUsage(key.id, clientIp)

  // 9) 응답 반환
  if (errorCode === 'wallet_insufficient') {
    return errorResponse(
      402,
      'wallet_insufficient',
      'Org wallet 잔액 부족. 충전 후 재시도하세요.',
    )
  }

  return NextResponse.json(upstreamJson, { status: upstreamRes.status })
}

// GET 등은 허용 안 함
export function GET() {
  return errorResponse(405, 'method_not_allowed', 'POST 만 지원합니다.')
}
