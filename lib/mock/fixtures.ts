// ============================================================
// Mock Fixtures — 전체 페이지 점검용 가상 데이터
// NEXT_PUBLIC_MOCK_MODE=true 일 때만 활성화
// ============================================================

const NOW = new Date()
const iso = (d: Date) => d.toISOString()
const daysAgo = (n: number) => { const d = new Date(NOW); d.setDate(d.getDate() - n); return iso(d) }
const daysAhead = (n: number) => { const d = new Date(NOW); d.setDate(d.getDate() + n); return iso(d) }
const MONTH = NOW.toISOString().slice(0, 7)
const LAST_MONTH = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1).toISOString().slice(0, 7)
const TWO_MONTHS_AGO = new Date(NOW.getFullYear(), NOW.getMonth() - 2, 1).toISOString().slice(0, 7)

// ─── 조직 ─────────────────────────────────────────────────
export const ORG_ID = '00000000-0000-0000-0000-000000000001'

export const MOCK_ORGS = [
  {
    idx: 1,
    id: ORG_ID,
    name: 'Acme Corp',
    business_reg_no: '123-45-67890',
    plan: 'monthly',
    infra_mode: 'A',
    billing_mode: 'D',
    status: 'active',
    creditback_start_at: daysAgo(75).slice(0, 10),
    creditback_end_at: daysAhead(105).slice(0, 10),
    deposit_remaining_krw: 0,
    credit_limit_krw: 10000000,
    aiops_org_id: null,
    created_at: daysAgo(90),
    updated_at: daysAgo(1),
  },
]

// ─── 멤버 ─────────────────────────────────────────────────
export const MEMBER_IDS = {
  alice:   '00000000-0000-0000-0000-000000000101',
  bob:     '00000000-0000-0000-0000-000000000102',
  charlie: '00000000-0000-0000-0000-000000000103',
}

export const USER_IDS = {
  alice:   '00000000-0000-0000-0000-000000000201',
  bob:     '00000000-0000-0000-0000-000000000202',
  charlie: '00000000-0000-0000-0000-000000000203',
  luna:    '00000000-0000-0000-0000-000000000204',
  weber:   '00000000-0000-0000-0000-000000000205',
}

export const MOCK_MEMBERS = [
  {
    idx: 1,
    id: MEMBER_IDS.alice,
    org_id: ORG_ID,
    user_id: USER_IDS.alice,
    email: 'alice@acme.com',
    name: '김앨리스',
    role: 'owner',
    status: 'active',
    invited_at: daysAgo(90),
    joined_at: daysAgo(89),
    created_at: daysAgo(90),
    updated_at: daysAgo(89),
  },
  {
    idx: 2,
    id: MEMBER_IDS.bob,
    org_id: ORG_ID,
    user_id: USER_IDS.bob,
    email: 'bob@acme.com',
    name: '박밥',
    role: 'admin',
    status: 'active',
    invited_at: daysAgo(85),
    joined_at: daysAgo(84),
    created_at: daysAgo(85),
    updated_at: daysAgo(84),
  },
  {
    idx: 3,
    id: MEMBER_IDS.charlie,
    org_id: ORG_ID,
    user_id: USER_IDS.charlie,
    email: 'charlie@acme.com',
    name: '최찰리',
    role: 'member',
    status: 'active',
    invited_at: daysAgo(60),
    joined_at: daysAgo(59),
    created_at: daysAgo(60),
    updated_at: daysAgo(59),
  },
]

// ─── Admin users ──────────────────────────────────────────
export const ADMIN_IDS = {
  luna:  '00000000-0000-0000-0000-000000000301',
  weber: '00000000-0000-0000-0000-000000000302',
}

export const MOCK_ADMINS = [
  {
    idx: 1,
    id: ADMIN_IDS.luna,
    user_id: USER_IDS.luna,
    email: 'luna@gridge.ai',
    name: 'Luna',
    role: 'am',
    is_active: true,
    totp_secret: null,
    last_login_at: daysAgo(0),
    created_at: daysAgo(120),
    updated_at: daysAgo(0),
  },
  {
    idx: 2,
    id: ADMIN_IDS.weber,
    user_id: USER_IDS.weber,
    email: 'weber@gridge.ai',
    name: '위버',
    role: 'super',
    is_active: true,
    totp_secret: 'MOCK_TOTP_SECRET',
    last_login_at: daysAgo(0),
    created_at: daysAgo(150),
    updated_at: daysAgo(0),
  },
]

// ─── 서비스 카탈로그 ──────────────────────────────────────
export const SERVICE_IDS = {
  claude_team:  '00000000-0000-0000-0000-000000000401',
  chatgpt_team: '00000000-0000-0000-0000-000000000402',
  cursor_biz:   '00000000-0000-0000-0000-000000000403',
  claude_api:   '00000000-0000-0000-0000-000000000404',
  copilot:      '00000000-0000-0000-0000-000000000405',
  perplexity:   '00000000-0000-0000-0000-000000000406',
  windsurf:     '00000000-0000-0000-0000-000000000407',
  lovable:      '00000000-0000-0000-0000-000000000408',
  chatgpt_plus: '00000000-0000-0000-0000-000000000409',
  openai_api:   '00000000-0000-0000-0000-000000000410',
}

