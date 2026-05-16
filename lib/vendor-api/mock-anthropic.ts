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

  // ─── v2 신규 메서드 ─────────────────────────────────

  async listWorkspaceMembers(input: ListWorkspaceMembersInput): Promise<ListWorkspaceMembersResult> {
    await mockDelay()
    // 워크스페이스 ID 기준으로 결정적 멤버 셋 반환
    return {
      ok: true,
      members: [
        {
          vendorUserId: mockId('usr', input.vendorWorkspaceId + ':alice'),
          email: 'alice@acme.com',
          role: 'admin',
          addedAt: '2026-01-01T00:00:00Z',
        },
        {
          vendorUserId: mockId('usr', input.vendorWorkspaceId + ':bob'),
          email: 'bob@acme.com',
          role: 'user',
          addedAt: '2026-02-15T00:00:00Z',
        },
        // 가끔 shadow 멤버 시뮬레이션 — Math.random 으로 30% 확률 추가
        ...(Math.random() < 0.3
          ? [
              {
                vendorUserId: mockId('usr', input.vendorWorkspaceId + ':shadow'),
                email: 'shadow.member@acme.com',
                role: 'user',
                addedAt: new Date().toISOString(),
              },
            ]
          : []),
      ],
    }
  },

  async createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    await mockDelay()
    const providerKeyId = mockId('key', input.accountId + ':' + Date.now())
    // 평문 키 — mock에서만. 실제는 sk-ant-... 형태.
    const keyValueOnce = `sk-ant-mock-${providerKeyId}-${Math.random().toString(36).slice(2, 14)}`
    return {
      ok: true,
      providerKeyId,
      keyValueOnce,
    }
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
          org_id: '', // 호출자가 채움
          vendor: 'anthropic',
          billing_period_start: input.periodStart,
          billing_period_end: input.periodEnd,
          total_usd: 1234.56,
          raw_payload: {
            mock: true,
            period: `${input.periodStart} ~ ${input.periodEnd}`,
          },
          items: [
            {
              line_no: 1,
              item_type: 'api_usage',
              description: 'Claude Opus tokens',
              quantity: 50000000,
              unit: 'tokens',
              amount_usd: 1000,
              meta: { model: 'claude-opus-4-7' },
            },
            {
              line_no: 2,
              item_type: 'api_usage',
              description: 'Claude Sonnet tokens',
              quantity: 100000000,
              unit: 'tokens',
              amount_usd: 200,
              meta: { model: 'claude-sonnet-4-6' },
            },
            {
              line_no: 3,
              item_type: 'seat_license',
              description: 'Workspace seats',
              quantity: 5,
              unit: 'seats',
              amount_usd: 34.56,
              meta: {},
            },
          ],
        },
      ],
    }
  },

  async setWorkspacePolicy(input: SetWorkspacePolicyInput): Promise<SetWorkspacePolicyResult> {
    await mockDelay()
    // Mock: 모든 정책 적용 성공으로 시뮬레이션
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
