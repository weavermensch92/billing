/**
 * Anthropic Admin API Mock
 * NEXT_PUBLIC_MOCK_MODE=true 상태에서 실제 호출을 대체.
 * 벤더 측 응답 지연 100~300ms 모사 + 결정적 provider_ref 생성.
 */

import type {
  VendorAdapter,
  VendorCallResult,
  InviteMemberInput,
  InviteMemberResult,
  RemoveMemberInput,
  RemoveMemberResult,
  ListMembersResult,
  SetSpendLimitInput,
  SetSpendLimitResult,
} from './types'

function mockDelay(): Promise<number> {
  const ms = 100 + Math.floor(Math.random() * 200)
  return new Promise(resolve => setTimeout(() => resolve(ms), ms))
}

// 결정적이면서도 유니크한 provider_ref 생성 (테스트 가독성)
function mockId(prefix: string, seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i)
    hash |= 0
  }
  return `${prefix}_mock_${Math.abs(hash).toString(36).slice(0, 10)}`
}

export const mockAnthropicAdapter: VendorAdapter = {
  vendor: 'anthropic',

  isConfigured() {
    return true // Mock 은 항상 설정됨
  },

  async inviteMember(input: InviteMemberInput): Promise<VendorCallResult<InviteMemberResult>> {
    const latency_ms = await mockDelay()
    const inviteId = mockId('invite', input.email)
    return {
      ok: true,
      data: {
        invite_id: inviteId,
        invite_link: `https://claude.ai/invite/mock/${inviteId}`,
        expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
      },
      provider_ref: inviteId,
      http_status: 201,
      latency_ms,
      is_mock: true,
    }
  },

  async removeMember(input: RemoveMemberInput): Promise<VendorCallResult<RemoveMemberResult>> {
    const latency_ms = await mockDelay()
    const ref = input.provider_user_id ?? input.provider_invite_id
    if (!ref) {
      return {
        ok: false,
        error: 'provider_user_id 또는 provider_invite_id 필요',
        latency_ms,
        is_mock: true,
      }
    }
    return {
      ok: true,
      data: { removed: true },
      provider_ref: ref,
      http_status: 204,
      latency_ms,
      is_mock: true,
    }
  },

  async listMembers(): Promise<VendorCallResult<ListMembersResult>> {
    const latency_ms = await mockDelay()
    return {
      ok: true,
      data: {
        members: [
          { id: 'usr_mock_alice', email: 'alice@acme.com', role: 'admin', status: 'active' },
          { id: 'usr_mock_bob',   email: 'bob@acme.com',   role: 'user',  status: 'active' },
        ],
      },
      http_status: 200,
      latency_ms,
      is_mock: true,
    }
  },

  async setSpendLimit(_input: SetSpendLimitInput): Promise<VendorCallResult<SetSpendLimitResult>> {
    const latency_ms = await mockDelay()
    return {
      ok: false,
      error: 'unsupported: Anthropic Admin API 는 per-user spend limit 미제공 (Mock)',
      latency_ms,
      is_mock: true,
    }
  },
}
