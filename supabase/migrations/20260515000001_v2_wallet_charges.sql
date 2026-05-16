-- ============================================================
-- Gridge Billing MSP v2.0 — M-1001 wallet_charges
-- 충전 선금 잔액 + Immutable Ledger
-- 의존: billing.orgs (P1), billing.admin_users (P1)
-- ============================================================

-- ─── 1. wallet_charges — 충전 1건 = 1 row ──────────────────
CREATE TABLE IF NOT EXISTS billing.wallet_charges (
  idx                BIGSERIAL PRIMARY KEY,
  id                 UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id             UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,

  -- 금액 (할인율은 발행 시점에 스냅샷 — 이후 정책이 바뀌어도 영향 없음)
  amount_krw_gross   BIGINT NOT NULL CHECK (amount_krw_gross > 0),  -- 고객 신청 금액
  discount_rate      NUMERIC(5,4) NOT NULL DEFAULT 0.0000           -- 0.1000 = 10%
                       CHECK (discount_rate >= 0 AND discount_rate <= 1),
  amount_krw_net     BIGINT NOT NULL                                -- 실제 입금액 = gross × (1-discount)
                       CHECK (amount_krw_net > 0),
  amount_krw_used    BIGINT NOT NULL DEFAULT 0 CHECK (amount_krw_used >= 0),

  -- 시간
  applied_at         TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),  -- 슈퍼어드민 컨펌·발행 시점
  expires_at         TIMESTAMPTZ NOT NULL,                            -- Org별 만료 (디폴트 +1년)

  -- 세금계산서·슬랙 연동
  slack_message_ts   TEXT,                                          -- billing.slack_messages.ts 매칭 (M-1009)
  tax_invoice_id     TEXT,                                          -- 세무 SaaS의 ID
  tax_invoice_issued_at TIMESTAMPTZ,

  -- 컨펌 추적
  confirmed_by       UUID REFERENCES billing.admin_users(id),       -- 슈퍼어드민
  confirmed_at       TIMESTAMPTZ,

  -- 환율 스냅샷 (고객 결제 시점 기준 USD→KRW. 환차는 그릿지 흡수)
  exchange_rate_at_charge NUMERIC(10,4),   -- 충전 시점 USD→KRW
  fx_source          TEXT,                 -- 'bok' | 'manual' | 'vendor_quote' 등
  fx_at              TIMESTAMPTZ,          -- 환율 결정 시각

  -- 상태 (FIFO 소진용)
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN (
                         'pending',     -- 신청, 컨펌 대기
                         'active',      -- 컨펌됨, 차감 대상
                         'exhausted',   -- 소진 완료 (used == net)
                         'expired',     -- 만료 (used < net 인 상태로 만료일 도달)
                         'refunded',    -- 환불 (해지 케이스)
                         'rejected'     -- 슈퍼어드민 거절
                       )),

  -- 회계 정합 (gross = net + discount_amount)
  CONSTRAINT wallet_amount_consistent
    CHECK (amount_krw_net = amount_krw_gross - ROUND(amount_krw_gross * discount_rate)),
  CONSTRAINT wallet_used_lte_net
    CHECK (amount_krw_used <= amount_krw_net),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

CREATE INDEX idx_wallet_charges_org_status
  ON billing.wallet_charges(org_id, status, expires_at);

CREATE INDEX idx_wallet_charges_org_active_fifo
  ON billing.wallet_charges(org_id, expires_at, applied_at)
  WHERE status = 'active';

COMMENT ON TABLE  billing.wallet_charges IS '선결제 충전 이력. status=active 만 잔액 산정 대상. FIFO(expires_at, applied_at) 순 소진.';
COMMENT ON COLUMN billing.wallet_charges.discount_rate IS '발행 시점 할인율 스냅샷. 정책 변경 영향 없음.';
COMMENT ON COLUMN billing.wallet_charges.amount_krw_net IS '실제 고객 입금액. 세금계산서 발행액 = net.';


