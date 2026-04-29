-- ============================================================
-- 자동 연쇄형 Partial Headroom Coverage
-- 부분 커버 시: 잔여 헤드룸 선 소진 + Super에게 헤드룸 증액 요청 자동 생성
-- ============================================================

-- ─── action_requests 확장 ───────────────────────────────
-- awaiting_headroom 상태: 부모가 Super 증액 승인 대기 중
-- headroom_shortfall_krw: Super 승인 필요 초과분
-- reserved_headroom_krw: 제출 시 선 소진한 잔여 헤드룸 (롤백용)
ALTER TABLE billing.action_requests
  ADD COLUMN IF NOT EXISTS headroom_shortfall_krw BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_headroom_krw  BIGINT NOT NULL DEFAULT 0;

-- status CHECK 재정의 — awaiting_headroom 추가
ALTER TABLE billing.action_requests
  DROP CONSTRAINT IF EXISTS action_requests_status_check;

ALTER TABLE billing.action_requests
  ADD CONSTRAINT action_requests_status_check
  CHECK (status IN (
    'pending','in_review','awaiting_customer','awaiting_headroom',
    'approved','rejected','completed','cancelled'
  ));

-- action_type CHECK 재정의 — headroom_increase 추가
ALTER TABLE billing.action_requests
  DROP CONSTRAINT IF EXISTS action_requests_action_type_check;

ALTER TABLE billing.action_requests
  ADD CONSTRAINT action_requests_action_type_check
  CHECK (action_type IN (
    'new_account','terminate','limit_change',
    'vcn_replace','decline_response','bulk_terminate',
    'headroom_increase'
  ));

COMMENT ON COLUMN billing.action_requests.headroom_shortfall_krw IS
  '부분 커버 시 Super 증액 승인이 필요한 초과분. awaiting_headroom 전이 시 set.';
COMMENT ON COLUMN billing.action_requests.reserved_headroom_krw IS
  '제출 시점에 선 소진한 자율 승인 금액. Super 거부 시 롤백 대상.';

-- ─── Super 증액 승인 원자 함수 ───────────────────────────
-- headroom 증액 + 초과분 used 소진을 하나의 트랜잭션으로
CREATE OR REPLACE FUNCTION billing.approve_headroom_increase(
  p_org_id UUID, p_shortfall_krw BIGINT
) RETURNS BOOLEAN AS $$
DECLARE v_rows INT;
BEGIN
  IF p_shortfall_krw <= 0 THEN RETURN FALSE; END IF;

  UPDATE billing.orgs
  SET self_approval_headroom_krw = self_approval_headroom_krw + p_shortfall_krw,
      self_approval_used_krw     = self_approval_used_krw + p_shortfall_krw,
      updated_at = billing.now_utc()
  WHERE id = p_org_id AND status = 'active';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.approve_headroom_increase IS
  'Super 증액 승인: headroom 및 used 동시에 shortfall 만큼 증가. 부모 요청 전체 비용을 자율 승인으로 커버하기 위함.';

-- ─── Super 거부 시 롤백 함수 ─────────────────────────────
-- 선 소진한 reserved 금액을 used에서 차감
CREATE OR REPLACE FUNCTION billing.rollback_reserved_headroom(
  p_org_id UUID, p_reserved_krw BIGINT
) RETURNS BOOLEAN AS $$
DECLARE v_rows INT;
BEGIN
  IF p_reserved_krw <= 0 THEN RETURN TRUE; END IF;

  UPDATE billing.orgs
  SET self_approval_used_krw = GREATEST(0, self_approval_used_krw - p_reserved_krw),
      updated_at = billing.now_utc()
  WHERE id = p_org_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.rollback_reserved_headroom IS
  'Super 증액 거부 시 호출. awaiting_headroom 부모 요청의 선 소진 금액을 원복.';
