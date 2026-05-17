-- ============================================================
-- Gridge Billing v2.0 — M-2003
-- accounts.kind / workspace_id / payer_type (4분면 PRD §8.10)
--
-- 의존: 20260517000001_q1_vendor_workspaces.sql (M-2001)
--
-- 목적: 4분면 매트릭스 분기의 토대.
--   - kind:        'workspace_seat'         → Q1 / Q2 (워크스페이스 API)
--                  'personal_subscription'  → Q3 / Q4 (개인 구독)
--   - payer_type:  'gridge_card'             → Q1 / Q3 (Gridge VCN)
--                  'member_card_reimbursable' → Q2 / Q4 (멤버 카드 환급)
--   - workspace_id: kind='workspace_seat' 일 때 NOT NULL 강제 (NOT VALID)
-- ============================================================

-- ─── 1. 컬럼 추가 ──────────────────────────────────────────
ALTER TABLE billing.accounts
  ADD COLUMN IF NOT EXISTS kind         TEXT NOT NULL DEFAULT 'workspace_seat'
    CHECK (kind IN ('workspace_seat','personal_subscription')),
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES billing.vendor_workspaces(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS payer_type   TEXT NOT NULL DEFAULT 'gridge_card'
    CHECK (payer_type IN ('gridge_card','member_card_reimbursable'));

COMMENT ON COLUMN billing.accounts.kind IS
  '4분면 분기: workspace_seat (Q1/Q2) / personal_subscription (Q3/Q4). PRD §1.';

COMMENT ON COLUMN billing.accounts.workspace_id IS
  'kind=workspace_seat 일 때 NOT NULL (체크 제약). vendor_workspaces(M-2001) 의 FK.';

COMMENT ON COLUMN billing.accounts.payer_type IS
  '4분면 B 차원: gridge_card (Q1/Q3) / member_card_reimbursable (Q2/Q4).';


-- ─── 2. CHECK 제약: workspace_seat 은 workspace_id 필수 ────
-- NOT VALID 로 기존 row 검증 스킵 (backfill 후 별도 마이그레이션에서 VALIDATE)
ALTER TABLE billing.accounts
  DROP CONSTRAINT IF EXISTS accounts_workspace_seat_requires_workspace;

ALTER TABLE billing.accounts
  ADD CONSTRAINT accounts_workspace_seat_requires_workspace
    CHECK (kind <> 'workspace_seat' OR workspace_id IS NOT NULL)
    NOT VALID;


-- ─── 3. 인덱스 ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_accounts_workspace_id
  ON billing.accounts(workspace_id)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_kind_payer
  ON billing.accounts(kind, payer_type);


-- ─── 4. Backfill — vendor_workspaces 매칭 ──────────────────
-- 기존 accounts (모두 default kind='workspace_seat') 의 workspace_id 채움.
--   매칭 기준: (org_id, service_id) 가 같은 vendor_workspaces 중 최초 1개.
--   동일 (org × service) 에 워크스페이스가 N개면 첫 row 만 매칭 — 나머지는
--   콘솔 (Super) 에서 수동 재배치 필요.
DO $$
DECLARE
  v_updated INT := 0;
  v_rec RECORD;
  v_ws_id UUID;
BEGIN
  FOR v_rec IN
    SELECT id, org_id, service_id
    FROM billing.accounts
    WHERE workspace_id IS NULL
      AND status <> 'terminated'
  LOOP
    SELECT id INTO v_ws_id
    FROM billing.vendor_workspaces
    WHERE org_id = v_rec.org_id
      AND service_id = v_rec.service_id
      AND status = 'active'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_ws_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE billing.accounts
    SET workspace_id = v_ws_id
    WHERE id = v_rec.id;

    v_updated := v_updated + 1;
  END LOOP;

  RAISE NOTICE 'accounts.workspace_id backfill: updated=%, remaining (no workspace match)=%',
    v_updated,
    (SELECT COUNT(*) FROM billing.accounts
     WHERE workspace_id IS NULL AND kind = 'workspace_seat' AND status <> 'terminated');
END $$;