export const MOCK_SERVICES = [
  { idx: 1, id: SERVICE_IDS.claude_team,  name: 'Claude Team', vendor: 'anthropic', category: 'subscription', tos_review_status: 'approved', tos_review_note: null, tos_reviewed_at: daysAgo(30).slice(0,10), tos_next_review_at: daysAhead(60).slice(0,10), pricing_policy: 'passthrough', is_anthropic_partnership: true,  unit_price_usd: 30,  unit_price_krw: 41000, is_active: true, created_at: daysAgo(200), updated_at: daysAgo(30) },
  { idx: 2, id: SERVICE_IDS.chatgpt_team, name: 'ChatGPT Team', vendor: 'openai', category: 'subscription', tos_review_status: 'approved', tos_review_note: null, tos_reviewed_at: daysAgo(30).slice(0,10), tos_next_review_at: daysAhead(60).slice(0,10), pricing_policy: 'passthrough', is_anthropic_partnership: false, unit_price_usd: 25,  unit_price_krw: 34000, is_active: true, created_at: daysAgo(200), updated_at: daysAgo(30) },
  { idx: 3, id: SERVICE_IDS.cursor_biz,   name: 'Cursor Business', vendor: 'cursor', category: 'subscription', tos_review_status: 'approved', tos_review_note: null, tos_reviewed_at: daysAgo(30).slice(0,10), tos_next_review_at: daysAhead(60).slice(0,10), pricing_policy: 'passthrough', is_anthropic_partnership: false, unit_price_usd: 40,  unit_price_krw: 54000, is_active: true, created_at: daysAgo(200), updated_at: daysAgo(30) },
  { idx: 4, id: SERVICE_IDS.claude_api,   name: 'Claude API', vendor: 'anthropic', category: 'api', tos_review_status: 'approved', tos_review_note: null, tos_reviewed_at: daysAgo(30).slice(0,10), tos_next_review_at: daysAhead(60).slice(0,10), pricing_policy: 'passthrough', is_anthropic_partnership: true,  unit_price_usd: null, unit_price_krw: null, is_active: true, created_at: daysAgo(200), updated_at: daysAgo(30) },
  { idx: 5, id: SERVICE_IDS.copilot,      name: 'GitHub Copilot Business', vendor: 'github', category: 'subscription', tos_review_status: 'approved', tos_review_note: null, tos_reviewed_at: daysAgo(30).slice(0,10), tos_next_review_at: daysAhead(60).slice(0,10), pricing_policy: 'passthrough', is_anthropic_partnership: false, unit_price_usd: 19, unit_price_krw: 26000, is_active: true, created_at: daysAgo(200), updated_at: daysAgo(30) },
  { idx: 6, id: SERVICE_IDS.perplexity,   name: 'Perplexity Pro', vendor: 'perplexity', category: 'subscription', tos_review_status: 'approved', tos_review_note: null, tos_reviewed_at: daysAgo(30).slice(0,10), tos_next_review_at: daysAhead(60).slice(0,10), pricing_policy: 'passthrough', is_anthropic_partnership: false, unit_price_usd: 20, unit_price_krw: 27000, is_active: true, created_at: daysAgo(200), updated_at: daysAgo(30) },
  { idx: 7, id: SERVICE_IDS.windsurf,     name: 'Windsurf Pro', vendor: 'codeium', category: 'subscription', tos_review_status: 'approved', tos_review_note: null, tos_reviewed_at: daysAgo(30).slice(0,10), tos_next_review_at: daysAhead(60).slice(0,10), pricing_policy: 'passthrough', is_anthropic_partnership: false, unit_price_usd: 15, unit_price_krw: 20000, is_active: true, created_at: daysAgo(200), updated_at: daysAgo(30) },
  { idx: 8, id: SERVICE_IDS.openai_api,   name: 'OpenAI API', vendor: 'openai', category: 'api', tos_review_status: 'approved', tos_review_note: null, tos_reviewed_at: daysAgo(30).slice(0,10), tos_next_review_at: daysAhead(60).slice(0,10), pricing_policy: 'passthrough', is_anthropic_partnership: false, unit_price_usd: null, unit_price_krw: null, is_active: true, created_at: daysAgo(200), updated_at: daysAgo(30) },
  { idx: 9, id: SERVICE_IDS.chatgpt_plus, name: 'ChatGPT Plus', vendor: 'openai', category: 'subscription', tos_review_status: 'conditional', tos_review_note: '개인 계정 기반 — 팀 플랜 전환 권고', tos_reviewed_at: daysAgo(30).slice(0,10), tos_next_review_at: daysAhead(60).slice(0,10), pricing_policy: 'passthrough', is_anthropic_partnership: false, unit_price_usd: 20, unit_price_krw: 27000, is_active: true, created_at: daysAgo(200), updated_at: daysAgo(30) },
  { idx: 10,id: SERVICE_IDS.lovable,      name: 'Lovable Pro', vendor: 'lovable', category: 'agent_credit', tos_review_status: 'pending', tos_review_note: '검토 중', tos_reviewed_at: null, tos_next_review_at: daysAhead(60).slice(0,10), pricing_policy: 'passthrough', is_anthropic_partnership: false, unit_price_usd: null, unit_price_krw: null, is_active: true, created_at: daysAgo(200), updated_at: daysAgo(30) },
]

