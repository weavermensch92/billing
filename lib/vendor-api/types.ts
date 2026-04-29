/**
 * Vendor Admin API 공통 타입
 *
 * 각 벤더 (Anthropic / OpenAI / Google / Cursor) 의 Admin API 를
 * 통일된 인터페이스로 감쌈. executor 는 벤더별 분기 없이 호출.
 */

export type VendorName = 'anthropic' | 'openai' | 'google' | 'cursor'

export interface VendorCallResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  http_status?: number
  provider_ref?: string
  latency_ms: number
  is_mock: boolean
}

// ─── 멤버 초대 ─────────────────────────────────────────
export interface InviteMemberInput {
  email: string
  role?: 'admin' | 'developer' | 'billing' | 'user'
  /** Anthropic workspace / OpenAI project 등 하위 리소스 */
  resource_id?: string
}

export interface InviteMemberResult {
  /** 벤더 측 초대 식별자 (초대 수락 전 취소용) */
  invite_id: string
  /** 초대 링크 (일부 벤더만 반환) */
  invite_link?: string
  /** 초대 만료 시각 */
  expires_at?: string
}

// ─── 멤버 제거 ─────────────────────────────────────────
export interface RemoveMemberInput {
  /** 벤더 측 user_id (accounts.provider_user_id) */
  provider_user_id?: string
  /** 초대 수락 전 상태라면 invite_id 로 취소 */
  provider_invite_id?: string
}

export interface RemoveMemberResult {
  removed: boolean
}

// ─── 멤버 조회 (검증용) ──────────────────────────────
export interface ListMembersResult {
  members: Array<{
    id: string
    email: string
    role: string
    status: 'active' | 'invited' | 'removed'
  }>
}

// ─── 한도 설정 (벤더별 지원 여부 상이) ────────────────
export interface SetSpendLimitInput {
  /** user_id 또는 workspace_id */
  target_id: string
  target_type: 'user' | 'workspace'
  amount_usd: number
  period: 'monthly' | 'daily'
}

export interface SetSpendLimitResult {
  applied: boolean
  /** 벤더가 실제로 적용한 값 (반올림 등으로 다를 수 있음) */
  applied_amount_usd?: number
}

// ─── 벤더 어댑터 인터페이스 ────────────────────────────
export interface VendorAdapter {
  vendor: VendorName
  /** 벤더 측 Admin API 사용 가능 여부. env 미설정 시 false */
  isConfigured(): boolean

  inviteMember(input: InviteMemberInput): Promise<VendorCallResult<InviteMemberResult>>
  removeMember(input: RemoveMemberInput): Promise<VendorCallResult<RemoveMemberResult>>
  listMembers(): Promise<VendorCallResult<ListMembersResult>>

  /** 벤더가 per-user spend limit 을 지원하지 않으면 { ok: false, error: 'unsupported' } */
  setSpendLimit(input: SetSpendLimitInput): Promise<VendorCallResult<SetSpendLimitResult>>
}
