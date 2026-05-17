/**
 * Gateway vendor-clients 추상화 단위 테스트
 *
 * 다중 vendor 분기 인터페이스 검증 — 라우트는 product.upstream_vendor 로 client lookup.
 */

import { describe, it, expect } from 'vitest'
import {
  getVendorClient,
  listSupportedVendors,
} from '@/lib/billing/gateway/vendor-clients'

describe('listSupportedVendors', () => {
  it('현재 anthropic 만 지원', () => {
    const supported = listSupportedVendors()
    expect(supported).toContain('anthropic')
  })
})

describe('getVendorClient', () => {
  it('anthropic → client 반환', () => {
    const c = getVendorClient('anthropic')
    expect(c).not.toBeNull()
    expect(c?.vendor).toBe('anthropic')
    expect(c?.url).toBe('https://api.anthropic.com/v1/messages')
  })

  it('미지원 vendor → null', () => {
    expect(getVendorClient('openai')).toBeNull()
    expect(getVendorClient('google')).toBeNull()
    expect(getVendorClient('cursor')).toBeNull()
    expect(getVendorClient('unknown-vendor')).toBeNull()
  })
})

describe('anthropic client', () => {
  const client = getVendorClient('anthropic')!

  it('buildHeaders 가 x-api-key 와 anthropic-version 포함', () => {
    const headers = client.buildHeaders('sk-ant-test')
    expect(headers['x-api-key']).toBe('sk-ant-test')
    expect(headers['anthropic-version']).toBe('2023-06-01')
  })

  it('parseUsage 가 input_tokens/output_tokens 추출', () => {
    const result = client.parseUsage({
      id: 'msg_abc',
      usage: { input_tokens: 100, output_tokens: 50 },
    })
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(50)
    expect(result.requestId).toBe('msg_abc')
  })

  it('parseUsage 가 usage 없을 때 0 반환', () => {
    const result = client.parseUsage({ id: null })
    expect(result.inputTokens).toBe(0)
    expect(result.outputTokens).toBe(0)
    expect(result.requestId).toBeNull()
  })

  it('parseUsage 가 부분 usage 도 처리', () => {
    const result = client.parseUsage({
      id: 'x',
      usage: { input_tokens: 10 }, // output_tokens 누락
    })
    expect(result.inputTokens).toBe(10)
    expect(result.outputTokens).toBe(0)
  })
})