// ─── 계정 (Alice 2개, Bob 2개, Charlie 1개) ────────────────
export const ACCOUNT_IDS = {
  alice_claude:  '00000000-0000-0000-0000-000000000501',
  alice_cursor:  '00000000-0000-0000-0000-000000000502',
  bob_chatgpt:   '00000000-0000-0000-0000-000000000503',
  bob_copilot:   '00000000-0000-0000-0000-000000000504',
  charlie_claude:'00000000-0000-0000-0000-000000000505',
}

export const MOCK_ACCOUNTS = [
  { idx: 1, id: ACCOUNT_IDS.alice_claude,  org_id: ORG_ID, member_id: MEMBER_IDS.alice,   service_id: SERVICE_IDS.claude_team,  status: 'active', monthly_limit_krw: 500000, allow_overseas: true,  purpose: 'CTO — 아키텍처 설계, PR 리뷰',          activated_at: daysAgo(80), terminated_at: null, created_at: daysAgo(88), updated_at: daysAgo(80) },
  { idx: 2, id: ACCOUNT_IDS.alice_cursor,  org_id: ORG_ID, member_id: MEMBER_IDS.alice,   service_id: SERVICE_IDS.cursor_biz,   status: 'active', monthly_limit_krw: 300000, allow_overseas: true,  purpose: 'CTO — IDE',                              activated_at: daysAgo(80), terminated_at: null, created_at: daysAgo(88), updated_at: daysAgo(80) },
  { idx: 3, id: ACCOUNT_IDS.bob_chatgpt,   org_id: ORG_ID, member_id: MEMBER_IDS.bob,     service_id: SERVICE_IDS.chatgpt_team, status: 'active', monthly_limit_krw: 400000, allow_overseas: true,  purpose: 'Lead — 기획 문서 작성',                   activated_at: daysAgo(75), terminated_at: null, created_at: daysAgo(83), updated_at: daysAgo(75) },
  { idx: 4, id: ACCOUNT_IDS.bob_copilot,   org_id: ORG_ID, member_id: MEMBER_IDS.bob,     service_id: SERVICE_IDS.copilot,      status: 'active', monthly_limit_krw: 200000, allow_overseas: true,  purpose: 'Lead — 백엔드 개발',                      activated_at: daysAgo(75), terminated_at: null, created_at: daysAgo(83), updated_at: daysAgo(75) },
  { idx: 5, id: ACCOUNT_IDS.charlie_claude,org_id: ORG_ID, member_id: MEMBER_IDS.charlie, service_id: SERVICE_IDS.claude_team,  status: 'active', monthly_limit_krw: 300000, allow_overseas: true,  purpose: '개발자 — 코드 작성',                       activated_at: daysAgo(55), terminated_at: null, created_at: daysAgo(58), updated_at: daysAgo(55) },
]

// ─── VCN ─────────────────────────────────────────────────
export const VCN_IDS = {
  alice_claude:  '00000000-0000-0000-0000-000000000601',
  alice_cursor:  '00000000-0000-0000-0000-000000000602',
  bob_chatgpt:   '00000000-0000-0000-0000-000000000603',
  bob_copilot:   '00000000-0000-0000-0000-000000000604',
  charlie_claude:'00000000-0000-0000-0000-000000000605',
}

