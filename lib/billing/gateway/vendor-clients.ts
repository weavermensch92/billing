/**
 * Gridge Gateway — Vendor 별 upstream client 추상화
 *
 * 게이트웨이가 호출하는 upstream 벤더 (Anthropic, OpenAI, Google, ...) 마다
 * 다른 endpoint URL / 인증 헤더 / 사용량 응답 구조를 추상화.
 *
 * 라우트는 product.upstream_vendor 에 따라 적절한 client 를 선택해 호출.
 *
 * 다중 vendor 확장 정책:
 *   - 신규 vendor 추가 = 본 파일에 entry 추가
 *   - body 변환은 호출자 (라우트) 가 product.upstream_model 만 강제 후 pass-through
 *   - usage 파싱은 vendor 별 차이 흡수 (Anthropic input_tokens vs OpenAI prompt_tokens)
 */

export interface VendorUsage {
  inputTokens: number
  outputTokens: number
  requestId: string | null
}

export interface VendorClient {
  vendor: string

  /** upstream API endpoint URL (POST). */
  url: string

  /**
   * 인증 + 메타 헤더 구성. content-type 은 호출자가 추가.
   * @param apiKey 복호화된 admin token 평문
   */
  buildHeaders(apiKey: string): Record<string, string>

  /** 응답 JSON 에서 토큰 사용량 + request_id 추출 (vendor 별 키 이름 흡수) */
  parseUsage(response: Record<string, unknown>): VendorUsage
}

// ─── Anthropic ─────────────────────────────────────────────────
const anthropicClient: VendorClient = {
  vendor: 'anthropic',
  url: 'https://api.anthropic.com/v1/messages',
  buildHeaders(apiKey) {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
  },
  parseUsage(json) {
    const usage = (json.usage as { input_tokens?: number; output_tokens?: number }) ?? {}
    return {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      requestId: (json.id as string) ?? null,
    }
  },
}

// ─── 벤더 레지스트리 ───────────────────────────────────────────
// 신규 vendor 추가 시 본 객체에 entry 추가.
// 현재는 anthropic 만 구현. OpenAI / Google / Cursor 는 별도 PR.
const VENDOR_CLIENTS: Record<string, VendorClient> = {
  anthropic: anthropicClient,
}

/**
 * upstream vendor 명으로 클라이언트 lookup.
 *
 * @returns 매칭되면 client, 아니면 null (호출자가 501 / 503 분기)
 */
export function getVendorClient(vendor: string): VendorClient | null {
  return VENDOR_CLIENTS[vendor] ?? null
}

/** 게이트웨이가 호출 가능한 vendor 목록 (UI 안내용) */
export function listSupportedVendors(): string[] {
  return Object.keys(VENDOR_CLIENTS)
}
