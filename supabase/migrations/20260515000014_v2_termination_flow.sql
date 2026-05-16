-- ============================================================
-- Gridge Billing MSP v2.0 — M-1011 Org 해지 흐름 (13.2)
-- B-i: 다음 결제일까지 grace / c: 그대로 운영
-- 환불은 별도 액션 (M-1010 process_refund_a3 활용)
-- 의존: M-1001~M-1009 + M-1010
-- ============================================================

-- ─── 1. orgs 해지 추적 컬럼 ───────────────────────────────
ALTER TABLE billing.orgs
  ADD COLUMN IF NOT EXISTS termination_requested_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS termination_grace_until    DATE,
  ADD COLUMN IF NOT EXISTS termination_requested_by   UUID,
  ADD COLUMN IF NOT EXISTS termination_reason         TEXT,
  ADD COLUMN IF NOT EXISTS terminated_at              TIMESTAMPTZ;

COMMENT ON COLUMN billing.orgs.termination_grace_until IS
  '해지 신청 후 grace 기간 종료일 (B-i: 다음 billing_day_of_month). 이 날짜 도래 시 finalize.';
COMMENT ON COLUMN billing.orgs.terminated_at IS
  '실제 종료 시각. NULL = 해지 신청 안 했거나 grace 중. NOT NULL = 정리 완료.';


-- ─── 2. request_termination — 해지 신청 ──────────────────
-- B-i: 다음 결제일까지 grace
-- 동작: 신규 충전·사용 차단 X (c — 그대로 운영). 정리만 결제일에.
CREATE OR REPLACE FUNCTION billing.request_termination(
  p_org_id        UUID,
  p_requested_by  UUID,                  -- members.id 또는 admin_users.id
  p_reason        TEXT DEFAULT NULL
) RETURNS DATE AS $$
DECLARE
  v_org              RECORD;
  v_today            DATE := billing.now_utc()::DATE;
  v_billing_day      INT;
  v_grace_until      DATE;
BEGIN
  SELECT * INTO v_org FROM billing.orgs WHERE id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'org not found: %', p_org_id;
  END IF;

  IF v_org.termination_requested_at IS NOT NULL AND v_org.terminated_at IS NULL THEN
    RAISE EXCEPTION 'org % already in termination grace (until %)',
                    p_org_id, v_org.termination_grace_until;
  END IF;

  IF v_org.terminated_at IS NOT NULL THEN
    RAISE EXCEPTION 'org % already terminated at %', p_org_id, v_org.terminated_at;
  END IF;

  v_billing_day := v_org.billing_day_of_month;

  -- 다음 결제일 계산
  -- 오늘 day < billing_day 이면 이번 달 billing_day
  -- 오늘 day >= billing_day 이면 다음 달 billing_day
  IF EXTRACT(DAY FROM v_today)::INT < v_billing_day THEN
    v_grace_until := DATE_TRUNC('month', v_today)::DATE + (v_billing_day - 1);
  ELSE
    v_grace_until := DATE_TRUNC('month', v_today + INTERVAL '1 month')::DATE + (v_billing_day - 1);
  END IF;

  UPDATE billing.orgs
    SET termination_requested_at = billing.now_utc(),
        termination_requested_by = p_requested_by,
        termination_reason       = p_reason,
        termination_grace_until  = v_grace_until,
        updated_at               = billing.now_utc()
    WHERE id = p_org_id;

  RETURN v_grace_until;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.request_termination IS
  '해지 신청. grace_until = 다음 billing_day_of_month. 신규 충전·사용 차단 X (c).';