export const MOCK_VCNS = [
  { idx: 1, id: VCN_IDS.alice_claude,  account_id: ACCOUNT_IDS.alice_claude,  org_id: ORG_ID, card_type: 'primary', card_last4: '1234', card_issuer: 'shinhan_vcn', status: 'active', monthly_limit_krw: 500000, allow_overseas: true, mcc_whitelist: ['5734','7372'], issued_at: daysAgo(80), activated_at: daysAgo(80), suspended_at: null, revoked_at: null, expired_at: null, created_at: daysAgo(81), updated_at: daysAgo(80) },
  { idx: 2, id: VCN_IDS.alice_cursor,  account_id: ACCOUNT_IDS.alice_cursor,  org_id: ORG_ID, card_type: 'primary', card_last4: '2345', card_issuer: 'shinhan_vcn', status: 'active', monthly_limit_krw: 300000, allow_overseas: true, mcc_whitelist: ['5734','7372'], issued_at: daysAgo(80), activated_at: daysAgo(80), suspended_at: null, revoked_at: null, expired_at: null, created_at: daysAgo(81), updated_at: daysAgo(80) },
  { idx: 3, id: VCN_IDS.bob_chatgpt,   account_id: ACCOUNT_IDS.bob_chatgpt,   org_id: ORG_ID, card_type: 'primary', card_last4: '3456', card_issuer: 'shinhan_vcn', status: 'active', monthly_limit_krw: 400000, allow_overseas: true, mcc_whitelist: ['5734','7372'], issued_at: daysAgo(75), activated_at: daysAgo(75), suspended_at: null, revoked_at: null, expired_at: null, created_at: daysAgo(76), updated_at: daysAgo(75) },
  { idx: 4, id: VCN_IDS.bob_copilot,   account_id: ACCOUNT_IDS.bob_copilot,   org_id: ORG_ID, card_type: 'primary', card_last4: '4567', card_issuer: 'shinhan_vcn', status: 'suspended', monthly_limit_krw: 200000, allow_overseas: true, mcc_whitelist: ['5734','7372'], issued_at: daysAgo(75), activated_at: daysAgo(75), suspended_at: daysAgo(5), revoked_at: null, expired_at: null, created_at: daysAgo(76), updated_at: daysAgo(5) },
  { idx: 5, id: VCN_IDS.charlie_claude,account_id: ACCOUNT_IDS.charlie_claude,org_id: ORG_ID, card_type: 'primary', card_last4: '5678', card_issuer: 'shinhan_vcn', status: 'active', monthly_limit_krw: 300000, allow_overseas: true, mcc_whitelist: ['5734','7372'], issued_at: daysAgo(55), activated_at: daysAgo(55), suspended_at: null, revoked_at: null, expired_at: null, created_at: daysAgo(56), updated_at: daysAgo(55) },
]

// ─── 거래 ─────────────────────────────────────────────────
let txCounter = 0
const tx = (daysBefore: number, vcnKey: keyof typeof VCN_IDS, accountKey: keyof typeof ACCOUNT_IDS, serviceKey: keyof typeof SERVICE_IDS, gridgeCost: number, margin: number, merchant: string, status: 'settled' | 'declined' = 'settled', declineReason?: string) => {
  txCounter++
  const customerCharge = gridgeCost + margin
  const date = new Date(NOW); date.setDate(date.getDate() - daysBefore)
  const billingMonth = date.toISOString().slice(0, 7)
  const isAnthropic = serviceKey === 'claude_team' || serviceKey === 'claude_api'
  return {
    idx: txCounter,
    id: `00000000-0000-0000-0000-0000007${String(txCounter).padStart(5,'0')}`,
    org_id: ORG_ID,
    account_id: ACCOUNT_IDS[accountKey],
    virtual_card_id: VCN_IDS[vcnKey],
    service_id: SERVICE_IDS[serviceKey],
    amount_krw: customerCharge,
    gridge_cost_krw: gridgeCost,
    customer_charge_krw: customerCharge,
    gridge_margin_krw: margin,
    is_anthropic_passthrough: isAnthropic,
    status,
    currency: 'KRW',
    exchange_rate: 1350,
    amount_usd: Math.round(customerCharge / 1350 * 100) / 100,
    decline_reason: declineReason ?? null,
    merchant_name: merchant,
    billing_month: billingMonth,
    transacted_at: iso(date),
    settled_at: status === 'settled' ? iso(date) : null,
    created_at: iso(date),
  }
}

export const MOCK_TRANSACTIONS = [
  // 이번 달 (M3)
  tx(1,  'alice_claude', 'alice_claude', 'claude_team',  41000, 0,    'Anthropic Claude Team'),
  tx(2,  'alice_cursor', 'alice_cursor', 'cursor_biz',   54000, 5400, 'Cursor Business'),
  tx(3,  'bob_chatgpt',  'bob_chatgpt',  'chatgpt_team', 34000, 3400, 'OpenAI ChatGPT Team'),
  tx(4,  'bob_copilot',  'bob_copilot',  'copilot',      26000, 2600, 'GitHub Copilot', 'declined', 'INSUFFICIENT_LIMIT'),
  tx(5,  'charlie_claude','charlie_claude','claude_team',41000, 0,    'Anthropic Claude Team'),
  tx(6,  'alice_claude', 'alice_claude', 'claude_api',   15000, 0,    'Anthropic API'),
  tx(7,  'bob_chatgpt',  'bob_chatgpt',  'openai_api',   8200, 820,  'OpenAI API'),
  // 지난 달 (M2)
  tx(35, 'alice_claude', 'alice_claude', 'claude_team',  41000, 0,    'Anthropic Claude Team'),
  tx(36, 'alice_cursor', 'alice_cursor', 'cursor_biz',   54000, 5400, 'Cursor Business'),
  tx(37, 'bob_chatgpt',  'bob_chatgpt',  'chatgpt_team', 34000, 3400, 'OpenAI ChatGPT Team'),
  tx(38, 'bob_copilot',  'bob_copilot',  'copilot',      26000, 2600, 'GitHub Copilot'),
  tx(39, 'charlie_claude','charlie_claude','claude_team',41000, 0,    'Anthropic Claude Team'),
  tx(40, 'alice_claude', 'alice_claude', 'claude_api',   23000, 0,    'Anthropic API'),
  // 두 달 전 (M1)
  tx(65, 'alice_claude', 'alice_claude', 'claude_team',  41000, 0,    'Anthropic Claude Team'),
  tx(66, 'alice_cursor', 'alice_cursor', 'cursor_biz',   54000, 5400, 'Cursor Business'),
  tx(67, 'bob_chatgpt',  'bob_chatgpt',  'chatgpt_team', 34000, 3400, 'OpenAI ChatGPT Team'),
  tx(68, 'bob_copilot',  'bob_copilot',  'copilot',      26000, 2600, 'GitHub Copilot'),
  tx(69, 'charlie_claude','charlie_claude','claude_team',41000, 0,    'Anthropic Claude Team'),
]

