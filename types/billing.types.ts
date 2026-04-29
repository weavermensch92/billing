// ============================================================
// Gridge Billing MSP — 공통 타입 정의
// PB-001~PB-013, G-091 Mode D
// ============================================================

// ─── 위계 / 역할 ────────────────────────────────────────────

export type MemberRole = 'owner' | 'admin' | 'member'
export type MemberStatus = 'invited' | 'active' | 'suspended' | 'offboarded'

export type AdminRole = 'super' | 'am' | 'finance' | 'ops'

// ─── 조직 ───────────────────────────────────────────────────

export type OrgStatus = 'pending' | 'active' | 'suspended' | 'terminating' | 'terminated'
export type BillingPlan = 'monthly' | 'weekly' | 'prepaid_monthly'
export type InfraMode = 'A' | 'B' | 'C'

export interface Org {
  idx: number
  id: string
  name: string
  business_reg_no: string
  plan: BillingPlan
  infra_mode: InfraMode
  billing_mode: 'D'
  status: OrgStatus
  creditback_start_at: string | null
  creditback_end_at: string | null
  deposit_remaining_krw: number
  credit_limit_krw: number
  // Super가 할당한 월간 자율 승인 한도 (Admin/Owner가 AM 경유 없이 즉시 승인 가능)
  self_approval_headroom_krw: number
  self_approval_used_krw: number
  self_approval_reset_at: string
  aiops_org_id: string | null
  created_at: string
  updated_at: string
}

export interface Member {
  idx: number
  id: string
  org_id: string
  user_id: string | null
  email: string
  name: string
  role: MemberRole
  status: MemberStatus
  invited_at: string | null
  joined_at: string | null
  created_at: string
  updated_at: string
}

