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
  ListWorkspaceMembersInput,
  ListWorkspaceMembersResult,
  CreateApiKeyInput,
  CreateApiKeyResult,
  GetInvoicesInput,
  GetInvoicesResult,
  SetWorkspacePolicyInput,
  SetWorkspacePolicyResult,
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

  // ─── v2 신규 메서드 ─────────────────────────────────

  async listWorkspaceMembers(input: ListWorkspaceMembersInput): Promise<ListWorkspaceMembersResult> {
    await mockDelay()
    return {
      ok: true,
      members: [
        {
          vendorUserId: mockId('user', input.vendorWorkspaceId + ':carol'),
          email: 'carol@acme.com',
          role: 'owner',
          addedAt: '2026-01-10T00:00:00Z',
        },
        {
          vendorUserId: mockId('user', input.vendorWorkspaceId + ':dave'),
          email: 'dave@acme.com',
          role: 'member',
          addedAt: '2026-03-01T00:00:00Z',
        },
      ],
    }
  },

  async createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    await mockDelay()
    const providerKeyId = mockId('sk', input.accountId + ':' + Date.now())
    const keyValueOnce = `sk-proj-mock-${providerKeyId}-${Math.random().toString(36).slice(2, 14)}`
    return {
      ok: true,
      providerKeyId,
      keyValueOnce,
    }
  },

  async deleteApiKey() {
    await mockDelay()
    return { ok: true, httpStatus: 204, isMock: true }
  },

  async getInvoices(input: GetInvoicesInput): Promise<GetInvoicesResult> {
    await mockDelay()
    const invoiceId = mockId('inv', input.vendorWorkspaceId + ':' + input.periodStart)
    return {
      ok: true,
      invoices: [
        {
          vendor_invoice_id: invoiceId,
          vendor_workspace_id: input.vendorWorkspaceId,
          org_id: '',
          vendor: 'openai',
          billing_period_start: input.periodStart,
          billing_period_end: input.periodEnd,
          total_usd: 856.78,
          raw_payload: { mock: true, period: `${input.periodStart} ~ ${input.periodEnd}` },
          items: [
            {
              line_no: 1,
              item_type: 'api_usage',
              description: 'GPT-4o tokens',
              quantity: 30000000,
              unit: 'tokens',
              amount_usd: 600,
              meta: { model: 'gpt-4o' },
            },
            {
              line_no: 2,
              item_type: 'api_usage',
              description: 'o1 tokens',
              quantity: 5000000,
              unit: 'tokens',
              amount_usd: 200,
              meta: { model: 'o1' },
            },
            {
              line_no: 3,
              item_type: 'seat_license',
              description: 'Project seats',
              quantity: 3,
              unit: 'seats',
              amount_usd: 56.78,
              meta: {},
            },
          ],
        },
      ],
    }
  },

  async setWorkspacePolicy(input: SetWorkspacePolicyInput): Promise<SetWorkspacePolicyResult> {
    await mockDelay()
    const applied: string[] = []
    const unsupported: string[] = []
    if (input.policy.restrictKeyIssuanceToAdmin) applied.push('restrictKeyIssuanceToAdmin')
    if (input.policy.restrictBillingToOwner) applied.push('restrictBillingToOwner')
    if (input.policy.forceVendorSso) unsupported.push('forceVendorSso')
    if (input.policy.requireMfaForAdmin) unsupported.push('requireMfaForAdmin')
    return {
      ok: true,
      appliedFields: applied,
      unsupportedFields: unsupported,
    }
  },
}
