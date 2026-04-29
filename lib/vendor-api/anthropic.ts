/**
 * Anthropic Admin API 어댑터
 *
 * 공식 문서: https://docs.anthropic.com/en/api/admin-api/overview
 *
 * 엔드포인트 (2026-04 기준):
 *   GET    /v1/organizations/:org_id/members
 *   POST   /v1/organizations/:org_id/invites
 *   DELETE /v1/organizations/:org_id/members/:user_id
 *   DELETE /v1/organizations/:org_id/invites/:invite_id
 *
 * 인증: x-api-key (Admin API key), anthropic-version: 2023-06-01
 * Per-user spend limit: 미지원 (workspace 단위만) → setSpendLimit 은 unsupported 반환.
 *
 * Env:
 *   ANTHROPIC_ADMIN_API_KEY
 *   ANTHROPIC_ORG_ID  (Admin API key 로 조회 가능한 단일 조직 id)
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
      error: 'unsupported: Anthropic Admin API 는 per-user spend limit 을 제공하지 않음. VCN 한도로 통제.',
      latency_ms: 0,
      is_mock: false,
    }
  },
}
