/**
 * Anthropic Admin API 어댑터
 *
 * 공식 문서: https://docs.anthropic.com/en/api/admin-api/overview
 *
 * 엔드포인트 (2026-04 기준 — v2 신규는 미검증·TODO):
 *   GET    /v1/organizations/:org_id/members
 *   POST   /v1/organizations/:org_id/invites
 *   DELETE /v1/organizations/:org_id/members/:user_id
 *   DELETE /v1/organizations/:org_id/invites/:invite_id
 *
 *   v2 신규 (endpoint 추정 — Anthropic 문서 확인 후 정정 필요):
 *   GET    /v1/organizations/:org_id/workspaces/:ws_id/members      (listWorkspaceMembers)
 *   POST   /v1/organizations/:org_id/workspaces/:ws_id/api_keys     (createApiKey)
 *   GET    /v1/organizations/:org_id/invoices                       (getInvoices, 미공개 가능)
 *   PATCH  /v1/organizations/:org_id/workspaces/:ws_id              (setWorkspacePolicy, 추정)
 *
 * 인증: x-api-key (Admin API key), anthropic-version: 2023-06-01
 * Per-user spend limit: 미지원 (workspace 단위만) → setSpendLimit 은 unsupported 반환.
 *
 * Env:
 *   ANTHROPIC_ADMIN_API_KEY
 *   ANTHROPIC_ORG_ID  (Admin API key 로 조회 가능한 단일 조직 id)
 *
 * v2 신규 메서드는 input.adminToken 동적 주입 (다중 Org 워크스페이스 운영).
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

const BASE = 'https://api.anthropic.com/v1'
const VERSION = '2023-06-01'

function getCreds(): { key: string; orgId: string } | null {
  const key = process.env.ANTHROPIC_ADMIN_API_KEY
  const orgId = process.env.ANTHROPIC_ORG_ID
  if (!key || !orgId) return null
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
      error: 'ANTHROPIC_ADMIN_API_KEY / ANTHROPIC_ORG_ID 미설정',
      latency_ms: 0,
      is_mock: false,
    }
  }

  const start = Date.now()
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'x-api-key': creds.key,
        'anthropic-version': VERSION,
        'content-type': 'application/json',
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

export const anthropicAdapter: VendorAdapter = {
  vendor: 'anthropic',

  isConfigured() {
    return getCreds() !== null
  },

  async inviteMember(input: InviteMemberInput): Promise<VendorCallResult<InviteMemberResult>> {
    const creds = getCreds()
    if (!creds) return { ok: false, error: 'not configured', latency_ms: 0, is_mock: false }

    const res = await call<{ id: string; expires_at?: string }>(
      `/organizations/${creds.orgId}/invites`,
      {
        method: 'POST',
        body: JSON.stringify({
          email: input.email,
          role: input.role ?? 'user',
        }),
      },
    )

    if (!res.ok || !res.data) {
      return { ...res, data: undefined } as VendorCallResult<InviteMemberResult>
    }

    return {
      ...res,
      data: {
        invite_id: res.data.id,
        expires_at: res.data.expires_at,
      },
      provider_ref: res.data.id,
    }
  },

  async removeMember(input: RemoveMemberInput): Promise<VendorCallResult<RemoveMemberResult>> {
    const creds = getCreds()
    if (!creds) return { ok: false, error: 'not configured', latency_ms: 0, is_mock: false }

    // invite_id 우선 (초대 수락 전), 없으면 user_id
    if (input.provider_invite_id) {
      const res = await call<unknown>(
        `/organizations/${creds.orgId}/invites/${input.provider_invite_id}`,
        { method: 'DELETE' },
      )
      return { ...res, data: { removed: res.ok } }
    }

    if (input.provider_user_id) {
      const res = await call<unknown>(
        `/organizations/${creds.orgId}/members/${input.provider_user_id}`,
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
    const creds = getCreds()
    if (!creds) return { ok: false, error: 'not configured', latency_ms: 0, is_mock: false }

    const res = await call<{ data: Array<{ id: string; email: string; role: string; status?: string }> }>(
      `/organizations/${creds.orgId}/members`,
      { method: 'GET' },
    )

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
          status: (m.status === 'invited' ? 'invited' : m.status === 'removed' ? 'removed' : 'active') as 'active' | 'invited' | 'removed',
        })),
      },
    }
  },

  async setSpendLimit(_input: SetSpendLimitInput): Promise<VendorCallResult<SetSpendLimitResult>> {
    // Anthropic Admin API 는 per-user spend limit 미지원.
    // workspace 단위 한도만 존재 (별도 엔드포인트) — 향후 workspace 매핑 추가 시 구현.
    return {
      ok: false,
      error: 'unsupported: Anthropic Admin API 는 per-user spend limit 을 제공하지 않음. VCN 한도로 관리.',
      latency_ms: 0,
      is_mock: false,
    }
  },

  // ─── v2 신규 메서드 ─────────────────────────────────
  // 모두 input.adminToken 동적 주입. env ANTHROPIC_ADMIN_API_KEY 사용 안 함.
  // 실 endpoint 는 Anthropic Admin API 문서 확인 후 정정 필요.

  async listWorkspaceMembers(input: ListWorkspaceMembersInput): Promise<ListWorkspaceMembersResult> {
    const orgId = process.env.ANTHROPIC_ORG_ID
    if (!orgId) {
      return { ok: false, members: [], error: 'ANTHROPIC_ORG_ID env missing' }
    }
    // 추정 endpoint — TODO: Anthropic 공식 문서 확인 후 수정
    const url = `${BASE}/organizations/${orgId}/workspaces/${input.vendorWorkspaceId}/members`
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': input.adminToken,
          'anthropic-version': VERSION,
        },
      })
      if (!res.ok) {
        return { ok: false, members: [], error: `HTTP ${res.status}: ${await res.text()}` }
      }
      const body = (await res.json()) as { data?: Array<{ id: string; email?: string; role?: string; added_at?: string }> }
      const members = (body.data ?? []).map((m) => ({
        vendorUserId: m.id,
        email: m.email ?? null,
        role: m.role ?? 'user',
        addedAt: m.added_at ?? null,
      }))
      return { ok: true, members }
    } catch (e) {
      return { ok: false, members: [], error: String(e) }
    }
  },

  async createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    const orgId = process.env.ANTHROPIC_ORG_ID
    if (!orgId) {
      return { ok: false, providerKeyId: '', keyValueOnce: '', error: 'ANTHROPIC_ORG_ID env missing' }
    }
    // 추정 endpoint — TODO: Anthropic 공식 문서 확인 후 수정
    const url = `${BASE}/organizations/${orgId}/workspaces/${input.vendorWorkspaceId}/api_keys`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': input.adminToken,
          'anthropic-version': VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: input.label ?? `gridge-${input.accountId}`,
          metadata: { gridge_account_id: input.accountId },
        }),
      })
      if (!res.ok) {
        return { ok: false, providerKeyId: '', keyValueOnce: '', error: `HTTP ${res.status}: ${await res.text()}` }
      }
      const body = (await res.json()) as { id?: string; api_key?: string; secret?: string }
      const providerKeyId = body.id ?? ''
      const keyValueOnce = body.api_key ?? body.secret ?? ''
      if (!providerKeyId || !keyValueOnce) {
        return { ok: false, providerKeyId: '', keyValueOnce: '', error: 'response missing id/api_key' }
      }
      return { ok: true, providerKeyId, keyValueOnce }
    } catch (e) {
      return { ok: false, providerKeyId: '', keyValueOnce: '', error: String(e) }
    }
  },

  async getInvoices(input: GetInvoicesInput): Promise<GetInvoicesResult> {
    const orgId = process.env.ANTHROPIC_ORG_ID
    if (!orgId) {
      return { ok: false, invoices: [], error: 'ANTHROPIC_ORG_ID env missing' }
    }
    // 청구서 API는 공개 미확인 — TODO: Anthropic 측 확인 필요
    // 임시 endpoint 추정. 미지원 시 unsupported 반환.
    const url = `${BASE}/organizations/${orgId}/invoices?start=${input.periodStart}&end=${input.periodEnd}&workspace_id=${input.vendorWorkspaceId}`
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': input.adminToken,
          'anthropic-version': VERSION,
        },
      })
      if (res.status === 404) {
        return { ok: false, invoices: [], error: 'Anthropic Invoices API not available — use dashboard export or contact Anthropic' }
      }
      if (!res.ok) {
        return { ok: false, invoices: [], error: `HTTP ${res.status}: ${await res.text()}` }
      }
      // TODO: 실제 응답 schema 확인 후 파싱. 현재는 raw 그대로 1개 invoice로 변환.
      const body = (await res.json()) as Record<string, unknown>
      return {
        ok: true,
        invoices: [
          {
            vendor_invoice_id: String((body.id ?? `${input.vendorWorkspaceId}-${input.periodStart}`)),
            vendor_workspace_id: input.vendorWorkspaceId,
            org_id: '', // 호출자가 채움
            vendor: 'anthropic',
            billing_period_start: input.periodStart,
            billing_period_end: input.periodEnd,
            total_usd: Number(body.total_usd ?? 0),
            raw_payload: body,
            items: [], // TODO: body 의 line item schema 확인 후 변환
          },
        ],
      }
    } catch (e) {
      return { ok: false, invoices: [], error: String(e) }
    }
  },

  async setWorkspacePolicy(input: SetWorkspacePolicyInput): Promise<SetWorkspacePolicyResult> {
    const orgId = process.env.ANTHROPIC_ORG_ID
    if (!orgId) {
      return { ok: false, appliedFields: [], unsupportedFields: ['all'], error: 'ANTHROPIC_ORG_ID env missing' }
    }
    // Anthropic Workspace 정책 API는 미공개·미확인 가능성 큼.
    // TODO: Anthropic 측 정책 변경 endpoint 확인 후 구현.
    // 현재는 미지원 명시 반환.
    return {
      ok: false,
      appliedFields: [],
      unsupportedFields: [
        ...(input.policy.restrictKeyIssuanceToAdmin ? ['restrictKeyIssuanceToAdmin'] : []),
        ...(input.policy.restrictBillingToOwner ? ['restrictBillingToOwner'] : []),
        ...(input.policy.forceVendorSso ? ['forceVendorSso'] : []),
        ...(input.policy.requireMfaForAdmin ? ['requireMfaForAdmin'] : []),
      ],
      error: 'Anthropic workspace policy API not yet implemented — manual configuration via console required',
    }
  },
}
