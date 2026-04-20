-- ============================================================
-- Gridge Billing MSP — P1 테이블 12개
-- PB-001~PB-013, G-091 Mode D
-- ============================================================

-- billing 스키마 분리 (G-091-06: AiOPS와 물리적 분리)
CREATE SCHEMA IF NOT EXISTS billing;

-- 편의 함수
CREATE OR REPLACE FUNCTION billing.now_utc() RETURNS timestamptz AS $$
  SELECT NOW() AT TIME ZONE 'UTC';
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- 1. orgs — 고객 조직
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.orgs (
  idx                   BIGSERIAL PRIMARY KEY,
  id                    UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  name                  TEXT NOT NULL,
  business_reg_no       TEXT UNIQUE NOT NULL,            -- 사업자등록번호 (immutable)
  plan                  TEXT NOT NULL DEFAULT 'monthly'  -- monthly | weekly | prepaid_monthly
                          CHECK (plan IN ('monthly','weekly','prepaid_monthly')),
  infra_mode            TEXT NOT NULL DEFAULT 'A'
                          CHECK (infra_mode IN ('A','B','C')),
  billing_mode          TEXT NOT NULL DEFAULT 'D',       -- Mode D 항상
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('pending','active','suspended','terminating','terminated')),
  creditback_start_at   DATE,
  creditback_end_at     DATE,
  deposit_remaining_krw BIGINT NOT NULL DEFAULT 0,
  credit_limit_krw      BIGINT NOT NULL DEFAULT 5000000,
  aiops_org_id          UUID,                            -- AiOPS 연동 (I-004)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

-- business_reg_no immutable 트리거
CREATE OR REPLACE FUNCTION billing.prevent_brn_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.business_reg_no IS DISTINCT FROM NEW.business_reg_no THEN
    RAISE EXCEPTION 'business_reg_no is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orgs_brn_immutable
  BEFORE UPDATE ON billing.orgs
  FOR EACH ROW EXECUTE FUNCTION billing.prevent_brn_update();

-- ============================================================
-- 2. members — 조직 멤버
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.members (
  idx        BIGSERIAL PRIMARY KEY,
  id         UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id     UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,
  user_id    UUID,                                       -- Supabase Auth user id
  email      TEXT NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member'
               CHECK (role IN ('owner','admin','member')),
  status     TEXT NOT NULL DEFAULT 'invited'
               CHECK (status IN ('invited','active','suspended','offboarded')),
  invited_at TIMESTAMPTZ,
  joined_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  UNIQUE (org_id, email)
);

-- Owner 1인 제약 (PB-001-03)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_owner
  ON billing.members (org_id)
  WHERE role = 'owner' AND status != 'offboarded';

