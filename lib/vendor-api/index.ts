/**
 * Vendor Admin API 진입점
 *
 * executor 는 여기만 import. 실제/Mock 분기는 내부에서 결정:
 *   - NEXT_PUBLIC_MOCK_MODE=true → mock 어댑터
 *   - 실제 API 키 미설정 → mock 자동 fallback (개발 편의)
 *   - 그 외 → 실제 API 호출
 *
 * 호출 결과는 vendor_api_calls 테이블에 Immutable 기록.
 */

import { anthropicAdapter } from './anthropic'
import { mockAnthropicAdapter } from './mock-anthropic'
import { openaiAdapter } from './openai'
import { mockOpenaiAdapter } from './mock-openai'
import type { VendorAdapter, VendorName, VendorCallResult } from './types'

export * from './types'

function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_MODE === 'true'
}

/**
 * 벤더명 → 어댑터 선택.
 * Mock 모드이거나 실제 키 미설정 시 mock 반환.
 * 지원 안 하는 벤더는 null.
 */
export function getVendorAdapter(vendor: VendorName): VendorAdapter | null {
  switch (vendor) {
    case 'anthropic':
      if (isMockMode() || !anthropicAdapter.isConfigured()) {
        return mockAnthropicAdapter
      }
      return anthropicAdapter

    case 'openai':
      if (isMockMode() || !openaiAdapter.isConfigured()) {
        return mockOpenaiAdapter
      }
      return openaiAdapter

    // Phase 1 확장: Google / Cursor
    case 'google':
    case 'cursor':
      return null
  }
}

/**
 * 벤더 API 호출 결과를 vendor_api_calls 테이블에 기록.
 * executor 에서 호출 전후로 래핑.
 */
type SB = {
  from: (t: string) => {
    insert: (v: Record<string, unknown>) => Promise<{ error: unknown }>
  }
}

export async function logVendorCall(
  supabase: SB,
  params: {
    org_id: string
    vendor: VendorName
    operation:
      | 'invite_member' | 'remove_member' | 'list_members'
      | 'set_spend_limit' | 'get_usage' | 'create_api_key' | 'revoke_api_key'
    account_id?: string | null
    request_id?: string | null
    request_body?: Record<string, unknown>
    result: VendorCallResult
  },
): Promise<void> {
  try {
    await supabase.from('vendor_api_calls').insert({
      org_id: params.org_id,
      vendor: params.vendor,
      operation: params.operation,
      account_id: params.account_id ?? null,
      request_id: params.request_id ?? null,
      http_status: params.result.http_status ?? null,
      success: params.result.ok,
      request_body: params.request_body ?? {},
      response_body: (params.result.data as Record<string, unknown>) ?? {},
      provider_ref: params.result.provider_ref ?? null,
      error_message: params.result.error ?? null,
      latency_ms: params.result.latency_ms,
      is_mock: params.result.is_mock,
    })
  } catch {
    // 감사 로그 실패는 주 흐름을 막지 않음 (best-effort)
  }
}