export interface AdminUser {
  idx: number
  id: string
  email: string
  name: string
  role: AdminRole
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

// ─── 계약 ───────────────────────────────────────────────────

export interface OrgContract {
  idx: number
  id: string
  org_id: string
  tier: BillingPlan
  creditback_rate: number
  creditback_months: number
  creditback_start_at: string | null
  final_creditback_applied: boolean
  monthly_fee_krw: number
  credit_limit_krw: number
  deposit_krw: number
  contract_start_at: string
  contract_end_at: string | null
  signed_at: string | null
  am_user_id: string | null
  created_at: string
  updated_at: string
}

// ─── 서비스 카탈로그 ─────────────────────────────────────────

export type ServiceCategory = 'subscription' | 'api' | 'agent_credit' | 'other'
export type TosReviewStatus = 'approved' | 'conditional' | 'rejected' | 'pending'
export type PricingPolicy = 'passthrough' | 'cost_plus_2pct' | 'fixed_markup_10k'
export type RegistrationApiMode =
  | 'admin_api'         // 벤더 Admin API 직결 (Anthropic, OpenAI Enterprise)
  | 'extension_assist'  // Gridge Chrome Extension 으로 클립보드 복사
  | 'manual'            // AM 1Password 수동 공유 (ChatGPT Plus 등 conditional)
  | 'browser_bot'       // Playwright 서버 자동화 (Phase 1+)

export interface Service {
  idx: number
  id: string
  name: string
  vendor: string
  category: ServiceCategory
  tos_review_status: TosReviewStatus
  tos_review_note: string | null
  tos_reviewed_at: string | null
  tos_next_review_at: string | null
  pricing_policy: PricingPolicy
  is_anthropic_partnership: boolean
  registration_api_mode?: RegistrationApiMode
  unit_price_usd: number | null
  unit_price_krw: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── 계정 ───────────────────────────────────────────────────

export type AccountStatus = 'pending' | 'active' | 'suspended' | 'expired' | 'terminated'

export interface Account {
  idx: number
  id: string
  org_id: string
  member_id: string
  service_id: string
  status: AccountStatus
  monthly_limit_krw: number
  allow_overseas: boolean
  purpose: string | null
  activated_at: string | null
  terminated_at: string | null
  created_at: string
  updated_at: string
  // Join
  member?: Pick<Member, 'id' | 'name' | 'email' | 'role'>
  service?: Pick<Service, 'id' | 'name' | 'vendor' | 'category'>
  virtual_cards?: VirtualCard[]
}

// ─── VCN ────────────────────────────────────────────────────

export type VcnStatus =
  | 'pending' | 'approved' | 'issuing' | 'issued'
  | 'delivered' | 'active' | 'suspended' | 'revoked' | 'expired'

export type CardType = 'primary' | 'backup'

export interface VirtualCard {
  idx: number
  id: string
  account_id: string
  org_id: string
  card_type: CardType
  card_last4: string | null
  card_issuer: string
  status: VcnStatus
  monthly_limit_krw: number
  allow_overseas: boolean
  mcc_whitelist: string[] | null
  issued_at: string | null
  activated_at: string | null
  suspended_at: string | null
  revoked_at: string | null
  expired_at: string | null
  created_at: string
  updated_at: string
}

// ─── 결제 ───────────────────────────────────────────────────

export type TransactionStatus = 'pending' | 'settled' | 'declined' | 'refunded' | 'reversed'

// 고객 포털용 Transaction (v_transaction_customer — gridge_cost/margin 숨김)
export interface TransactionCustomerView {
  idx: number
  id: string
  org_id: string
  account_id: string | null
  virtual_card_id: string | null
  service_id: string | null
  amount_krw: number
  status: TransactionStatus
  currency: string
  merchant_name: string | null
  billing_month: string | null
  transacted_at: string
  settled_at: string | null
  created_at: string
}

// 운영 콘솔용 Transaction (전체 필드, PB-009 회계분리 포함)
export interface Transaction extends TransactionCustomerView {
  gridge_cost_krw: number
  customer_charge_krw: number
  gridge_margin_krw: number
  is_anthropic_passthrough: boolean
  exchange_rate: number | null
  amount_usd: number | null
  decline_reason: string | null
}

// ─── 청구서 ─────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled'

export interface Invoice {
  idx: number
  id: string
  org_id: string
  billing_month: string
  status: InvoiceStatus
  subtotal_before_creditback: number
  credit_amount: number
  subtotal_krw: number
  vat_krw: number
  total_due_krw: number
  tax_invoice_id: string | null
  tax_invoice_issued_at: string | null
  requires_super_approval: boolean
  super_approved_at: string | null
  due_date: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

// ─── 크레딧백 ────────────────────────────────────────────────

export interface CreditBack {
  idx: number
  id: string
  org_id: string
  invoice_id: string
  billing_month: string
  month_seq: number
  base_amount_krw: number
  credit_amount_krw: number
  is_final: boolean
  applied_at: string
}

// ─── 감사 로그 ───────────────────────────────────────────────

export type AuditVisibility = 'customer_only' | 'internal_only' | 'both'
export type AuditActorType = 'member' | 'admin' | 'system'

export interface AuditLog {
  idx: number
  id: string
  org_id: string | null
  actor_type: AuditActorType
  actor_id: string
  actor_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  visibility: AuditVisibility
  detail: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

// ─── 요청 워크플로 ────────────────────────────────────────────

export type ActionType =
  | 'new_account' | 'terminate' | 'limit_change'
  | 'vcn_replace' | 'decline_response' | 'bulk_terminate'
  | 'headroom_increase'

export type RequestStatus =
  | 'pending' | 'in_review' | 'awaiting_customer' | 'awaiting_headroom'
  | 'approved' | 'rejected' | 'completed' | 'cancelled'

export type PathType = 'fast' | 'full' | 'self'

export interface ActionRequest {
  idx: number
  id: string
  org_id: string
  requester_id: string | null
  action_type: ActionType
  status: RequestStatus
  path_type: PathType | null
  account_id: string | null
  member_id: string | null
  progress_state: Record<string, unknown>
  request_data: Record<string, unknown>
  assigned_to: string | null
  sla_deadline: string | null
  parent_id: string | null
  resolved_at: string | null
  resolved_by: string | null
  // Self-approval 확장
  estimated_cost_krw: number
  self_approved_by: string | null
  self_approved_at: string | null
  // 자동 연쇄형 partial coverage (Super 증액 승인 대기)
  headroom_shortfall_krw: number
  reserved_headroom_krw: number
  created_at: string
  updated_at: string
  // Join (optional — nullable from left join)
  requester?: Pick<Member, 'id' | 'name' | 'email'> | null
  assigned_admin?: Pick<AdminUser, 'id' | 'name' | 'role'> | null
}

// ─── UI 공통 ─────────────────────────────────────────────────

export interface StatCard {
  label: string
  value: string | number
  subLabel?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
}

export type TabId = string

export interface Tab {
  id: TabId
  label: string
  count?: number
}
