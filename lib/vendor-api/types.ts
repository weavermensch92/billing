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

// ─── v2 신규: 동적 토큰·워크스페이스 단위 API ──────────
// v1 메서드는 env 기반 단일 워크스페이스. v2는 다중 Org 운영을 위해
// 매 호출마다 adminToken + vendorWorkspaceId 동적 주입.

export interface ListWorkspaceMembersInput {
  vendorWorkspaceId: string
  adminToken: string
}

export interface ListWorkspaceMembersResult {
  ok: boolean
  members: Array<{
    vendorUserId: string
    email: string | null
    role: string
    addedAt?: string | null
  }>
  error?: string
}

export interface CreateApiKeyInput {
  vendorWorkspaceId: string
  adminToken: string
  /** 그릿지 account.id — 키 식별 메타 (벤더 측 메타에 저장 가능) */
  accountId: string
  label?: string | null
}

export interface CreateApiKeyResult {
  ok: boolean
  /** 벤더 측 키 식별자 (회수·재발급 시 참조) */
  providerKeyId: string
  /** 1회만 노출되는 평문 키 값. 호출자가 즉시 노출 후 폐기 (DB에 hash로 저장 권장) */
  keyValueOnce: string
  error?: string
}

export interface DeleteApiKeyInput {
  vendorWorkspaceId: string
  adminToken: string
  /** createApiKey 응답에서 받아 billing.api_keys.provider_key_id 에 저장한 벤더 측 식별자 */
  providerKeyId: string
}

export interface DeleteApiKeyResult {
  ok: boolean
  /** HTTP 상태 (성공/실패 모두). 벤더 측 이미 삭제된 키일 수 있어 404 도 ok 로 간주. */
  httpStatus?: number
  error?: string
  isMock?: boolean
}

export interface GetInvoicesInput {
  vendorWorkspaceId: string
  adminToken: string
  periodStart: string // YYYY-MM-DD
  periodEnd: string   // YYYY-MM-DD
}

/** vendor-invoice/fetcher.ts 의 RawVendorInvoice 와 호환 */
export interface RawVendorInvoiceFromAdapter {
  vendor_invoice_id: string
  vendor_workspace_id: string
  org_id: string
  vendor: string
  billing_period_start: string
  billing_period_end: string
  total_usd: number
  raw_payload: Record<string, unknown>
  items: Array<{
    line_no: number
    item_type: 'api_usage' | 'seat_license' | 'addon' | 'support' | 'credit' | 'other'
    description: string
    quantity?: number | null
    unit?: string | null
    amount_usd: number
    meta?: Record<string, unknown>
  }>
}

export interface GetInvoicesResult {
  ok: boolean
  invoices: RawVendorInvoiceFromAdapter[]
  error?: string
}

export interface WorkspacePolicyInput {
  restrictKeyIssuanceToAdmin: boolean
  restrictBillingToOwner: boolean
  forceVendorSso?: boolean
  requireMfaForAdmin?: boolean
}

export interface SetWorkspacePolicyInput {
  vendorWorkspaceId: string
  adminToken: string
  policy: WorkspacePolicyInput
}

export interface SetWorkspacePolicyResult {
  ok: boolean
  appliedFields: string[]
  unsupportedFields: string[]
  error?: string
}

// ─── 벤더 어댑터 인터페이스 ────────────────────────────
export interface VendorAdapter {
  vendor: VendorName
  /** 벤더 측 Admin API 사용 가능 여부. env 미설정 시 false */
  isConfigured(): boolean

  // v1 메서드 (env 기반 단일 워크스페이스)
  inviteMember(input: InviteMemberInput): Promise<VendorCallResult<InviteMemberResult>>
  removeMember(input: RemoveMemberInput): Promise<VendorCallResult<RemoveMemberResult>>
  listMembers(): Promise<VendorCallResult<ListMembersResult>>
  setSpendLimit(input: SetSpendLimitInput): Promise<VendorCallResult<SetSpendLimitResult>>

  // v2 신규 메서드 (동적 토큰·워크스페이스, 옵셔널)
  listWorkspaceMembers?(input: ListWorkspaceMembersInput): Promise<ListWorkspaceMembersResult>
  createApiKey?(input: CreateApiKeyInput): Promise<CreateApiKeyResult>
  deleteApiKey?(input: DeleteApiKeyInput): Promise<DeleteApiKeyResult>
  getInvoices?(input: GetInvoicesInput): Promise<GetInvoicesResult>
  setWorkspacePolicy?(input: SetWorkspacePolicyInput): Promise<SetWorkspacePolicyResult>
}
