-- ============================================================
-- Self-Approval Headroom (Super → Admin 사전 권한 위임)
-- Super가 할당한 월간 한도 내에서 Owner/Admin이 즉시 승인 가능
-- ============================================================

-- ─── orgs 확장 ────────────────────────────────────────────
ALTER TABLE billing.orgs
  ADD COLUMN IF NOT EXISTS self_approval_headroom_krw BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS self_approval_used_krw     BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS self_approval_reset_at     TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc();

-- 음수/초과 방지 (DB 레벨 불변)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'self_approval_used_nonneg') THEN
    ALTER TABLE billing.orgs ADD CONSTRAINT self_approval_used_nonneg CHECK (self_approval_used_krw >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'self_approval_used_lte_headroom') THEN
    ALTER TABLE billing.orgs ADD CONSTRAINT self_approval_used_lte_headroom
      CHECK (self_approval_used_krw <= self_approval_headroom_krw);
  END IF;
END$$;

COMMENT ON COLUMN billing.orgs.self_approval_headroom_krw IS
  'Super가 할당한 월간 자율 승인 한도 (KRW). Owner/Admin이 AM 경유 없이 이 범위 내 요청을 즉시 승인.';
COMMENT ON COLUMN billing.orgs.self_approval_used_krw IS
  '이번 달 자율 승인으로 소진된 금액. reset_self_approval_usage()로 월 1일 리셋.';

-- ─── action_requests 확장 ────────────────────────────────
ALTER TABLE billing.action_requests
  ADD COLUMN IF NOT EXISTS estimated_cost_krw BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS self_approved_by   UUID REFERENCES billing.members(id),
  ADD COLUMN IF NOT EXISTS self_approved_at   TIMESTAMPTZ;

-- path_type CHECK 재정의 — 'self' 추가
ALTER TABLE billing.action_requests
  DROP CONSTRAINT IF EXISTS action_requests_path_type_check;

ALTER TABLE billing.action_requests
  ADD CONSTRAINT action_requests_path_type_check
  CHECK (path_type IS NULL OR path_type IN ('fast', 'full', 'self'));

COMMENT ON COLUMN billing.action_requests.estimated_cost_krw IS
  '요청 유형별 예상 월 비용 증가분. new_account=monthly_limit, limit_change=max(0,new-old), terminate/vcn_replace=0.';
COMMENT ON COLUMN billing.action_requests.self_approved_by IS
  'path_type=self 인 경우 승인한 Owner/Admin member_id.';

-- ─── 동시성 안전 차감 함수 (race 방지) ──────────────────
-- WHERE 절 원자 체크: UPDATE가 성공하면 차감 완료, 실패하면 초과 상태
CREATE OR REPLACE FUNCTION billing.consume_self_approval(
  p_org_id UUID, p_amount BIGINT
) RETURNS BOOLEAN AS $$
DECLARE v_rows INT;
BEGIN
  IF p_amount < 0 THEN RAISE EXCEPTION 'amount must be non-negative'; END IF;
  IF p_amount = 0 THEN RETURN TRUE; END IF;

  UPDATE billing.orgs
  SET self_approval_used_krw = self_approval_used_krw + p_amount,
      updated_at = billing.now_utc()
  WHERE id = p_org_id
    AND status = 'active'
    AND self_approval_headroom_krw - self_approval_used_krw >= p_amount;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.consume_self_approval IS
  '자율 승인 여유분 차감 원자 함수. 성공 시 TRUE, 한도 초과 시 FALSE.';

-- ─── 월간 리셋 함수 ────────────────────────────────────
-- Phase 0: 수동 호출 / Phase 1: pg_cron 매월 1일 00:00 KST
CREATE OR REPLACE FUNCTION billing.reset_self_approval_usage()
RETURNS INT AS $$
DECLARE v_rows INT;
BEGIN
  UPDATE billing.orgs
  SET self_approval_used_krw = 0,
      self_approval_reset_at = billing.now_utc(),
      updated_at = billing.now_utc()
  WHERE status = 'active'
    AND self_approval_reset_at < date_trunc('month', billing.now_utc());
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.reset_self_approval_usage IS
  '매월 1일 0시 KST 실행. self_approval_used_krw를 0으로 리셋. Phase 1 pg_cron 대상.';

-- ─── 고객 포털 헬퍼 뷰 ─────────────────────────────────
-- Owner/Admin이 자율 승인 잔액 빠르게 조회
CREATE OR REPLACE VIEW billing.v_self_approval_status
  WITH (security_invoker = true) AS
SELECT
  id AS org_id,
  self_approval_headroom_krw AS headroom_krw,
  self_approval_used_krw     AS used_krw,
  (self_approval_headroom_krw - self_approval_used_krw) AS remaining_krw,
  self_approval_reset_at     AS reset_at,
  CASE WHEN self_approval_headroom_krw > 0
       THEN ROUND((self_approval_used_krw::NUMERIC / self_approval_headroom_krw) * 100, 1)
       ELSE 0 END AS used_pct
FROM billing.orgs;

GRANT SELECT ON billing.v_self_approval_status TO anon, authenticated;