-- ─── 2. wallet_ledger — Immutable 차감/환불 이력 ──────────
-- 모든 충전·차감·환불을 역기록 방식으로 기록. UPDATE/DELETE 차단.
CREATE TABLE IF NOT EXISTS billing.wallet_ledger (
  idx               BIGSERIAL PRIMARY KEY,
  id                UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id            UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,
  charge_id         UUID NOT NULL REFERENCES billing.wallet_charges(id) ON DELETE RESTRICT,

  -- 양수: 충전·환원 / 음수: 차감
  delta_krw         BIGINT NOT NULL CHECK (delta_krw <> 0),
  reason            TEXT NOT NULL CHECK (reason IN (
                      'initial_charge',     -- 최초 active 전이
                      'usage_consumption',  -- 사용량 차감
                      'reversal',           -- 역기록 (잘못된 차감 정정)
                      'expiry_writeoff',    -- 만료 처리 (잔여 손실)
                      'refund'              -- 해지 환불
                    )),
  related_vendor_invoice_id UUID,           -- M-1003 vendor_invoices.id (있다면)
  related_transaction_id    UUID,           -- billing.transactions.id (P1 — 카드 거래)
  detail            JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  created_by        UUID                    -- admin_users.id (system이면 NULL)
);

CREATE INDEX idx_wallet_ledger_org_created
  ON billing.wallet_ledger(org_id, created_at DESC);
CREATE INDEX idx_wallet_ledger_charge
  ON billing.wallet_ledger(charge_id, created_at);

-- Immutable: UPDATE/DELETE 차단
CREATE OR REPLACE FUNCTION billing.prevent_wallet_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'wallet_ledger is immutable. Use reversal entry instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wallet_ledger_no_update
  BEFORE UPDATE ON billing.wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION billing.prevent_wallet_ledger_mutation();

CREATE TRIGGER trg_wallet_ledger_no_delete
  BEFORE DELETE ON billing.wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION billing.prevent_wallet_ledger_mutation();


-- ─── 3. consume_wallet — 원자 FIFO 차감 ───────────────────
-- 만료가 빠른 active charge 부터 차감. 잔액 부족 시 부분 차감 없이 FALSE.
-- 호출자가 FALSE 받으면 headroom 으로 fallback.
CREATE OR REPLACE FUNCTION billing.consume_wallet(
  p_org_id            UUID,
  p_amount_krw        BIGINT,
  p_reason            TEXT DEFAULT 'usage_consumption',
  p_vendor_invoice_id UUID DEFAULT NULL,
  p_transaction_id    UUID DEFAULT NULL,
  p_detail            JSONB DEFAULT '{}'::jsonb
) RETURNS TABLE (success BOOLEAN, consumed_krw BIGINT, remaining_krw BIGINT) AS $$
DECLARE
  v_total_remaining BIGINT;
  v_charge_id       UUID;
  v_charge_avail    BIGINT;
  v_take            BIGINT;
  v_left            BIGINT := p_amount_krw;
BEGIN
  IF p_amount_krw <= 0 THEN
    RAISE EXCEPTION 'amount must be positive (got %)', p_amount_krw;
  END IF;

  -- 잔액 사전 체크 (락 없이)
  SELECT COALESCE(SUM(amount_krw_net - amount_krw_used), 0)
    INTO v_total_remaining
    FROM billing.wallet_charges
    WHERE org_id = p_org_id AND status = 'active';

  IF v_total_remaining < p_amount_krw THEN
    RETURN QUERY SELECT FALSE, 0::BIGINT, v_total_remaining;
    RETURN;
  END IF;

  -- FIFO 차감: 만료 빠른 순 → applied_at 빠른 순
  FOR v_charge_id, v_charge_avail IN
    SELECT id, (amount_krw_net - amount_krw_used)
      FROM billing.wallet_charges
      WHERE org_id = p_org_id
        AND status = 'active'
        AND amount_krw_net > amount_krw_used
      ORDER BY expires_at ASC, applied_at ASC
      FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_charge_avail, v_left);

    UPDATE billing.wallet_charges
      SET amount_krw_used = amount_krw_used + v_take,
          status = CASE WHEN amount_krw_used + v_take = amount_krw_net THEN 'exhausted' ELSE status END,
          updated_at = billing.now_utc()
      WHERE id = v_charge_id;

    INSERT INTO billing.wallet_ledger (
      org_id, charge_id, delta_krw, reason,
      related_vendor_invoice_id, related_transaction_id, detail
    ) VALUES (
      p_org_id, v_charge_id, -v_take, p_reason,
      p_vendor_invoice_id, p_transaction_id, p_detail
    );

    v_left := v_left - v_take;
  END LOOP;

  RETURN QUERY SELECT TRUE, p_amount_krw, (v_total_remaining - p_amount_krw);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.consume_wallet IS
  'FIFO 잔액 차감. 잔액 부족 시 (FALSE, 0, remaining) 반환. 부분 차감 없음.';