-- ─── 3. cancel_termination — 해지 신청 취소 ──────────────
-- grace 기간 내 취소 가능. terminated_at 이미 있으면 불가.
CREATE OR REPLACE FUNCTION billing.cancel_termination(
  p_org_id    UUID,
  p_cancelled_by UUID,
  p_note      TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_org RECORD;
BEGIN
  SELECT * INTO v_org FROM billing.orgs WHERE id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_org.terminated_at IS NOT NULL THEN
    RAISE EXCEPTION 'org % already terminated', p_org_id;
  END IF;
  IF v_org.termination_requested_at IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE billing.orgs
    SET termination_requested_at = NULL,
        termination_requested_by = NULL,
        termination_reason       = NULL,
        termination_grace_until  = NULL,
        updated_at               = billing.now_utc()
    WHERE id = p_org_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 4. finalize_termination — grace 만료 처리 ───────────
-- pg_cron 매일 호출. grace_until ≤ today 인 Org 정리.
-- 동작:
--   1) 모든 accounts.status = 'terminated'
--   2) 모든 vendor_admin_tokens revoked
--   3) 모든 wallet_charges status가 active이면 'expired' 처리 (잔액 만료)
--      ※ 환불 신청 안 한 잔액 = 만료. refundable 무관.
--      ※ 환불 받으려면 grace 기간 내 process_refund_a3 호출했어야.
--   4) discount_policies.ended_early_at 채움
--   5) orgs.terminated_at = NOW + status='terminated'
CREATE OR REPLACE FUNCTION billing.finalize_termination(p_org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_org RECORD;
  v_now TIMESTAMPTZ := billing.now_utc();
BEGIN
  SELECT * INTO v_org FROM billing.orgs WHERE id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_org.terminated_at IS NOT NULL THEN RETURN FALSE; END IF;
  IF v_org.termination_grace_until IS NULL THEN RETURN FALSE; END IF;
  IF v_org.termination_grace_until > v_now::DATE THEN RETURN FALSE; END IF;

  -- accounts terminated (테이블이 있고 컬럼이 있는 경우)
  UPDATE billing.accounts
    SET status = 'terminated', updated_at = v_now
    WHERE org_id = p_org_id AND status <> 'terminated';

  -- vendor admin tokens revoke
  UPDATE billing.vendor_admin_tokens
    SET status = 'revoked',
        revoked_at = v_now,
        revoked_reason = 'org_terminated',
        updated_at = v_now
    WHERE org_id = p_org_id AND status = 'active';

  -- wallet active 잔액 → expired (만료 정책)
  WITH expired AS (
    UPDATE billing.wallet_charges
      SET status = 'expired',
          updated_at = v_now
      WHERE org_id = p_org_id
        AND status = 'active'
        AND amount_krw_net > amount_krw_used
      RETURNING id, org_id, (amount_krw_net - amount_krw_used) AS writeoff_krw
  )
  INSERT INTO billing.wallet_ledger (org_id, charge_id, delta_krw, reason, detail)
  SELECT org_id, id, -writeoff_krw, 'expiry_writeoff',
         jsonb_build_object('cause','org_terminated','writeoff_krw',writeoff_krw)
    FROM expired;

  -- discount policy 종료
  UPDATE billing.discount_policies
    SET ended_early_at = v_now,
        ended_early_reason = 'org_terminated',
        updated_at = v_now
    WHERE org_id = p_org_id AND ended_early_at IS NULL;

  -- orgs terminated
  UPDATE billing.orgs
    SET terminated_at = v_now,
        status = 'terminated',
        updated_at = v_now
    WHERE id = p_org_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.finalize_termination IS
  'grace 만료된 Org 정리. accounts·tokens·wallet·discount·orgs 일괄 처리.';


-- ─── 5. daily_termination_finalize — cron 진입점 ────────
CREATE OR REPLACE FUNCTION billing.daily_termination_finalize()
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
  v_org_id UUID;
BEGIN
  FOR v_org_id IN
    SELECT id FROM billing.orgs
      WHERE termination_requested_at IS NOT NULL
        AND terminated_at IS NULL
        AND termination_grace_until <= billing.now_utc()::DATE
  LOOP
    IF billing.finalize_termination(v_org_id) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.daily_termination_finalize IS
  'pg_cron 매일 호출. grace 만료된 모든 Org를 finalize_termination 일괄 처리.';


-- ─── 6. v_orgs_in_grace 뷰 ────────────────────────────────
CREATE OR REPLACE VIEW billing.v_orgs_in_grace
WITH (security_invoker = true) AS
SELECT
  o.id AS org_id,
  o.name,
  o.termination_requested_at,
  o.termination_grace_until,
  o.termination_reason,
  (o.termination_grace_until - billing.now_utc()::DATE) AS days_until_finalize
FROM billing.orgs o
WHERE o.termination_requested_at IS NOT NULL
  AND o.terminated_at IS NULL;

COMMENT ON VIEW billing.v_orgs_in_grace IS
  '해지 신청했지만 정리 전인 Org 목록. 슈퍼어드민 콘솔 표시용.';