// ─── 청구서 (M1, M2 발행 / M3 draft) ─────────────────────
const sumMonth = (month: string) => MOCK_TRANSACTIONS
  .filter(t => t.billing_month === month && t.status === 'settled')
  .reduce((sum, t) => sum + t.customer_charge_krw, 0)

const invoiceFor = (month: string, seq: number, status: 'draft' | 'issued' | 'paid') => {
  const subtotalBefore = sumMonth(month)
  const credit = Math.round(subtotalBefore * 0.10)
  const subtotal = subtotalBefore - credit
  const vat = Math.round(subtotal * 0.10)
  const total = subtotal + vat
  return {
    idx: seq,
    id: `00000000-0000-0000-0000-0000008${String(seq).padStart(5,'0')}`,
    org_id: ORG_ID,
    billing_month: month,
    status,
    subtotal_before_creditback: subtotalBefore,
    credit_amount: credit,
    subtotal_krw: subtotal,
    vat_krw: vat,
    total_due_krw: total,
    tax_invoice_id: status === 'issued' || status === 'paid' ? `2024-${seq.toString().padStart(8,'0')}` : null,
    tax_invoice_issued_at: status === 'issued' || status === 'paid' ? daysAgo(35 * (4 - seq)) : null,
    requires_super_approval: total >= 10000000,
    super_approved_at: null,
    super_approved_by: null,
    due_date: new Date(month + '-01T00:00:00Z').toISOString().slice(0, 10),
    paid_at: status === 'paid' ? daysAgo(30 * (4 - seq)) : null,
    created_at: daysAgo(35 * (4 - seq)),
    updated_at: daysAgo(30 * (4 - seq)),
  }
}

export const MOCK_INVOICES = [
  invoiceFor(MONTH, 3, 'draft'),
  invoiceFor(LAST_MONTH, 2, 'paid'),
  invoiceFor(TWO_MONTHS_AGO, 1, 'paid'),
]

// ─── 크레딧백 (M1, M2 적용) ──────────────────────────────
export const MOCK_CREDIT_BACKS = [
  {
    idx: 1,
    id: '00000000-0000-0000-0000-000000000901',
    org_id: ORG_ID,
    invoice_id: MOCK_INVOICES[2].id,
    billing_month: TWO_MONTHS_AGO,
    month_seq: 1,
    base_amount_krw: MOCK_INVOICES[2].subtotal_before_creditback,
    credit_amount_krw: MOCK_INVOICES[2].credit_amount,
    is_final: false,
    applied_at: daysAgo(60),
  },
  {
    idx: 2,
    id: '00000000-0000-0000-0000-000000000902',
    org_id: ORG_ID,
    invoice_id: MOCK_INVOICES[1].id,
    billing_month: LAST_MONTH,
    month_seq: 2,
    base_amount_krw: MOCK_INVOICES[1].subtotal_before_creditback,
    credit_amount_krw: MOCK_INVOICES[1].credit_amount,
    is_final: false,
    applied_at: daysAgo(30),
  },
]

// ─── 요청 ─────────────────────────────────────────────────
export const REQUEST_IDS = {
  req1_pending:  '00000000-0000-0000-0000-000000000A01',
  req2_review:   '00000000-0000-0000-0000-000000000A02',
  req3_await:    '00000000-0000-0000-0000-000000000A03',
  req4_done:     '00000000-0000-0000-0000-000000000A04',
  req5_decline:  '00000000-0000-0000-0000-000000000A05',
}

