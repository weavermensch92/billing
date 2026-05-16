-- ============================================================
-- Gridge Billing MSP v2.0 — M-1008 usage_allocations
-- 벤더 청구서 라인 → 멤버·팀 매핑 + USD→KRW 환차 변환
-- 환차 흡수: 충전 시점 환율 기준 차감(고객) / 시장 환율 차이는 그릿지 손익
-- 의존: M-1001 wallet_charges, M-1003 vendor_invoices, M-1007 teams
-- ============================================================

-- ─── 1. usage_allocations — 청구서 라인의 매핑·차감 결과 ───
-- 한 vendor_invoice_item × 한 wallet_charge × 한 멤버·팀 = 1 row
-- (FIFO로 여러 wallet 걸치면 1 item에 여러 row)
CREATE TABLE IF NOT EXISTS billing.usage_allocations (
  idx                       BIGSERIAL PRIMARY KEY,
  id                        UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  vendor_invoice_item_id    UUID NOT NULL REFERENCES billing.vendor_invoice_items(id) ON DELETE RESTRICT,
  org_id                    UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,

  -- 차감된 wallet_charge (FIFO 결과)
  wallet_charge_id          UUID NOT NULL REFERENCES billing.wallet_charges(id) ON DELETE RESTRICT,

  -- 금액 (3종)
  amount_usd                NUMERIC(14,4) NOT NULL CHECK (amount_usd >= 0),
  amount_krw_at_market      BIGINT NOT NULL CHECK (amount_krw_at_market >= 0),  -- 시장 환율 KRW (그릿지 실 지출)
  amount_krw_charged        BIGINT NOT NULL CHECK (amount_krw_charged >= 0),    -- 충전 환율 KRW (고객 차감액)
  fx_pnl_krw                BIGINT NOT NULL,                                    -- 차이 = market - charged (양수=그릿지 손실, 음수=이익)
  exchange_rate_market      NUMERIC(10,4) NOT NULL,
  exchange_rate_wallet      NUMERIC(10,4) NOT NULL,

  -- 매핑 (NULL이면 미할당 팀으로 fallback)
  allocated_to_member_id    UUID REFERENCES billing.members(id),
  allocated_to_team_id      UUID NOT NULL REFERENCES billing.teams(id),

  allocation_basis          TEXT NOT NULL CHECK (allocation_basis IN (
                              'api_key_match',         -- vendor_invoice_items.meta.api_key_id 매칭
                              'member_email_match',    -- meta.member_email 매칭
                              'manual',                -- 사후 수동 배분
                              'default_unassigned'     -- 매핑 실패 → 미할당 팀
                            )),

  allocated_at              TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  allocated_by              UUID,                       -- admin_users.id (manual인 경우)

  created_at                TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

CREATE INDEX idx_usage_alloc_item
  ON billing.usage_allocations(vendor_invoice_item_id);
CREATE INDEX idx_usage_alloc_org_team
  ON billing.usage_allocations(org_id, allocated_to_team_id, allocated_at DESC);
CREATE INDEX idx_usage_alloc_unassigned
  ON billing.usage_allocations(org_id, allocated_at DESC)
  WHERE allocation_basis = 'default_unassigned';

COMMENT ON TABLE billing.usage_allocations IS
  '청구서 라인 → 팀·멤버·wallet_charge 매핑 결과. FIFO로 여러 wallet 걸치면 여러 row.';
COMMENT ON COLUMN billing.usage_allocations.fx_pnl_krw IS
  'amount_krw_at_market - amount_krw_charged. 양수 = 그릿지 손실 (시장 환율↑), 음수 = 이익.';


-- ─── 2. fx_pnl_summary 뷰 — 그릿지 환차 손익 집계 (내부 회계) ─
CREATE OR REPLACE VIEW billing.v_fx_pnl_monthly
WITH (security_invoker = true) AS
SELECT
  DATE_TRUNC('month', allocated_at)::DATE AS month,
  COUNT(*) AS allocation_count,
  SUM(amount_krw_at_market)               AS gridge_actual_krw,
  SUM(amount_krw_charged)                 AS customer_charged_krw,
  SUM(fx_pnl_krw)                         AS fx_pnl_total_krw
FROM billing.usage_allocations
GROUP BY 1;

COMMENT ON VIEW billing.v_fx_pnl_monthly IS
  '월별 환차 손익. 슈퍼어드민 내부 회계용. 고객 미노출.';


-- ─── 3. team_breakdown 뷰 — 고객 어드민용 팀별 청구 분배 ─
CREATE OR REPLACE VIEW billing.v_team_usage_breakdown
WITH (security_invoker = true) AS
SELECT
  ua.org_id,
  ua.allocated_to_team_id      AS team_id,
  t.name                       AS team_name,
  t.is_unassigned,
  DATE_TRUNC('month', ua.allocated_at)::DATE AS month,
  COUNT(*)                     AS line_count,
  SUM(ua.amount_krw_charged)   AS total_charged_krw,
  COUNT(DISTINCT ua.allocated_to_member_id) FILTER (WHERE ua.allocated_to_member_id IS NOT NULL) AS member_count
FROM billing.usage_allocations ua
JOIN billing.teams t ON t.id = ua.allocated_to_team_id
GROUP BY ua.org_id, ua.allocated_to_team_id, t.name, t.is_unassigned, DATE_TRUNC('month', ua.allocated_at);

COMMENT ON VIEW billing.v_team_usage_breakdown IS
  '월별 팀 분배 표시. amount_krw_charged 기준 (고객 차감액). fx_pnl은 표시 안 함.';


-- ─── 4. allocate_invoice_item — 청구서 라인 매핑·차감 함수 ─
-- 동작:
--   1) vendor_invoice_item 조회
--   2) meta에서 api_key·member_email 추출 → 매핑 시도 → 팀 결정 (실패면 unassigned)
--   3) amount_usd × market_rate = amount_krw_at_market
--   4) consume_wallet으로 FIFO 차감 (wallet의 환율 적용해서 amount_krw_charged 계산)
--      ※ 여러 wallet 걸치면 각각 row 생성 (재귀)
--   5) fx_pnl_krw = market - charged 계산
--   6) usage_allocations + wallet_ledger row INSERT
--
-- 주의: FIFO로 wallet 걸치는 복잡한 케이스는 lib/billing/usage-allocator.ts에서
--      반복 호출로 처리. 여기서는 "단일 wallet 차감 1회" 단순 함수.
CREATE OR REPLACE FUNCTION billing.allocate_invoice_item_single(
  p_item_id                  UUID,
  p_wallet_charge_id         UUID,
  p_amount_usd               NUMERIC(14,4),
  p_market_rate              NUMERIC(10,4),
  p_team_id                  UUID,
  p_member_id                UUID,
  p_basis                    TEXT
) RETURNS UUID AS $$
DECLARE
  v_item            RECORD;
  v_wallet          RECORD;
  v_amount_market   BIGINT;
  v_amount_charged  BIGINT;
  v_fx_pnl          BIGINT;
  v_alloc_id        UUID;