-- ─── 4. v_org_wallet_balance — 잔액 뷰 (security_invoker) ─
CREATE OR REPLACE VIEW billing.v_org_wallet_balance
WITH (security_invoker = true) AS
SELECT
  o.id AS org_id,
  COALESCE(SUM(wc.amount_krw_net - wc.amount_krw_used) FILTER (WHERE wc.status = 'active'), 0) AS remaining_krw,
  COUNT(*)             FILTER (WHERE wc.status = 'active') AS active_charges_count,
  MIN(wc.expires_at)   FILTER (WHERE wc.status = 'active') AS next_expiring_at,
  MAX(wc.applied_at)   FILTER (WHERE wc.status = 'active') AS last_charge_at
FROM billing.orgs o
LEFT JOIN billing.wallet_charges wc ON wc.org_id = o.id
GROUP BY o.id;

COMMENT ON VIEW billing.v_org_wallet_balance IS
  'Org 잔액 요약. status=active 충전만 합산. security_invoker로 RLS 적용.';


-- ─── 5. RLS 정책 ──────────────────────────────────────────
ALTER TABLE billing.wallet_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.wallet_ledger  ENABLE ROW LEVEL SECURITY;

-- 고객: 자기 Org 잔액만
CREATE POLICY wallet_charges_org_read ON billing.wallet_charges
  FOR SELECT USING (org_id = billing.my_org_id());

-- 슈퍼어드민: 전체
CREATE POLICY wallet_charges_admin_all ON billing.wallet_charges
  FOR ALL USING (billing.is_admin_user());

CREATE POLICY wallet_ledger_org_read ON billing.wallet_ledger
  FOR SELECT USING (org_id = billing.my_org_id());

CREATE POLICY wallet_ledger_admin_read ON billing.wallet_ledger
  FOR SELECT USING (billing.is_admin_user());
-- ledger 는 INSERT만 (트리거가 함수 안에서). UPDATE/DELETE는 위에서 차단.

-- updated_at 트리거 (기존 패턴)
CREATE TRIGGER trg_wallet_charges_updated_at
  BEFORE UPDATE ON billing.wallet_charges
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();


-- ─── 6. wallet_charge status 전이 자동 (discount_policy 시작 트리거 훅) ───
-- pending → active 로 전이 시 M-1002의 start_discount_period 트리거 함수가 호출됨
-- (M-1002에서 이 테이블에 BEFORE UPDATE 트리거 추가)
-- v2 변경: 시작 트리거는 accounts.status = 'active' 첫 전이로 이동 (Q-V2 A)


-- ─── 6-2. expires_at 자동 계산 (BEFORE INSERT) ───────────
-- expires_at NULL이면 orgs.wallet_default_validity_months 기준으로 자동 채움
CREATE OR REPLACE FUNCTION billing.auto_fill_wallet_expires_at()
RETURNS TRIGGER AS $$
DECLARE
  v_months INT;
BEGIN
  IF NEW.expires_at IS NULL THEN
    SELECT wallet_default_validity_months
      INTO v_months
      FROM billing.orgs
      WHERE id = NEW.org_id;

    IF v_months IS NULL THEN
      v_months := 12;  -- 안전 디폴트 (orgs row 없을 가능성은 거의 없지만 방어)
    END IF;

    NEW.expires_at := COALESCE(NEW.applied_at, billing.now_utc()) + (v_months || ' months')::INTERVAL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_wallet_charges_auto_expires_at
  BEFORE INSERT ON billing.wallet_charges
  FOR EACH ROW EXECUTE FUNCTION billing.auto_fill_wallet_expires_at();

COMMENT ON FUNCTION billing.auto_fill_wallet_expires_at IS
  'INSERT 시 expires_at NULL이면 orgs.wallet_default_validity_months 기준 자동 채움.';


-- ─── 7. 만료 처리 배치 함수 ──────────────────────────────
CREATE OR REPLACE FUNCTION billing.expire_wallet_charges()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  WITH expired AS (
    UPDATE billing.wallet_charges
      SET status = 'expired', updated_at = billing.now_utc()
      WHERE status = 'active'
        AND expires_at <= billing.now_utc()
        AND amount_krw_net > amount_krw_used  -- 잔여분 있는 것만 expired (없으면 이미 exhausted)
      RETURNING id, org_id, (amount_krw_net - amount_krw_used) AS writeoff_krw
  )
  INSERT INTO billing.wallet_ledger (org_id, charge_id, delta_krw, reason, detail)
  SELECT org_id, id, -writeoff_krw, 'expiry_writeoff',
         jsonb_build_object('writeoff_krw', writeoff_krw)
    FROM expired;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.expire_wallet_charges IS
  '만료 도달한 active 충전을 expired로 전이 + ledger 역기록. pg_cron 매일 호출.';
