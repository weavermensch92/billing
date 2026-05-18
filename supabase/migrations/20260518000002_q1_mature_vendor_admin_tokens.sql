-- ============================================================
-- Gridge Billing v2.0 — Phase 1.6 (정합성 강화)
-- M-2054 mature: vendor_admin_tokens.workspace_id 정합성 CHECK
--
-- 배경:
--   M-2054 (20260517000006) 가 점진적 도입으로 workspace_id 를 nullable
--   로 추가. 이후 gateway-tokens UI 가 등록 시 workspace 매핑을 요구하므로
--   새 토큰은 항상 채워짐. 그러나 DB 수준 가드 없음 → status='active'/'rotated'
--   인 토큰이 NULL workspace 를 가질 수 있음.
--
-- 처리 방향:
--   1) 기존 nullable 행 자동 backfill: (org_id, vendor, vendor_workspace_id)
--      → vendor_workspaces 매칭
--   2) 매칭 안 된 active/rotated 행은 EXCEPTION (운영자가 콘솔에서 정리 후 재실행)
--   3) status-aware CHECK 추가: status NOT IN ('active','rotated')
--      OR workspace_id IS NOT NULL
--      revoked/expired 는 워크스페이스 정보가 더는 필요 없으므로 NULL 허용 유지.
-- ============================================================

-- ─── 1. 백필 ───────────────────────────────────────────────
UPDATE billing.vendor_admin_tokens t
SET workspace_id = vw.id
FROM billing.vendor_workspaces vw
JOIN billing.services s ON s.id = vw.service_id
WHERE t.workspace_id IS NULL
  AND t.org_id = vw.org_id
  AND t.vendor = s.vendor
  AND t.vendor_workspace_id = vw.vendor_workspace_id
  AND t.status IN ('active', 'rotated');


-- ─── 2. 잔여 검증 ──────────────────────────────────────────
DO $$
DECLARE
  v_orphan BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_orphan
  FROM billing.vendor_admin_tokens
  WHERE workspace_id IS NULL
    AND status IN ('active', 'rotated');

  IF v_orphan > 0 THEN
    RAISE EXCEPTION
      'M-2054 maturation failed: % active/rotated tokens have NULL workspace_id. Inspect: SELECT id, org_id, vendor, vendor_workspace_id, token_label FROM billing.vendor_admin_tokens WHERE workspace_id IS NULL AND status IN (''active'',''rotated'')',
      v_orphan;
  END IF;
END $$;


-- ─── 3. status-aware CHECK ─────────────────────────────────
ALTER TABLE billing.vendor_admin_tokens
  DROP CONSTRAINT IF EXISTS vendor_admin_tokens_active_has_workspace;

ALTER TABLE billing.vendor_admin_tokens
  ADD CONSTRAINT vendor_admin_tokens_active_has_workspace
    CHECK (status NOT IN ('active', 'rotated') OR workspace_id IS NOT NULL);

COMMENT ON CONSTRAINT vendor_admin_tokens_active_has_workspace
  ON billing.vendor_admin_tokens IS
  'M-2054 mature. active/rotated 토큰은 workspace_id 필수. revoked/expired 는 NULL 허용.';


-- ─── 4. 모니터링 뷰 — 콘솔 헬스 카드용 ───────────────────────
CREATE OR REPLACE VIEW billing.v_workspace_integrity
WITH (security_invoker = true) AS
SELECT
  (SELECT COUNT(*)
     FROM billing.vendor_admin_tokens
     WHERE workspace_id IS NULL
       AND status IN ('active','rotated'))                          AS tokens_active_unlinked,
  (SELECT COUNT(*)
     FROM billing.vendor_invoices
     WHERE workspace_id IS NULL
       AND source_type = 'account_invoice')                         AS invoices_unlinked,
  (SELECT COUNT(*)
     FROM billing.gridge_api_usage_events
     WHERE upstream_admin_token_id IS NULL)                         AS usage_events_no_upstream_token,
  (SELECT COUNT(*)
     FROM billing.gridge_api_usage_events
     WHERE created_at >= billing.now_utc() - INTERVAL '7 days')     AS usage_events_recent_total;

COMMENT ON VIEW billing.v_workspace_integrity IS
  'Phase 1.6. 콘솔 헬스 카드용 정합성 카운트. tokens_active_unlinked 는 항상 0 이어야 (CHECK 가 차단). invoices_unlinked / usage_events_no_upstream_token 은 점진적 정리 대상.';