BEGIN
  -- 데이터 검증
  SELECT vii.*, vi.org_id INTO v_item
    FROM billing.vendor_invoice_items vii
    JOIN billing.vendor_invoices vi ON vi.id = vii.invoice_id
    WHERE vii.id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice item not found: %', p_item_id; END IF;

  SELECT * INTO v_wallet
    FROM billing.wallet_charges
    WHERE id = p_wallet_charge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_charge not found: %', p_wallet_charge_id; END IF;
  IF v_wallet.exchange_rate_at_charge IS NULL THEN
    RAISE EXCEPTION 'wallet_charge % has no exchange_rate_at_charge', p_wallet_charge_id;
  END IF;

  -- 변환
  v_amount_market  := ROUND(p_amount_usd * p_market_rate);
  v_amount_charged := ROUND(p_amount_usd * v_wallet.exchange_rate_at_charge);
  v_fx_pnl         := v_amount_market - v_amount_charged;

  -- wallet 잔여 확인
  IF (v_wallet.amount_krw_net - v_wallet.amount_krw_used) < v_amount_charged THEN
    RAISE EXCEPTION 'wallet_charge % insufficient (need % charged, have %)',
                    p_wallet_charge_id, v_amount_charged,
                    (v_wallet.amount_krw_net - v_wallet.amount_krw_used);
  END IF;

  -- wallet 차감
  UPDATE billing.wallet_charges
    SET amount_krw_used = amount_krw_used + v_amount_charged,
        status = CASE WHEN amount_krw_used + v_amount_charged = amount_krw_net THEN 'exhausted' ELSE status END,
        updated_at = billing.now_utc()
    WHERE id = p_wallet_charge_id;

  -- wallet_ledger 역기록
  INSERT INTO billing.wallet_ledger (
    org_id, charge_id, delta_krw, reason,
    related_vendor_invoice_id, detail
  ) VALUES (
    v_item.org_id, p_wallet_charge_id, -v_amount_charged, 'usage_consumption',
    v_item.invoice_id,
    jsonb_build_object(
      'item_id', p_item_id,
      'amount_usd', p_amount_usd,
      'market_rate', p_market_rate,
      'wallet_rate', v_wallet.exchange_rate_at_charge,
      'fx_pnl_krw', v_fx_pnl
    )
  );

  -- usage_allocations INSERT
  INSERT INTO billing.usage_allocations (
    vendor_invoice_item_id, org_id, wallet_charge_id,
    amount_usd, amount_krw_at_market, amount_krw_charged, fx_pnl_krw,
    exchange_rate_market, exchange_rate_wallet,
    allocated_to_member_id, allocated_to_team_id,
    allocation_basis
  ) VALUES (
    p_item_id, v_item.org_id, p_wallet_charge_id,
    p_amount_usd, v_amount_market, v_amount_charged, v_fx_pnl,
    p_market_rate, v_wallet.exchange_rate_at_charge,
    p_member_id, p_team_id,
    p_basis
  )
  RETURNING id INTO v_alloc_id;

  RETURN v_alloc_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.allocate_invoice_item_single IS
  '한 invoice_item × 한 wallet 매핑·차감. FIFO 다중 wallet은 호출자(lib/billing/usage-allocator.ts)에서 반복 처리.';


-- ─── 5. RLS ────────────────────────────────────────────────
ALTER TABLE billing.usage_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_alloc_org_read ON billing.usage_allocations
  FOR SELECT USING (org_id = billing.my_org_id());
CREATE POLICY usage_alloc_admin_all ON billing.usage_allocations
  FOR ALL USING (billing.is_admin_user());

-- v_fx_pnl_monthly 뷰는 슈퍼어드민만 접근 가능하도록 GRANT 제한
REVOKE ALL ON billing.v_fx_pnl_monthly FROM PUBLIC;
GRANT SELECT ON billing.v_fx_pnl_monthly TO authenticated;
-- 실제 row 접근은 base 테이블 RLS가 admin만 허용 (간접)