export const MOCK_REQUESTS = [
  {
    idx: 1, id: REQUEST_IDS.req1_pending, org_id: ORG_ID,
    requester_id: MEMBER_IDS.charlie, action_type: 'new_account', status: 'pending',
    path_type: null, account_id: null, member_id: MEMBER_IDS.charlie,
    progress_state: {}, request_data: { service_id: SERVICE_IDS.cursor_biz, monthly_limit_krw: 300000, allow_overseas: true, purpose: 'IDE 전환 — Copilot → Cursor' },
    assigned_to: null, sla_deadline: daysAhead(3), parent_id: null,
    resolved_at: null, resolved_by: null, created_at: daysAgo(1), updated_at: daysAgo(1),
  },
  {
    idx: 2, id: REQUEST_IDS.req2_review, org_id: ORG_ID,
    requester_id: MEMBER_IDS.bob, action_type: 'limit_change', status: 'in_review',
    path_type: 'fast', account_id: ACCOUNT_IDS.bob_chatgpt, member_id: null,
    progress_state: { approval_path: true }, request_data: { new_limit_krw: 500000 },
    assigned_to: ADMIN_IDS.luna, sla_deadline: daysAhead(2), parent_id: null,
    resolved_at: null, resolved_by: null, created_at: daysAgo(2), updated_at: daysAgo(0),
  },
  {
    idx: 3, id: REQUEST_IDS.req3_await, org_id: ORG_ID,
    requester_id: MEMBER_IDS.alice, action_type: 'vcn_replace', status: 'awaiting_customer',
    path_type: 'full', account_id: ACCOUNT_IDS.bob_copilot, member_id: null,
    progress_state: { primary_suspended: true, backup_issued: true, service_updated: true, onepw_shared: true },
    request_data: { reason: '카드사 결제 차단 의심 — Copilot 거절' },
    assigned_to: ADMIN_IDS.luna, sla_deadline: daysAhead(1), parent_id: null,
    resolved_at: null, resolved_by: null, created_at: daysAgo(3), updated_at: daysAgo(0),
  },
  {
    idx: 4, id: REQUEST_IDS.req4_done, org_id: ORG_ID,
    requester_id: MEMBER_IDS.alice, action_type: 'new_account', status: 'completed',
    path_type: 'fast', account_id: ACCOUNT_IDS.alice_cursor, member_id: MEMBER_IDS.alice,
    progress_state: { tos_reviewed: true, limit_approved: true, vcn_issued: true, vcn_registered: true, onepw_shared: true, customer_confirm: true },
    request_data: { service_id: SERVICE_IDS.cursor_biz, monthly_limit_krw: 300000, allow_overseas: true, purpose: 'IDE' },
    assigned_to: ADMIN_IDS.luna, sla_deadline: daysAgo(77), parent_id: null,
    resolved_at: daysAgo(80), resolved_by: ADMIN_IDS.luna, created_at: daysAgo(82), updated_at: daysAgo(80),
  },
  {
    idx: 5, id: REQUEST_IDS.req5_decline, org_id: ORG_ID,
    requester_id: MEMBER_IDS.bob, action_type: 'decline_response', status: 'in_review',
    path_type: 'full', account_id: ACCOUNT_IDS.bob_copilot, member_id: null,
    progress_state: { cause_identified: true, vcn_reconfigured: false, customer_notified: true, retry_confirmed: false },
    request_data: { decline_context: 'Copilot 연속 결제 거절, 원인 파악 필요' },
    assigned_to: ADMIN_IDS.luna, sla_deadline: daysAhead(0), parent_id: null,
    resolved_at: null, resolved_by: null, created_at: daysAgo(1), updated_at: daysAgo(0),
  },
]

// ─── 메시지 ───────────────────────────────────────────────
let msgCounter = 0
const msg = (requestId: string, daysBefore: number, senderType: 'member'|'admin'|'system', senderId: string | null, senderName: string | null, body: string) => {
  msgCounter++
  const date = new Date(NOW); date.setDate(date.getDate() - daysBefore); date.setHours(date.getHours() - (msgCounter % 5))
  return {
    idx: msgCounter,
    id: `00000000-0000-0000-0000-0000000B${String(msgCounter).padStart(4,'0')}`,
    request_id: requestId,
    org_id: ORG_ID,
    message_type: senderType === 'system' ? 'system_update' as const : 'text' as const,
    sender_type: senderType,
    sender_id: senderId,
    sender_name: senderName,
    body,
    attachments: [],
    read_by_member_at: null,
    read_by_admin_at: null,
    created_at: iso(date),
  }
}

export const MOCK_MESSAGES = [
  msg(REQUEST_IDS.req2_review, 2, 'member', MEMBER_IDS.bob, '박밥', '월 40만원으로는 빠듯해서 50만원 요청합니다.'),
  msg(REQUEST_IDS.req2_review, 1, 'admin', ADMIN_IDS.luna, 'Luna', 'Fast Path로 진행합니다. 카드사 포털 반영 중이에요.'),
  msg(REQUEST_IDS.req3_await, 3, 'member', MEMBER_IDS.alice, '김앨리스', 'Copilot 결제가 계속 거절돼요.'),
  msg(REQUEST_IDS.req3_await, 2, 'admin', ADMIN_IDS.luna, 'Luna', '원인 확인했습니다. 새 VCN 발급 중이에요.'),
  msg(REQUEST_IDS.req3_await, 1, 'admin', ADMIN_IDS.luna, 'Luna', '1Password 공유 링크 보냈습니다. 교체 완료 확인 눌러주세요.'),
  msg(REQUEST_IDS.req3_await, 1, 'system', null, null, 'AM이 처리를 완료했습니다. 고객 확인 대기 중.'),
]

