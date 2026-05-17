-- ============================================================
-- Gridge Billing v2.0 — Phase 1.5 (Gateway 통합)
-- M-2052 + M-2053 + M-2054
--
-- 목적: 게이트웨이 3 테이블에 workspace_id (FK vendor_workspaces) 추가.
--   - M-2052 gridge_api_keys.workspace_id (NOT NULL 후 승격)
--   - M-2053 gridge_api_usage_events.workspace_id (NOT NULL 후 승격)
--   - M-2054 vendor_admin_tokens.workspace_id (upstream 측, nullable)
--
-- 백필 전략:
--   - 기존 키 row 는 ensure_gateway_workspace(org_id) 로 일괄 매핑.
--   - 사용 이벤트는 key 의 workspace_id 를 따라가게 한다.
--   - vendor_admin_tokens 는 운영 도구에서 수동 매핑 (NOT NULL 미승격).
--
-- PRD §8.7.2 참조.
-- ============================================================

-- ─── M-2052: gridge_api_keys.workspace_id ─────────────────
ALTER TABLE billing.gridge_api_keys
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES billing.vendor_workspaces(id);

-- 백필 — org 별로 lazy 게이트웨이 워크스페이스 생성 후 매핑
UPDATE billing.gridge_api_keys k
SET workspace_id = billing.ensure_gateway_workspace(k.org_id)
WHERE workspace_id IS NULL;

-- NOT NULL 승격 (백필 완료 후)
ALTER TABLE billing.gridge_api_keys
  ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gridge_api_keys_workspace
  ON billing.gridge_api_keys (workspace_id);

COMMENT ON COLUMN billing.gridge_api_keys.workspace_id IS
  'M-2052. FK vendor_workspaces(id). 키 발급 시 ensure_gateway_workspace(org_id) 결과.';


-- ─── M-2053: gridge_api_usage_events.workspace_id ─────────
-- Immutable RULE 이 UPDATE 를 막으므로 백필 전 비활성화 → UPDATE → 재활성화.
ALTER TABLE billing.gridge_api_usage_events
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES billing.vendor_workspaces(id);

ALTER TABLE billing.gridge_api_usage_events
  DISABLE RULE gridge_api_usage_events_no_update;

UPDATE billing.gridge_api_usage_events e
SET workspace_id = k.workspace_id
FROM billing.gridge_api_keys k
WHERE e.key_id = k.id
  AND e.workspace_id IS NULL;

ALTER TABLE billing.gridge_api_usage_events
  ENABLE RULE gridge_api_usage_events_no_update;

-- key 없는 고아 row 가 있을 가능성에 대비: NOT NULL 승격 전 잔여 검사
DO $$
DECLARE
  v_orphan_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_orphan_count
  FROM billing.gridge_api_usage_events
  WHERE workspace_id IS NULL;

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION 'M-2053 backfill incomplete: % rows have NULL workspace_id', v_orphan_count;
  END IF;
END $$;

ALTER TABLE billing.gridge_api_usage_events
  ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gridge_usage_events_workspace_time
  ON billing.gridge_api_usage_events (workspace_id, created_at DESC);

COMMENT ON COLUMN billing.gridge_api_usage_events.workspace_id IS
  'M-2053. FK vendor_workspaces(id). 호출 시점 key.workspace_id 와 동일하게 박는다.';


-- ─── M-2054: vendor_admin_tokens.workspace_id ─────────────
-- upstream 측 vendor_workspaces row 와의 연결. 기존 row 는 운영 도구로
-- 수동 매핑하므로 NOT NULL 승격 안 함 (점진적 도입).
ALTER TABLE billing.vendor_admin_tokens
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES billing.vendor_workspaces(id);

CREATE INDEX IF NOT EXISTS idx_vendor_admin_tokens_workspace
  ON billing.vendor_admin_tokens (workspace_id)
  WHERE workspace_id IS NOT NULL;

COMMENT ON COLUMN billing.vendor_admin_tokens.workspace_id IS
  'M-2054. FK vendor_workspaces(id). upstream 측 워크스페이스 row 연결. 점진적 도입 — 기존 row 는 nullable 유지.';
