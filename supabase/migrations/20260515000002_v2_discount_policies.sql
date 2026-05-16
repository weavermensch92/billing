-- ============================================================
-- Gridge Billing MSP v2.0 — M-1002 discount_policies
-- Org별 할인율 + 6개월 할인기간 + 갱신 이력
-- 의존: M-1001 wallet_charges, billing.orgs, billing.admin_users
-- ============================================================

-- ─── 1. discount_policies — Org별 할인 정책 이력 ──────────
-- 첫 wallet_charge가 active로 전이될 때 자동 생성 (period_start_at = 그 시점)
-- 슈퍼어드민이 6개월 종료 전 갱신 시 새 row 생성 (parent_policy_id 연결)
CREATE TABLE IF NOT EXISTS billing.discount_policies (
  idx               BIGSERIAL PRIMARY KEY,
  id                UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id            UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,

  discount_rate     NUMERIC(5,4) NOT NULL DEFAULT 0.1000   -- 0.1000 = 10%
                      CHECK (discount_rate >= 0 AND discount_rate <= 1),
  -- 기간
  period_start_at   TIMESTAMPTZ NOT NULL,
  period_end_at     TIMESTAMPTZ NOT NULL,
  -- 디폴트 6개월. 갱신 시 슈퍼어드민이 다른 기간 지정 가능 (예: 12개월)
  period_months     INT NOT NULL DEFAULT 6
                      CHECK (period_months > 0 AND period_months <= 60),

  CONSTRAINT period_consistent
    CHECK (period_end_at > period_start_at),

  -- 갱신 이력
  is_renewal        BOOLEAN NOT NULL DEFAULT FALSE,
  parent_policy_id  UUID REFERENCES billing.discount_policies(id),
  -- 종료 사유
  ended_early_at    TIMESTAMPTZ,             -- 갱신·해지로 조기 종료된 경우
  ended_early_by    UUID REFERENCES billing.admin_users(id),
  ended_early_reason TEXT,

  created_by        UUID REFERENCES billing.admin_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

CREATE INDEX idx_discount_policies_org_active
  ON billing.discount_policies(org_id, period_end_at DESC)
  WHERE ended_early_at IS NULL;

CREATE INDEX idx_discount_policies_renewal_chain
  ON billing.discount_policies(parent_policy_id)
  WHERE parent_policy_id IS NOT NULL;

-- 동시에 active 정책 1개만 — partial unique
CREATE UNIQUE INDEX uniq_discount_policy_active_per_org
  ON billing.discount_policies(org_id)
  WHERE ended_early_at IS NULL;

COMMENT ON TABLE billing.discount_policies IS
  'Org별 할인 정책. 첫 wallet_charge active 시 자동 생성. 갱신 시 새 row + parent_policy_id 연결.';


-- ─── 2. v_org_active_discount — 내부용 (모든 정책, 0% 포함) ─
-- Q-V1: period_end_at은 "검토 알림 기준일". 자동 만료 X.
-- 슈퍼어드민이 명시적으로 변경(renew_discount_policy)할 때까지 같은 정책 유지.
CREATE OR REPLACE VIEW billing.v_org_active_discount
WITH (security_invoker = true) AS
SELECT
  dp.org_id,
  dp.id            AS policy_id,
  dp.discount_rate,
  dp.period_start_at,
  dp.period_end_at,
  EXTRACT(DAY FROM (dp.period_end_at - billing.now_utc()))::INT AS days_until_review,  -- 음수 가능 (이미 지남)
  dp.is_renewal,
  dp.parent_policy_id
FROM billing.discount_policies dp
WHERE dp.ended_early_at IS NULL;

COMMENT ON VIEW billing.v_org_active_discount IS
  '내부용: 모든 활성 정책(0% 포함). period_end_at은 검토 알림 기준일일 뿐 자동 만료 안 함.';

-- ─── 2-2. v_org_visible_discount — 고객 노출용 (rate > 0만) ─
-- Q-V3: 0% 정책 row는 만들되, 0%일 때는 고객 화면에 노출하지 않음
CREATE OR REPLACE VIEW billing.v_org_visible_discount
WITH (security_invoker = true) AS
SELECT
  dp.org_id,
  dp.id            AS policy_id,
  dp.discount_rate,
  dp.period_start_at,
  dp.period_end_at,
  EXTRACT(DAY FROM (dp.period_end_at - billing.now_utc()))::INT AS days_until_review,
  dp.is_renewal,
  dp.parent_policy_id
FROM billing.discount_policies dp
WHERE dp.ended_early_at IS NULL
  AND dp.discount_rate > 0;

COMMENT ON VIEW billing.v_org_visible_discount IS
  '고객 노출용: rate > 0 인 정책만. 0% 무할인 Org는 행 없음 → UI에서 할인 섹션 숨김.';


-- ─── 3. start_discount_period — accounts 첫 active 트리거 함수 ─
-- Q-V2 A: "첫 계정 연동일" = accounts.status가 처음 'active'로 전이된 시점
-- Org당 1회만 정책 자동 생성. 이미 정책 있으면 skip.
-- Q-V3 A: 0% 정책도 row 생성 (이력 추적용). 노출은 v_org_visible_discount에서 분기.
CREATE OR REPLACE FUNCTION billing.start_discount_period_on_first_account_active()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_policy_id UUID;
  v_org_default_rate   NUMERIC(5,4);
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status <> 'active') THEN
    -- 이미 active 정책 있으면 skip (Org당 1회)
    SELECT id INTO v_existing_policy_id
      FROM billing.discount_policies
      WHERE org_id = NEW.org_id
        AND ended_early_at IS NULL
      LIMIT 1;

    IF v_existing_policy_id IS NULL THEN
      SELECT default_discount_rate INTO v_org_default_rate
        FROM billing.orgs
        WHERE id = NEW.org_id;

      v_org_default_rate := COALESCE(v_org_default_rate, 0.1000);

      INSERT INTO billing.discount_policies (
        org_id, discount_rate, period_start_at, period_end_at, period_months,
        is_renewal
      ) VALUES (
        NEW.org_id,
        v_org_default_rate,
        billing.now_utc(),
        billing.now_utc() + INTERVAL '6 months',
        6,
        FALSE
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_account_first_active_start_discount
  AFTER INSERT OR UPDATE OF status ON billing.accounts
  FOR EACH ROW EXECUTE FUNCTION billing.start_discount_period_on_first_account_active();

COMMENT ON FUNCTION billing.start_discount_period_on_first_account_active IS
  'Org의 첫 account active 전이 시 6개월 할인 정책 자동 INSERT. 이미 정책 있으면 skip.';


-- ─── 4. renew_discount_policy — 슈퍼어드민 갱신 함수 ──────
CREATE OR REPLACE FUNCTION billing.renew_discount_policy(
  p_org_id        UUID,
  p_new_rate      NUMERIC(5,4),
  p_new_months    INT DEFAULT 6,
  p_super_id      UUID,
  p_reason        TEXT DEFAULT 'period_renewal'
) RETURNS UUID AS $$
DECLARE
  v_current_id  UUID;
  v_new_id      UUID;
  v_now         TIMESTAMPTZ := billing.now_utc();
BEGIN
  IF p_new_rate < 0 OR p_new_rate > 1 THEN
    RAISE EXCEPTION 'discount_rate must be 0~1 (got %)', p_new_rate;
  END IF;
  IF p_new_months <= 0 OR p_new_months > 60 THEN
    RAISE EXCEPTION 'period_months must be 1~60 (got %)', p_new_months;
  END IF;

  -- 기존 active 정책 조기 종료
  UPDATE billing.discount_policies
    SET ended_early_at = v_now,
        ended_early_by = p_super_id,
        ended_early_reason = p_reason,
        updated_at = v_now
    WHERE org_id = p_org_id
      AND ended_early_at IS NULL
      AND period_end_at > v_now
    RETURNING id INTO v_current_id;

  -- 새 정책 INSERT
  INSERT INTO billing.discount_policies (
    org_id, discount_rate,
    period_start_at, period_end_at, period_months,
    is_renewal, parent_policy_id, created_by
  ) VALUES (
    p_org_id, p_new_rate,
    v_now, v_now + (p_new_months || ' months')::INTERVAL, p_new_months,
    TRUE, v_current_id, p_super_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.renew_discount_policy IS
  '슈퍼어드민이 할인 정책 갱신. 기존 active 조기 종료 + 새 정책 생성.';


-- ─── 5. orgs 컬럼 추가 (디폴트 할인율·결제일·잔액 만료) ───
ALTER TABLE billing.orgs
  ADD COLUMN IF NOT EXISTS default_discount_rate   NUMERIC(5,4) NOT NULL DEFAULT 0.1000
    CHECK (default_discount_rate >= 0 AND default_discount_rate <= 1),
  ADD COLUMN IF NOT EXISTS billing_day_of_month    INT NOT NULL DEFAULT 1
    CHECK (billing_day_of_month BETWEEN 1 AND 28),  -- 29~31은 월말 처리 복잡, 28로 cap
  ADD COLUMN IF NOT EXISTS wallet_default_validity_months INT NOT NULL DEFAULT 12
    CHECK (wallet_default_validity_months > 0 AND wallet_default_validity_months <= 60);

COMMENT ON COLUMN billing.orgs.default_discount_rate IS
  '신규 wallet_charge 발행 시 적용할 디폴트 할인율 스냅샷. 슈퍼어드민이 Org별 지정.';
COMMENT ON COLUMN billing.orgs.billing_day_of_month IS
  'Org별 결제일 (헤드룸 리셋·익월 청구 기준일). 1~28.';
COMMENT ON COLUMN billing.orgs.wallet_default_validity_months IS
  'wallet_charge 디폴트 만료 기간 (월). Org별 수정 가능.';


-- ─── 6. RLS 정책 ──────────────────────────────────────────
ALTER TABLE billing.discount_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY discount_policies_org_read ON billing.discount_policies
  FOR SELECT USING (org_id = billing.my_org_id());

CREATE POLICY discount_policies_admin_all ON billing.discount_policies
  FOR ALL USING (billing.is_admin_user());

CREATE TRIGGER trg_discount_policies_updated_at
  BEFORE UPDATE ON billing.discount_policies
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
