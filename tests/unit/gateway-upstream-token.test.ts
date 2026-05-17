/**
 * Gridge Gateway Upstream Token Resolver 단위 테스트 (PR #29)
 *
 * resolveUpstreamToken 의 핵심 동작:
 *  - vendor_admin_tokens.active 토큰 1건 선택
 *  - token_encrypted 를 AES-256-GCM 으로 복호화
 *  - mark_token_used RPC 호출 (best-effort)
 *  - 매칭 실패 시 null 반환
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { encryptToken } from '@/lib/vendor-api/token-broker'
import {
  resolveUpstreamToken,
  resolveUpstreamTokenById,
} from '@/lib/billing/gateway/upstream-token'

beforeEach(() => {
  // AES-256 키 (32 bytes base64) — 테스트 전용
  process.env.VENDOR_TOKEN_ENC_KEY = Buffer.alloc(32, 1).toString('base64')
})

function makeSupabaseMock(activeRow: {
  id: string
  token_encrypted: Buffer
  vendor: string
  vendor_workspace_id: string
} | null) {
  // 체이닝되는 쿼리 빌더를 흉내냄
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: activeRow }),
  }
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
  return {
    from: vi.fn().mockReturnValue(builder),
    rpc,
    builder,
  }
}

describe('resolveUpstreamToken', () => {
  it('returns decrypted plaintext for active token', async () => {
    const encrypted = encryptToken('sk-ant-test-12345')
    const supa = makeSupabaseMock({
      id: 'tok-1',
      token_encrypted: encrypted,
      vendor: 'anthropic',
      vendor_workspace_id: 'gridge-master-prod',
    })

    const result = await resolveUpstreamToken(supa as any, 'ws-cust-1', 'anthropic')

    expect(result).not.toBeNull()
    expect(result?.tokenId).toBe('tok-1')
    expect(result?.plaintext).toBe('sk-ant-test-12345')
    expect(result?.vendor).toBe('anthropic')
    expect(result?.vendorWorkspaceId).toBe('gridge-master-prod')
  })

  it('returns null when no active token matches', async () => {
    const supa = makeSupabaseMock(null)
    const result = await resolveUpstreamToken(supa as any, 'ws-cust-1', 'anthropic')
    expect(result).toBeNull()
  })

  it('filters by vendor + status=active', async () => {
    const encrypted = encryptToken('sk-x')
    const supa = makeSupabaseMock({
      id: 't',
      token_encrypted: encrypted,
      vendor: 'anthropic',
      vendor_workspace_id: 'w',
    })
    await resolveUpstreamToken(supa as any, 'ws', 'anthropic')

    expect(supa.from).toHaveBeenCalledWith('vendor_admin_tokens')
    expect(supa.builder.eq).toHaveBeenCalledWith('vendor', 'anthropic')
    expect(supa.builder.eq).toHaveBeenCalledWith('status', 'active')
    expect(supa.builder.order).toHaveBeenCalledWith('registered_at', { ascending: false })
    expect(supa.builder.limit).toHaveBeenCalledWith(1)
  })

  it('calls mark_token_used RPC (best-effort)', async () => {
    const encrypted = encryptToken('sk-x')
    const supa = makeSupabaseMock({
      id: 'tok-abc',
      token_encrypted: encrypted,
      vendor: 'anthropic',
      vendor_workspace_id: 'w',
    })
    await resolveUpstreamToken(supa as any, 'ws', 'anthropic')

    // mark_token_used 는 fire-and-forget (void) — 동기적으로 호출됐는지만 확인
    expect(supa.rpc).toHaveBeenCalledWith('mark_token_used', {
      p_token_id: 'tok-abc',
      p_used_for: 'gridge_gateway',
    })
  })

  it('accepts Uint8Array token_encrypted (not only Buffer)', async () => {
    const encrypted = encryptToken('sk-uint8')
    // Buffer 를 Uint8Array 로 변환
    const asUint8 = new Uint8Array(encrypted)
    const supa = makeSupabaseMock({
      id: 'tok-u',
      token_encrypted: asUint8 as any,
      vendor: 'anthropic',
      vendor_workspace_id: 'w',
    })
    const result = await resolveUpstreamToken(supa as any, 'ws', 'anthropic')
    expect(result?.plaintext).toBe('sk-uint8')
  })

  it('different vendor returns null', async () => {
    const supa = makeSupabaseMock(null)
    const result = await resolveUpstreamToken(supa as any, 'ws', 'openai')
    expect(result).toBeNull()
    expect(supa.builder.eq).toHaveBeenCalledWith('vendor', 'openai')
  })
})

describe('resolveUpstreamTokenById (이슈 #1 결정 (a) — 상품별 우선)', () => {
  it('returns decrypted token when active token matches id', async () => {
    const encrypted = encryptToken('sk-ant-prod')
    const supa = makeSupabaseMock({
      id: 'tok-prod-1',
      token_encrypted: encrypted,
      vendor: 'anthropic',
      vendor_workspace_id: 'gridge-prod',
    })

    const result = await resolveUpstreamTokenById(supa as any, 'tok-prod-1')

    expect(result).not.toBeNull()
    expect(result?.tokenId).toBe('tok-prod-1')
    expect(result?.plaintext).toBe('sk-ant-prod')
    expect(supa.from).toHaveBeenCalledWith('vendor_admin_tokens')
    expect(supa.builder.eq).toHaveBeenCalledWith('id', 'tok-prod-1')
    expect(supa.builder.eq).toHaveBeenCalledWith('status', 'active')
  })

  it('returns null when token id has non-active status', async () => {
    const supa = makeSupabaseMock(null) // rotated / revoked / expired 모두 null
    const result = await resolveUpstreamTokenById(supa as any, 'tok-rotated')
    expect(result).toBeNull()
  })

  it('calls mark_token_used RPC', async () => {
    const encrypted = encryptToken('sk-x')
    const supa = makeSupabaseMock({
      id: 'tok-abc',
      token_encrypted: encrypted,
      vendor: 'anthropic',
      vendor_workspace_id: 'w',
    })
    await resolveUpstreamTokenById(supa as any, 'tok-abc')

    expect(supa.rpc).toHaveBeenCalledWith('mark_token_used', {
      p_token_id: 'tok-abc',
      p_used_for: 'gridge_gateway',
    })
  })
})
