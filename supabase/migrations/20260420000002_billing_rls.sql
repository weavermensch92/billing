-- ============================================================
-- Gridge Billing MSP — RLS 정책 (G-052, G-144, PB-010)
-- ============================================================

-- RLS 활성화
ALTER TABLE billing.orgs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.admin_users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.org_contracts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.services        ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.virtual_cards   ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.invoices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.credit_backs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.audit_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.action_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 헬퍼 함수
-- ============================================================

-- 현재 멤버의 org_id 반환
CREATE OR REPLACE FUNCTION billing.my_org_id() RETURNS UUID AS $$
  SELECT org_id FROM billing.members
  WHERE user_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 현재 멤버의 role 반환
CREATE OR REPLACE FUNCTION billing.my_role() RETURNS TEXT AS $$
  SELECT role FROM billing.members
  WHERE user_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 현재 멤버의 id 반환
CREATE OR REPLACE FUNCTION billing.my_member_id() RETURNS UUID AS $$
  SELECT id FROM billing.members
  WHERE user_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Admin 유저 여부 (운영 콘솔용 — 별도 인증)
CREATE OR REPLACE FUNCTION billing.is_admin_user() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM billing.admin_users
    WHERE id::text = auth.uid()::text AND is_active = TRUE
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Admin role 반환
CREATE OR REPLACE FUNCTION billing.admin_role() RETURNS TEXT AS $$
  SELECT role FROM billing.admin_users
  WHERE id::text = auth.uid()::text AND is_active = TRUE
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- orgs — 본인 조직만 읽기
-- ============================================================
CREATE POLICY "members can read own org"
  ON billing.orgs FOR SELECT
  USING (id = billing.my_org_id());

CREATE POLICY "admin can read all orgs"
  ON billing.orgs FOR SELECT
  USING (billing.is_admin_user());

CREATE POLICY "super can manage orgs"
  ON billing.orgs FOR ALL
  USING (billing.admin_role() = 'super');

-- ============================================================
-- members — 같은 조직 멤버 읽기 / Owner+Admin 관리
-- ============================================================
CREATE POLICY "members can read own org members"
  ON billing.members FOR SELECT
  USING (org_id = billing.my_org_id());

CREATE POLICY "owner admin can manage members"
  ON billing.members FOR ALL
  USING (
    org_id = billing.my_org_id()
    AND billing.my_role() IN ('owner','admin')
  );

CREATE POLICY "admin can read all members"
  ON billing.members FOR SELECT
  USING (billing.is_admin_user());

-- ============================================================
-- admin_users — 운영 콘솔 전용 (고객 포털 미노출)
-- ============================================================
CREATE POLICY "admin can read admin_users"
  ON billing.admin_users FOR SELECT
  USING (billing.is_admin_user());

CREATE POLICY "super can manage admin_users"
  ON billing.admin_users FOR ALL
  USING (billing.admin_role() = 'super');

-- ============================================================
-- org_contracts — Owner + Admin 읽기
-- ============================================================
CREATE POLICY "owner admin can read contracts"
  ON billing.org_contracts FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND billing.my_role() IN ('owner','admin')
  );

CREATE POLICY "admin can read all contracts"
  ON billing.org_contracts FOR SELECT
  USING (billing.is_admin_user());

CREATE POLICY "super can manage contracts"
  ON billing.org_contracts FOR ALL
  USING (billing.admin_role() = 'super');

-- ============================================================
-- services — 승인된 서비스는 전체 멤버 읽기
-- ============================================================
CREATE POLICY "members can read approved services"
  ON billing.services FOR SELECT
  USING (
    billing.my_org_id() IS NOT NULL
    AND tos_review_status IN ('approved','conditional')
    AND is_active = TRUE
  );

CREATE POLICY "admin can read all services"
  ON billing.services FOR SELECT
  USING (billing.is_admin_user());

CREATE POLICY "super can manage services"
  ON billing.services FOR ALL
  USING (billing.admin_role() = 'super');

-- ============================================================
-- accounts — 멤버: 본인 계정 / Owner+Admin: 조직 전체
-- ============================================================
CREATE POLICY "member can read own accounts"
  ON billing.accounts FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND (
      billing.my_role() IN ('owner','admin')
      OR member_id = billing.my_member_id()
    )
  );

CREATE POLICY "admin can read all accounts"
  ON billing.accounts FOR SELECT
  USING (billing.is_admin_user());

-- ============================================================
-- virtual_cards — 카드 전체번호 미노출, 마스킹만 (PB-002-06)
-- ============================================================
CREATE POLICY "owner admin can read vcn"
  ON billing.virtual_cards FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND billing.my_role() IN ('owner','admin')
  );

CREATE POLICY "admin can read all vcn"
  ON billing.virtual_cards FOR SELECT
  USING (billing.is_admin_user());

-- ============================================================
-- transactions — 고객: gridge_cost/margin 필드 미노출은 View에서 처리
-- ============================================================
CREATE POLICY "owner admin can read org transactions"
  ON billing.transactions FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND billing.my_role() IN ('owner','admin')
  );

CREATE POLICY "admin can read all transactions"
  ON billing.transactions FOR SELECT
  USING (billing.is_admin_user());

-- ============================================================
-- invoices — Owner + Admin 읽기
-- ============================================================
CREATE POLICY "owner admin can read invoices"
  ON billing.invoices FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND billing.my_role() IN ('owner','admin')
  );

CREATE POLICY "admin can read all invoices"
  ON billing.invoices FOR SELECT
  USING (billing.is_admin_user());

-- ============================================================
-- credit_backs — Owner + Admin 읽기
-- ============================================================
CREATE POLICY "owner admin can read credit_backs"
  ON billing.credit_backs FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND billing.my_role() IN ('owner','admin')
  );

CREATE POLICY "admin can read all credit_backs"
  ON billing.credit_backs FOR SELECT
  USING (billing.is_admin_user());

-- ============================================================
-- audit_logs — 가시성 3분할 (PB-010)
-- ============================================================
CREATE POLICY "members can read customer-visible audit logs"
  ON billing.audit_logs FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND visibility IN ('customer_only','both')
  );

CREATE POLICY "admin can read internal audit logs"
  ON billing.audit_logs FOR SELECT
  USING (billing.is_admin_user());

-- ============================================================
-- action_requests — 멤버: 본인 요청 / Owner+Admin: 조직 전체
-- ============================================================
CREATE POLICY "member can read own requests"
  ON billing.action_requests FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND (
      billing.my_role() IN ('owner','admin')
      OR requester_id = billing.my_member_id()
    )
  );

CREATE POLICY "member can create requests"
  ON billing.action_requests FOR INSERT
  WITH CHECK (
    org_id = billing.my_org_id()
    AND requester_id = billing.my_member_id()
  );

CREATE POLICY "admin can manage all requests"
  ON billing.action_requests FOR ALL
  USING (billing.is_admin_user());

-- ============================================================
-- 고객용 View — gridge_cost / margin 숨김 (PB-009)
-- ============================================================
CREATE OR REPLACE VIEW billing.v_transaction_customer AS
SELECT
  id, org_id, account_id, virtual_card_id, service_id,
  customer_charge_krw AS amount_krw,
  status, currency, merchant_name, billing_month,
  transacted_at, settled_at, created_at
FROM billing.transactions;
