-- ============================================================
-- VCN 자동 폐기 배치 — suspended 7일 경과 시 revoked 전이
-- Phase 0: 수동 호출 / Phase 1: pg_cron 매일 02:00 KST
-- ============================================================

CREATE OR REPLACE FUNCTION billing.auto_revoke_expired_vcns()
RETURNS INT AS $$
DECLARE v_rows INT;
BEGIN
  UPDATE billing.virtual_cards
  SET status = 'revoked',
      revoked_at = billing.now_utc(),
      updated_at = billing.now_utc()
  WHERE status = 'suspended'
    AND suspended_at IS NOT NULL
    AND suspended_at < billing.now_utc() - INTERVAL '7 days';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.auto_revoke_expired_vcns IS
  'suspended 상태에서 7일 이상 경과한 VCN을 revoked로 전이. validate_vcn_transition 트리거가 자동 검증함.';

-- 해지된 account + 연결 VCN 조회를 위한 헬퍼 뷰 (콘솔 운영 페이지용)
CREATE OR REPLACE VIEW billing.v_pending_vcn_revocation
  WITH (security_invoker = true) AS
SELECT
  v.id            AS virtual_card_id,
  v.account_id,
  v.org_id,
  v.card_last4,
  v.suspended_at,
  v.suspended_at + INTERVAL '7 days' AS scheduled_revoke_at,
  CASE WHEN v.suspended_at < billing.now_utc() - INTERVAL '7 days'
       THEN TRUE ELSE FALSE END AS is_overdue,
  EXTRACT(EPOCH FROM (billing.now_utc() - v.suspended_at)) / 86400 AS days_suspended
FROM billing.virtual_cards v
WHERE v.status = 'suspended'
  AND v.suspended_at IS NOT NULL;

GRANT SELECT ON billing.v_pending_vcn_revocation TO anon, authenticated;

COMMENT ON VIEW billing.v_pending_vcn_revocation IS
  '폐기 예정 또는 폐기 지연된 VCN 목록. 콘솔 운영 화면에서 참조.';