-- ============================================================
-- 3. admin_users — 운영 콘솔 사용자 (Gridge 내부)
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.admin_users (
  idx          BIGSERIAL PRIMARY KEY,
  id           UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  email        TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'am'
                 CHECK (role IN ('super','am','finance','ops')),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  totp_secret  TEXT,                                     -- Supabase Vault 참조
  last_login_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

-- ============================================================
-- 4. org_contracts — 조직 계약
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.org_contracts (
  idx                        BIGSERIAL PRIMARY KEY,
  id                         UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id                     UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,
  tier                       TEXT NOT NULL DEFAULT 'monthly'
                               CHECK (tier IN ('monthly','weekly','prepaid_monthly')),
  creditback_rate            NUMERIC(5,4) NOT NULL DEFAULT 0.10,  -- 10%
  creditback_months          INT NOT NULL DEFAULT 6,
  creditback_start_at        DATE,
  final_creditback_applied   BOOLEAN NOT NULL DEFAULT FALSE,      -- M6 완료 플래그
  monthly_fee_krw            BIGINT NOT NULL DEFAULT 0,
  credit_limit_krw           BIGINT NOT NULL DEFAULT 5000000,
  deposit_krw                BIGINT NOT NULL DEFAULT 0,
  contract_start_at          DATE NOT NULL,
  contract_end_at            DATE,
  signed_at                  TIMESTAMPTZ,
  am_user_id                 UUID REFERENCES billing.admin_users(id),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

-- ============================================================
-- 5. services — 벤더 서비스 카탈로그 (PB-006)
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.services (
  idx                BIGSERIAL PRIMARY KEY,
  id                 UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  name               TEXT NOT NULL,                       -- "Claude Team", "ChatGPT Team" 등
  vendor             TEXT NOT NULL,                       -- anthropic | openai | cursor | ...
  category           TEXT NOT NULL DEFAULT 'subscription'
                       CHECK (category IN ('subscription','api','agent_credit','other')),
  tos_review_status  TEXT NOT NULL DEFAULT 'pending'
                       CHECK (tos_review_status IN ('approved','conditional','rejected','pending')),
  tos_review_note    TEXT,
  tos_reviewed_at    DATE,
  tos_next_review_at DATE,                               -- 분기별 재실사
  pricing_policy     TEXT NOT NULL DEFAULT 'passthrough'
                       CHECK (pricing_policy IN ('passthrough','cost_plus_2pct','fixed_markup_10k')),
  is_anthropic_partnership BOOLEAN NOT NULL DEFAULT FALSE, -- PB-007 패스스루 대상
  unit_price_usd     NUMERIC(12,4),
  unit_price_krw     BIGINT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

-- ============================================================
-- 6. accounts — 멤버 × 서비스 계정
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.accounts (
  idx                BIGSERIAL PRIMARY KEY,
  id                 UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id             UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,
  member_id          UUID NOT NULL REFERENCES billing.members(id) ON DELETE RESTRICT,
  service_id         UUID NOT NULL REFERENCES billing.services(id) ON DELETE RESTRICT,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','active','suspended','expired','terminated')),
  monthly_limit_krw  BIGINT NOT NULL DEFAULT 500000,
  allow_overseas     BOOLEAN NOT NULL DEFAULT TRUE,
  purpose            TEXT,
  activated_at       TIMESTAMPTZ,
  terminated_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  UNIQUE (member_id, service_id, status)
    DEFERRABLE INITIALLY DEFERRED
);

-- ============================================================
-- 7. virtual_cards — VCN (PB-002)
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.virtual_cards (
  idx                BIGSERIAL PRIMARY KEY,
  id                 UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  account_id         UUID NOT NULL REFERENCES billing.accounts(id) ON DELETE RESTRICT,
  org_id             UUID NOT NULL REFERENCES billing.orgs(id),
  card_type          TEXT NOT NULL DEFAULT 'primary' CHECK (card_type IN ('primary','backup')),
  -- 전체 번호는 카드사만 보유. 마스킹 4자리만 저장 (PB-002-06)
  card_last4         CHAR(4),
  card_issuer        TEXT NOT NULL DEFAULT 'shinhan_vcn',
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','approved','issuing','issued','delivered',
                                         'active','suspended','revoked','expired')),
  monthly_limit_krw  BIGINT NOT NULL DEFAULT 500000,
  allow_overseas     BOOLEAN NOT NULL DEFAULT TRUE,
  mcc_whitelist      TEXT[],
  issued_at          TIMESTAMPTZ,
  activated_at       TIMESTAMPTZ,
  suspended_at       TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  expired_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

-- 불가능 전이 차단 트리거 (PB-002)
CREATE OR REPLACE FUNCTION billing.validate_vcn_transition()
RETURNS TRIGGER AS $$
DECLARE
  allowed BOOLEAN := FALSE;
BEGIN
  -- 가능한 전이만 허용
  allowed := CASE
    WHEN OLD.status = 'pending'    AND NEW.status IN ('approved','revoked')          THEN TRUE
    WHEN OLD.status = 'approved'   AND NEW.status IN ('issuing','revoked')           THEN TRUE
    WHEN OLD.status = 'issuing'    AND NEW.status IN ('issued','revoked')            THEN TRUE
    WHEN OLD.status = 'issued'     AND NEW.status IN ('delivered','revoked')         THEN TRUE
    WHEN OLD.status = 'delivered'  AND NEW.status IN ('active','revoked')            THEN TRUE
    WHEN OLD.status = 'active'     AND NEW.status IN ('suspended','expired','revoked') THEN TRUE
    WHEN OLD.status = 'suspended'  AND NEW.status IN ('active','revoked')            THEN TRUE
    ELSE FALSE
  END;
  IF NOT allowed THEN
    RAISE EXCEPTION 'VCN 상태 전이 불가: % → %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vcn_transition
  BEFORE UPDATE OF status ON billing.virtual_cards
  FOR EACH ROW EXECUTE FUNCTION billing.validate_vcn_transition();

-- ============================================================
-- 8. transactions — 결제 원장 (PB-005 Immutable + PB-009 회계분리)
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.transactions (
  idx                      BIGSERIAL PRIMARY KEY,
  id                       UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id                   UUID NOT NULL REFERENCES billing.orgs(id),
  account_id               UUID REFERENCES billing.accounts(id),
  virtual_card_id          UUID REFERENCES billing.virtual_cards(id),
  service_id               UUID REFERENCES billing.services(id),
  -- 금액 (PB-009 회계 분리 3필드)
  amount_krw               BIGINT NOT NULL,
  gridge_cost_krw          BIGINT NOT NULL,              -- Gridge 원가
  customer_charge_krw      BIGINT NOT NULL,              -- 고객 청구액
  gridge_margin_krw        BIGINT NOT NULL DEFAULT 0,    -- 마진 (고객 포털 비노출)
  is_anthropic_passthrough BOOLEAN NOT NULL DEFAULT FALSE, -- PB-007
  -- 결제 정보
  status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','settled','declined','refunded','reversed')),
  currency                 TEXT NOT NULL DEFAULT 'KRW',
  exchange_rate            NUMERIC(12,6),
  amount_usd               NUMERIC(12,4),
  decline_reason           TEXT,
  merchant_name            TEXT,
  billing_month            CHAR(7),                     -- 'YYYY-MM'
  transacted_at            TIMESTAMPTZ NOT NULL,
  settled_at               TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
  -- updated_at 없음 — Immutable (PB-005)
);

-- Immutable: UPDATE / DELETE 금지 (PB-005)
CREATE RULE transactions_no_update AS ON UPDATE TO billing.transactions DO INSTEAD NOTHING;
CREATE RULE transactions_no_delete AS ON DELETE TO billing.transactions DO INSTEAD NOTHING;

-- 회계 분리 검증 트리거 (PB-009)
CREATE OR REPLACE FUNCTION billing.enforce_accounting_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- customer_charge = gridge_cost + margin
  IF NEW.customer_charge_krw != NEW.gridge_cost_krw + NEW.gridge_margin_krw THEN
    RAISE EXCEPTION '회계 분리 오류: customer_charge(%) != gridge_cost(%) + margin(%)',
      NEW.customer_charge_krw, NEW.gridge_cost_krw, NEW.gridge_margin_krw;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_accounting
  BEFORE INSERT ON billing.transactions
  FOR EACH ROW EXECUTE FUNCTION billing.enforce_accounting_fields();

-- ============================================================
-- 9. invoices — 청구서 (Immutable 발행 후)
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.invoices (
  idx                        BIGSERIAL PRIMARY KEY,
  id                         UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id                     UUID NOT NULL REFERENCES billing.orgs(id),
  billing_month              CHAR(7) NOT NULL,           -- 'YYYY-MM'
  status                     TEXT NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft','issued','paid','overdue','cancelled')),
  -- 3단계 금액 breakdown (PB-003)
  subtotal_before_creditback BIGINT NOT NULL DEFAULT 0,
  credit_amount              BIGINT NOT NULL DEFAULT 0,
  subtotal_krw               BIGINT NOT NULL DEFAULT 0,
  vat_krw                    BIGINT NOT NULL DEFAULT 0,
  total_due_krw              BIGINT NOT NULL DEFAULT 0,
  -- 세금계산서
  tax_invoice_id             TEXT,                       -- Smart Bill 거래번호
  tax_invoice_issued_at      TIMESTAMPTZ,
  -- 고액 승인 (PRD F3.3: ≥ ₩10M)
  requires_super_approval    BOOLEAN NOT NULL DEFAULT FALSE,
  super_approved_at          TIMESTAMPTZ,
  super_approved_by          UUID REFERENCES billing.admin_users(id),
  due_date                   DATE,
  paid_at                    TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  UNIQUE (org_id, billing_month)
);

-- ============================================================
-- 10. credit_backs — 크레딧백 원장 (PB-004, Immutable)
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.credit_backs (
  idx                BIGSERIAL PRIMARY KEY,
  id                 UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id             UUID NOT NULL REFERENCES billing.orgs(id),
  invoice_id         UUID NOT NULL REFERENCES billing.invoices(id),
  billing_month      CHAR(7) NOT NULL,
  month_seq          INT NOT NULL CHECK (month_seq BETWEEN 1 AND 6),  -- M1~M6
  base_amount_krw    BIGINT NOT NULL,                    -- 크레딧백 산정 기준
  credit_amount_krw  BIGINT NOT NULL,                    -- 실제 크레딧백 금액
  is_final           BOOLEAN NOT NULL DEFAULT FALSE,     -- M6 final 플래그
  applied_at         TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  UNIQUE (org_id, billing_month)
);

CREATE RULE credit_backs_no_update AS ON UPDATE TO billing.credit_backs DO INSTEAD NOTHING;
CREATE RULE credit_backs_no_delete AS ON DELETE TO billing.credit_backs DO INSTEAD NOTHING;

-- ============================================================
-- 11. audit_logs — 감사 로그 (PB-005, Immutable)
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.audit_logs (
  idx          BIGSERIAL PRIMARY KEY,
  id           UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id       UUID,                                     -- 해지 후에도 NULL 아님
  actor_type   TEXT NOT NULL CHECK (actor_type IN ('member','admin','system')),
  actor_id     UUID NOT NULL,
  actor_email  TEXT,
  action       TEXT NOT NULL,                            -- 'member_invited', 'vcn_issued', ...
  target_type  TEXT,                                     -- 'member', 'virtual_card', 'invoice', ...
  target_id    UUID,
  visibility   TEXT NOT NULL DEFAULT 'both'
                 CHECK (visibility IN ('customer_only','internal_only','both')),
  detail       JSONB NOT NULL DEFAULT '{}',
  ip_address   INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

-- Immutable (PB-005)
CREATE RULE audit_logs_no_update AS ON UPDATE TO billing.audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO billing.audit_logs DO INSTEAD NOTHING;

-- ============================================================
-- 12. action_requests — 요청 워크플로 (5유형 + bulk_terminate)
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.action_requests (
  idx              BIGSERIAL PRIMARY KEY,
  id               UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id           UUID NOT NULL REFERENCES billing.orgs(id),
  requester_id     UUID REFERENCES billing.members(id),
  action_type      TEXT NOT NULL
                     CHECK (action_type IN (
                       'new_account','terminate','limit_change',
                       'vcn_replace','decline_response','bulk_terminate'
                     )),
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN (
                       'pending','in_review','awaiting_customer',
                       'approved','rejected','completed','cancelled'
                     )),
  -- 경로 (PB-008 Fast/Full Path)
  path_type        TEXT CHECK (path_type IN ('fast','full')),
  -- 대상
  account_id       UUID REFERENCES billing.accounts(id),
  member_id        UUID REFERENCES billing.members(id),
  -- 처리 진행 상태 (JSONB)
  progress_state   JSONB NOT NULL DEFAULT '{}',
  -- 요청 내용
  request_data     JSONB NOT NULL DEFAULT '{}',
  -- 담당 AM
  assigned_to      UUID REFERENCES billing.admin_users(id),
  -- SLA
  sla_deadline     TIMESTAMPTZ,
  -- 부모 (bulk_terminate의 자식)
  parent_id        UUID REFERENCES billing.action_requests(id),
  -- 완료
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID REFERENCES billing.admin_users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION billing.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = billing.now_utc();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orgs_updated_at          BEFORE UPDATE ON billing.orgs           FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
CREATE TRIGGER trg_members_updated_at       BEFORE UPDATE ON billing.members        FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
CREATE TRIGGER trg_admin_users_updated_at   BEFORE UPDATE ON billing.admin_users    FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
CREATE TRIGGER trg_org_contracts_updated_at BEFORE UPDATE ON billing.org_contracts  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
CREATE TRIGGER trg_services_updated_at      BEFORE UPDATE ON billing.services       FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
CREATE TRIGGER trg_accounts_updated_at      BEFORE UPDATE ON billing.accounts       FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
CREATE TRIGGER trg_vcn_updated_at           BEFORE UPDATE ON billing.virtual_cards  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
CREATE TRIGGER trg_invoices_updated_at      BEFORE UPDATE ON billing.invoices       FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
CREATE TRIGGER trg_action_req_updated_at    BEFORE UPDATE ON billing.action_requests FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
