/**
 * OpenAI Admin API Mock
 * NEXT_PUBLIC_MOCK_MODE=true 또는 OPENAI_ADMIN_API_KEY 미설정 시 사용.
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
  const ms = 80 + Math.floor(Math.random() * 250)
  return new Promise(resolve => setTimeout(() => resolve(ms), ms))
}

function mockId(prefix: string, seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i)
    hash |= 0
  }
  return `${prefix}_mock_${Math.abs(hash).toString(36).slice(0, 10)}`
}

export const mockOpenaiAdapter: VendorAdapter = {
  vendor: 'openai',

  isConfigured() {
    return true
  },

  async inviteMember(input: InviteMemberInput): Promise<VendorCallResult<InviteMemberResult>> {
    const latency_ms = await mockDelay()
    const inviteId = mockId('oai-invite', input.email)
    return {
      ok: true,
      data: {
        invite_id: inviteId,
        invite_link: `https://platform.openai.com/invite/mock/${inviteId}`,
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
          { id: 'user-mock-alice', email: 'alice@acme.com', role: 'owner',  status: 'active' },
          { id: 'user-mock-bob',   email: 'bob@acme.com',   role: 'reader', status: 'active' },
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
      error: 'unsupported: OpenAI Admin API 는 per-user spend limit 미제공 (Mock)',
      latency_ms,
      is_mock: true,
    }
  },
}