// ─── 이벤트 ───────────────────────────────────────────────
let evCounter = 0
const ev = (requestId: string, daysBefore: number, eventType: string, actorType: 'member'|'admin'|'system', actorId: string | null, data: Record<string, unknown> = {}) => {
  evCounter++
  const date = new Date(NOW); date.setDate(date.getDate() - daysBefore)
  return {
    idx: evCounter,
    id: `00000000-0000-0000-0000-0000000C${String(evCounter).padStart(4,'0')}`,
    request_id: requestId,
    org_id: ORG_ID,
    event_type: eventType,
    actor_type: actorType,
    actor_id: actorId,
    event_data: data,
    created_at: iso(date),
  }
}

export const MOCK_EVENTS = [
  ev(REQUEST_IDS.req2_review, 2, 'created', 'member', MEMBER_IDS.bob, { action_type: 'limit_change' }),
  ev(REQUEST_IDS.req2_review, 2, 'path_decided', 'admin', ADMIN_IDS.luna, { path_type: 'fast' }),
  ev(REQUEST_IDS.req2_review, 0, 'assigned', 'admin', ADMIN_IDS.luna, {}),
  ev(REQUEST_IDS.req3_await, 3, 'created', 'member', MEMBER_IDS.alice, { action_type: 'vcn_replace' }),
  ev(REQUEST_IDS.req3_await, 3, 'path_decided', 'admin', ADMIN_IDS.luna, { path_type: 'full' }),
  ev(REQUEST_IDS.req3_await, 1, 'awaiting_customer', 'admin', ADMIN_IDS.luna, {}),
  ev(REQUEST_IDS.req4_done, 82, 'created', 'member', MEMBER_IDS.alice, {}),
  ev(REQUEST_IDS.req4_done, 80, 'completed', 'admin', ADMIN_IDS.luna, {}),
]

// ─── 감사 로그 ────────────────────────────────────────────
let auditCounter = 0
const au = (daysBefore: number, actorType: 'member'|'admin'|'system', actorId: string | null, actorEmail: string | null, action: string, targetType: string | null, visibility: 'customer_only'|'internal_only'|'both', detail: Record<string, unknown>) => {
  auditCounter++
  const date = new Date(NOW); date.setDate(date.getDate() - daysBefore); date.setMinutes(auditCounter * 7)
  return {
    idx: auditCounter,
    id: `00000000-0000-0000-0000-0000000D${String(auditCounter).padStart(4,'0')}`,
    org_id: ORG_ID,
    actor_type: actorType,
    actor_id: actorId,
    actor_email: actorEmail,
    action,
    target_type: targetType,
    target_id: null,
    visibility,
    detail,
    ip_address: null,
    created_at: iso(date),
  }
}

export const MOCK_AUDIT_LOGS = [
  au(89, 'admin', ADMIN_IDS.weber, 'weber@gridge.ai', 'member_invited', 'member', 'both', { email: 'alice@acme.com', role: 'owner' }),
  au(85, 'member', MEMBER_IDS.alice, 'alice@acme.com', 'member_invited', 'member', 'both', { email: 'bob@acme.com', role: 'admin' }),
  au(60, 'member', MEMBER_IDS.alice, 'alice@acme.com', 'member_invited', 'member', 'both', { email: 'charlie@acme.com', role: 'member' }),
  au(80, 'admin', ADMIN_IDS.luna, 'luna@gridge.ai', 'vcn_created', 'virtual_card', 'both', { card_type: 'primary', issuer: 'shinhan_vcn' }),
  au(80, 'admin', ADMIN_IDS.luna, 'luna@gridge.ai', 'vcn_status_active', 'virtual_card', 'both', { to: 'active', from: 'delivered' }),
  au(60, 'admin', ADMIN_IDS.luna, 'luna@gridge.ai', 'invoice_issued', 'invoice', 'both', { total_due_krw: MOCK_INVOICES[2].total_due_krw, billing_month: TWO_MONTHS_AGO }),
  au(30, 'admin', ADMIN_IDS.luna, 'luna@gridge.ai', 'invoice_issued', 'invoice', 'both', { total_due_krw: MOCK_INVOICES[1].total_due_krw, billing_month: LAST_MONTH }),
  au(5,  'admin', ADMIN_IDS.luna, 'luna@gridge.ai', 'vcn_status_suspended', 'virtual_card', 'both', { to: 'suspended', from: 'active', card_last4: '4567' }),
  au(2,  'admin', ADMIN_IDS.weber, 'weber@gridge.ai', 'vcn_full_number_reveal', 'virtual_card', 'internal_only', { reason: 'Copilot 결제 거절 원인 파악을 위한 전체번호 대조', card_last4: '4567' }),
  au(0,  'system', null, null, 'audit_log_exported', 'audit_log', 'both', { vis: 'all', row_count: 15, format: 'csv' }),
]

