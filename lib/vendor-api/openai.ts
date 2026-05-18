/**
 * OpenAI Admin API 어댑터
 *
 * 공식 문서: https://platform.openai.com/docs/api-reference/administration
 *
 * 엔드포인트 (2026-04 기준):
 *   GET    /v1/organization/users
 *   GET    /v1/organization/users/:user_id
 *   DELETE /v1/organization/users/:user_id
 *   GET    /v1/organization/invites
 *   POST   /v1/organization/invites
 *   DELETE /v1/organization/invites/:invite_id
 *
 * 인증: Authorization: Bearer <Admin API key>
 *   Admin key 는 OpenAI platform 의 Organization > Admin keys 에서 발급.
 *   일반 API key (sk-...) 와 구분되며 scope=all 로 만듦.
 *
 * Per-user spend limit: OpenAI 는 project 단위 rate/usage limit 지원.
 *   - /organization/projects/:project_id/rate_limits
 *   - 사용자별로는 직접 지원 X → 1 user 1 project 매핑으로 우회 가능 (향후)
 *
 * Env:
 *   OPENAI_ADMIN_API_KEY
 *   OPENAI_ORG_ID  (선택 — Admin key 에 org 종속, 명시적 헤더 용도)
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

const BASE = 'https://api.openai.com/v1'

function getCreds(): { key: string; orgId?: string } | null {
  const key = process.env.OPENAI_ADMIN_API_KEY
  if (!key) return null
  const orgId = process.env.OPENAI_ORG_ID
  return { key, orgId }
}

async function call<T>(
  path: string,
  init: RequestInit,
): Promise<VendorCallResult<T>> {
  const creds = getCreds()
  if (!creds) {
    return {
      ok: false,
      error: 'OPENAI_ADMIN_API_KEY 미설정',
      latency_ms: 0,
      is_mock: false,
    }
  }

  const start = Date.now()
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'authorization': `Bearer ${creds.key}`,
        'content-type': 'application/json',
        ...(creds.orgId ? { 'openai-organization': creds.orgId } : {}),
        ...(init.headers ?? {}),
      },
    })
    const latency_ms = Date.now() - start
    const body = await res.json().catch(() => ({}))

    if (!res.ok) {
      return {
        ok: false,
        error: (body as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`,
        http_status: res.status,
        latency_ms,
        is_mock: false,
      }
    }

    return {
      ok: true,
      data: body as T,
      http_status: res.status,
      latency_ms,
      is_mock: false,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      latency_ms: Date.now() - start,
      is_mock: false,
    }
  }
}

export const openaiAdapter: VendorAdapter = {
  vendor: 'openai',

  isConfigured() {
    return getCreds() !== null
  },

  async inviteMember(input: InviteMemberInput): Promise<VendorCallResult<InviteMemberResult>> {
    // OpenAI role: owner / reader (Team 플랜 기준). 'user' → 'reader' 매핑
    const openaiRole = input.role === 'admin' ? 'owner' : 'reader'

    const res = await call<{ id: string; expires_at?: number }>(
      `/organization/invites`,
      {
        method: 'POST',
        body: JSON.stringify({
          email: input.email,
          role: openaiRole,
        }),
      },
    )

    if (!res.ok || !res.data) {
      return { ...res, data: undefined } as VendorCallResult<InviteMemberResult>
    }

    const expiresIso = res.data.expires_at
      ? new Date(res.data.expires_at * 1000).toISOString()
      : undefined

    return {
      ...res,
      data: {
        invite_id: res.data.id,
        expires_at: expiresIso,
      },
      provider_ref: res.data.id,
    }
  },

  async removeMember(input: RemoveMemberInput): Promise<VendorCallResult<RemoveMemberResult>> {
    if (input.provider_invite_id) {
      const res = await call<unknown>(
        `/organization/invites/${input.provider_invite_id}`,
        { method: 'DELETE' },
      )
      return { ...res, data: { removed: res.ok } }
    }

    if (input.provider_user_id) {
      const res = await call<unknown>(
        `/organization/users/${input.provider_user_id}`,
        { method: 'DELETE' },
      )
      return { ...res, data: { removed: res.ok } }
    }

    return {
      ok: false,
      error: 'provider_user_id 또는 provider_invite_id 필요',
      latency_ms: 0,
      is_mock: false,
    }
  },

  async listMembers(): Promise<VendorCallResult<ListMembersResult>> {
    const res = await call<{
      data: Array<{ id: string; email: string; role: string; }>
    }>('/organization/users', { method: 'GET' })

    if (!res.ok || !res.data) {
      return { ...res, data: undefined } as VendorCallResult<ListMembersResult>
    }

    return {
      ...res,
      data: {
        members: res.data.data.map(m => ({
          id: m.id,
          email: m.email,
          role: m.role,
          status: 'active' as const,
        })),
      },
    }
  },

  async setSpendLimit(_input: SetSpendLimitInput): Promise<VendorCallResult<SetSpendLimitResult>> {
    // OpenAI 는 user 단위 spend limit 을 직접 제공하지 않음.
    // project 단위 rate limit (tokens/req per minute) 만 존재.
    // 향후 1-user-1-project 매핑 + /projects/:id/rate_limits 연동 시 구현.
    return {
      ok: false,
      error: 'unsupported: OpenAI Admin API 는 per-user spend limit 미제공. VCN 한도 + project rate limit 우회 필요.',
      latency_ms: 0,
      is_mock: false,
    }
  },

  // ─── v2 신규 메서드 ─────────────────────────────────
  // OpenAI 는 project 단위 운영. vendorWorkspaceId = project_id 로 사용.

  async listWorkspaceMembers(input: ListWorkspaceMembersInput): Promise<ListWorkspaceMembersResult> {
    // /v1/organization/projects/:project_id/users
    const url = `${BASE}/organization/projects/${input.vendorWorkspaceId}/users`
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${input.adminToken}` },
      })
      if (!res.ok) {
        return { ok: false, members: [], error: `HTTP ${res.status}: ${await res.text()}` }
      }
      const body = (await res.json()) as { data?: Array<{ id: string; email?: string; role?: string; added_at?: number | string }> }
      const members = (body.data ?? []).map((m) => ({
        vendorUserId: m.id,
        email: m.email ?? null,
        role: m.role ?? 'member',
        addedAt: typeof m.added_at === 'number' ? new Date(m.added_at * 1000).toISOString() : (m.added_at ?? null),
      }))
      return { ok: true, members }
    } catch (e) {
      return { ok: false, members: [], error: String(e) }
    }
  },

  async createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    // OpenAI 는 project 단위 service account 생성 후 키 발급 패턴 권장.
    // 추정 흐름: POST /v1/organization/projects/:project_id/service_accounts
    //          → 응답에 api_key (1회 노출)
    const url = `${BASE}/organization/projects/${input.vendorWorkspaceId}/service_accounts`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.adminToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: input.label ?? `gridge-${input.accountId}` }),
      })
      if (!res.ok) {
        return { ok: false, providerKeyId: '', keyValueOnce: '', error: `HTTP ${res.status}: ${await res.text()}` }
      }
      const body = (await res.json()) as { id?: string; api_key?: { value?: string }; secret?: string }
      const providerKeyId = body.id ?? ''
      const keyValueOnce = body.api_key?.value ?? body.secret ?? ''
      if (!providerKeyId || !keyValueOnce) {
        return { ok: false, providerKeyId: '', keyValueOnce: '', error: 'response missing id/api_key' }
      }
      return { ok: true, providerKeyId, keyValueOnce }
    } catch (e) {
      return { ok: false, providerKeyId: '', keyValueOnce: '', error: String(e) }
    }
  },

  async deleteApiKey(input) {
    // OpenAI Admin API: DELETE /v1/organization/projects/:project_id/service_accounts/:service_account_id
    const url = `${BASE}/organization/projects/${input.vendorWorkspaceId}/service_accounts/${input.providerKeyId}`
    try {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${input.adminToken}`,
        },
      })
      if (res.ok || res.status === 404) {
        return { ok: true, httpStatus: res.status }
      }
      return { ok: false, httpStatus: res.status, error: `HTTP ${res.status}: ${await res.text()}` }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  },

  async getInvoices(input: GetInvoicesInput): Promise<GetInvoicesResult> {
    // OpenAI Costs API: /v1/organization/costs (project 별 비용 — invoice 와 유사)
    // 정확한 schema 는 OpenAI 문서 확인 필요. 본 구현은 best-effort.
    const url = `${BASE}/organization/costs?start_time=${encodeURIComponent(input.periodStart)}&end_time=${encodeURIComponent(input.periodEnd)}&project_ids[]=${input.vendorWorkspaceId}`
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${input.adminToken}` },
      })
      if (!res.ok) {
        return { ok: false, invoices: [], error: `HTTP ${res.status}: ${await res.text()}` }
      }
      const body = (await res.json()) as Record<string, unknown>
      // TODO: response schema 확인 후 정교한 변환. 현재는 단일 invoice 변환.
      const totalUsd = Number((body.total ?? body.total_usd ?? 0))
      return {
        ok: true,
        invoices: [
          {
            vendor_invoice_id: `${input.vendorWorkspaceId}-${input.periodStart}`,
            vendor_workspace_id: input.vendorWorkspaceId,
            org_id: '',
            vendor: 'openai',
            billing_period_start: input.periodStart,
            billing_period_end: input.periodEnd,
            total_usd: totalUsd,
            raw_payload: body,
            items: [], // TODO: line item 변환
          },
        ],
      }
    } catch (e) {
      return { ok: false, invoices: [], error: String(e) }
    }
  },

  async setWorkspacePolicy(input: SetWorkspacePolicyInput): Promise<SetWorkspacePolicyResult> {
    // OpenAI 는 project 멤버 role 변경 API 존재 (member 권한 분리).
    // 단 'restrictKeyIssuanceToAdmin' 같은 추상 정책은 직접 API 없음.
    // 효과적 강제: 모든 member 의 role 을 'member' (reader) 로 강등.
    // 본 구현은 인터페이스만. 실 강등 로직은 별도 구현 (TODO).
    return {
      ok: false,
      appliedFields: [],
      unsupportedFields: [
        ...(input.policy.restrictKeyIssuanceToAdmin ? ['restrictKeyIssuanceToAdmin'] : []),
        ...(input.policy.restrictBillingToOwner ? ['restrictBillingToOwner'] : []),
        ...(input.policy.forceVendorSso ? ['forceVendorSso'] : []),
        ...(input.policy.requireMfaForAdmin ? ['requireMfaForAdmin'] : []),
      ],
      error: 'OpenAI project policy enforcement requires per-member role update — TODO implement bulk role demotion',
    }
  },
}