// ─── Notification Preferences (system defaults + member) ─
export const MOCK_NOTIFICATION_DEFAULTS = [
  { event_type: 'payment_declined', channel: 'email', enabled: true },
  { event_type: 'payment_declined', channel: 'slack', enabled: true },
  { event_type: 'payment_declined', channel: 'sms',   enabled: false },
  { event_type: 'vcn_suspended',    channel: 'email', enabled: true },
  { event_type: 'vcn_suspended',    channel: 'slack', enabled: true },
  { event_type: 'overdue_warning',  channel: 'email', enabled: true },
  { event_type: 'overdue_warning',  channel: 'slack', enabled: true },
  { event_type: 'request_awaiting_customer', channel: 'email', enabled: true },
  { event_type: 'request_awaiting_customer', channel: 'slack', enabled: true },
  { event_type: 'request_completed', channel: 'email', enabled: true },
  { event_type: 'request_completed', channel: 'slack', enabled: false },
  { event_type: 'member_invited',    channel: 'email', enabled: true },
  { event_type: 'invoice_issued',    channel: 'email', enabled: true },
  { event_type: 'invoice_issued',    channel: 'slack', enabled: false },
  { event_type: 'tax_invoice_issued',channel: 'email', enabled: true },
  { event_type: 'creditback_applied',channel: 'email', enabled: true },
  { event_type: 'creditback_ending_soon', channel: 'email', enabled: true },
  { event_type: 'creditback_ending_soon', channel: 'slack', enabled: true },
  { event_type: 'limit_breach_approach',  channel: 'email', enabled: true },
  { event_type: 'limit_breach_approach',  channel: 'slack', enabled: false },
]

export const MOCK_NOTIFICATION_PREFERENCES: {
  id: string; org_id: string; member_id: string | null; scope: string;
  channel: string; event_type: string; enabled: boolean; config: Record<string, unknown>;
  created_at: string; updated_at: string;
}[] = []

// ─── Export jobs ──────────────────────────────────────────
export const MOCK_EXPORT_JOBS = [
  {
    idx: 1,
    id: '00000000-0000-0000-0000-0000000E0001',
    org_id: ORG_ID,
    requested_by: MEMBER_IDS.alice,
    export_type: 'full_zip',
    status: 'ready',
    file_path: 'mock/export-1.zip',
    file_size_bytes: 1048576,
    download_url: '#mock-download',
    download_count: 1,
    expires_at: daysAhead(6),
    error_message: null,
    auto_export_on_termination: false,
    created_at: daysAgo(1),
    completed_at: daysAgo(1),
  },
]

// ─── Anomaly events ───────────────────────────────────────
export const MOCK_ANOMALY_EVENTS = [
  {
    idx: 1,
    id: '00000000-0000-0000-0000-0000000F0001',
    rule_id: '00000000-0000-0000-0000-0000000F1001',
    rule_code: 'decline_burst',
    severity: 'critical',
    org_id: ORG_ID,
    related_type: 'virtual_card',
    related_id: VCN_IDS.bob_copilot,
    detection_data: { declined_count: 3, window_minutes: 5 },
    auto_actions_executed: ['notify_am'],
    acknowledged_at: daysAgo(1),
    acknowledged_by: ADMIN_IDS.luna,
    resolved_at: null,
    resolved_by: null,
    created_at: daysAgo(1),
  },
]

// ─── Virtual users (for auth mock) ────────────────────────
export interface MockUser {
  id: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'member' | 'am' | 'super'
  scope: 'customer' | 'console'
  last_sign_in_at: string
}

export const MOCK_USERS: Record<string, MockUser> = {
  'alice@acme.com':   { id: USER_IDS.alice,   email: 'alice@acme.com',   name: '김앨리스', role: 'owner',  scope: 'customer', last_sign_in_at: daysAgo(0) },
  'bob@acme.com':     { id: USER_IDS.bob,     email: 'bob@acme.com',     name: '박밥',    role: 'admin',  scope: 'customer', last_sign_in_at: daysAgo(0) },
  'charlie@acme.com': { id: USER_IDS.charlie, email: 'charlie@acme.com', name: '최찰리',  role: 'member', scope: 'customer', last_sign_in_at: daysAgo(0) },
  'luna@gridge.ai':   { id: USER_IDS.luna,    email: 'luna@gridge.ai',   name: 'Luna',   role: 'am',     scope: 'console',  last_sign_in_at: daysAgo(0) },
  'weber@gridge.ai':  { id: USER_IDS.weber,   email: 'weber@gridge.ai',  name: '위버',    role: 'super',  scope: 'console',  last_sign_in_at: daysAgo(0) },
}
