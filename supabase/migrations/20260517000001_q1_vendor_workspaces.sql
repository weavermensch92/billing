-- ============================================================
-- Gridge Billing v2.0 — M-2001 + M-2002
-- vendor_workspaces + workspace_members (4분면 PRD §8.1, §8.2)
--
-- 목적: 벤더 측 워크스페이스를 1급 시민으로. accounts.provider_workspace_id
--       텍스트 매칭에 의존하던 식별을 FK 로 승격하기 위한 base.
--       후속 마이그레이션 (M-2003~2005) 가 이 테이블을 참조한다.
-- ============================================================

-- ─── 1. vendor_workspaces ──────────────────────────────────
-- 한 조직이 한 벤더의 워크스페이스를 N개 보유 가능
-- (예: Anthropic Console 의 "main" / "research" 두 워크스페이스)
CREATE TABLE IF NOT EXISTS billing.vendor_workspaces (
  idx                   BIGSERIAL PRIMARY KEY,
  id                    UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id                UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,
  service_id            UUID NOT NULL REFERENCES billing.services(id) ON DELETE RESTRICT,
  vendor_workspace_id   TEXT NOT NULL,
  display_name          TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','suspended','terminated')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  UNIQUE (service_id, vendor_workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_workspaces_org
  ON billing.vendor_workspaces(org_id, service_id);

CREATE INDEX IF NOT EXISTS idx_vendor_workspaces_status
  ON billing.vendor_workspaces(status)
  WHERE status <> 'terminated';

COMMENT ON TABLE billing.vendor_workspaces IS
  'Q1 (A1×B1) 워크스페이스 단위 결제 모델. 벤더 측 워크스페이스 1개 = 1 row. PRD §8.1.';

-- updated_at 자동 갱신 트리거 (다른 테이블과 동일 패턴)
CREATE OR REPLACE FUNCTION billing.touch_vendor_workspaces_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = billing.now_utc();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vendor_workspaces_touch ON billing.vendor_workspaces;
CREATE TRIGGER trg_vendor_workspaces_touch
  BEFORE UPDATE ON billing.vendor_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION billing.touch_vendor_workspaces_updated_at();


-- ─── 2. workspace_members ──────────────────────────────────
-- 어떤 멤버가 어떤 워크스페이스에 가입했는지 N:M (account 단위)
CREATE TABLE IF NOT EXISTS billing.workspace_members (
  idx                   BIGSERIAL PRIMARY KEY,
  id                    UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  workspace_id          UUID NOT NULL REFERENCES billing.vendor_workspaces(id) ON DELETE CASCADE,
  account_id            UUID NOT NULL REFERENCES billing.accounts(id) ON DELETE RESTRICT,
  member_id             UUID NOT NULL REFERENCES billing.members(id) ON DELETE RESTRICT,
  vendor_member_role    TEXT NOT NULL DEFAULT 'member'
                          CHECK (vendor_member_role IN ('admin','member','viewer')),
  joined_at             TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  left_at               TIMESTAMPTZ,
  UNIQUE (workspace_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace
  ON billing.workspace_members(workspace_id)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_members_member
  ON billing.workspace_members(member_id)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_members_account
  ON billing.workspace_members(account_id)
  WHERE left_at IS NULL;

COMMENT ON TABLE billing.workspace_members IS
  '워크스페이스 가입 이력. left_at IS NULL 이면 현재 가입 상태. PRD §8.2.';


-- ============================================================
-- 3. RLS — vendor_workspaces
-- (기존 billing.my_org_id / my_role / is_admin_user / admin_role 헬퍼 재사용)
-- ============================================================

ALTER TABLE billing.vendor_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.workspace_members ENABLE ROW LEVEL SECURITY;

-- vendor_workspaces: 고객 사이드 — owner/admin 만 read
CREATE POLICY "owner admin can read org workspaces"
  ON billing.vendor_workspaces FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND billing.my_role() IN ('owner','admin')
  );

-- vendor_workspaces: 콘솔 admin 은 모두 read
CREATE POLICY "admin can read all workspaces"
  ON billing.vendor_workspaces FOR SELECT
  USING (billing.is_admin_user());

-- vendor_workspaces: Super 만 INSERT/UPDATE/DELETE
CREATE POLICY "super can manage workspaces"
  ON billing.vendor_workspaces FOR ALL
  USING (billing.admin_role() = 'super');


-- workspace_members: 본인 자리 (account 가 본인 member_id) 만 자기 record read
CREATE POLICY "member can read own workspace seat"
  ON billing.workspace_members FOR SELECT
  USING (member_id = billing.my_member_id());

-- workspace_members: 같은 org 의 owner/admin 은 조직 워크스페이스 멤버 전체 read
CREATE POLICY "owner admin can read org workspace members"
  ON billing.workspace_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM billing.vendor_workspaces vw
      WHERE vw.id = workspace_id
        AND vw.org_id = billing.my_org_id()
        AND billing.my_role() IN ('owner','admin')
    )
  );

-- workspace_members: 콘솔 admin 은 모두 read
CREATE POLICY "admin can read all workspace members"
  ON billing.workspace_members FOR SELECT
  USING (billing.is_admin_user());

-- workspace_members: Super 만 INSERT/UPDATE/DELETE
CREATE POLICY "super can manage workspace members"
  ON billing.workspace_members FOR ALL
  USING (billing.admin_role() = 'super');


-- ============================================================
-- 4. Backfill — vendor_invoices 의 (org_id, vendor, vendor_workspace_id)
--    DISTINCT 조합으로 vendor_workspaces row 자동 생성.
--    services 가 (vendor, category='api') 로 매칭되면 첫 행을 사용.
--    매칭 실패 row 는 skip (Super 가 콘솔에서 수동 정리).
--
--    workspace_members 자동 추정은 부정확하므로 skip — accounts 컬럼이
--    추가되는 M-2003 이후 별도 backfill 마이그레이션에서 처리.
-- ============================================================

DO $$
DECLARE
  v_inserted INT := 0;
  v_skipped  INT := 0;
  v_rec RECORD;
  v_service_id UUID;
BEGIN
  FOR v_rec IN
    SELECT DISTINCT
      vi.org_id,
      vi.vendor,
      vi.vendor_workspace_id
    FROM billing.vendor_invoices vi
    WHERE vi.vendor_workspace_id IS NOT NULL
      AND vi.vendor_workspace_id <> ''
  LOOP
    -- vendor → service_id 매칭 시도 (api 카테고리 우선, 없으면 첫 행)
    SELECT id INTO v_service_id
    FROM billing.services
    WHERE vendor = v_rec.vendor
      AND is_active = TRUE
    ORDER BY
      CASE category WHEN 'api' THEN 0 ELSE 1 END,
      created_at ASC
    LIMIT 1;

    IF v_service_id IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO billing.vendor_workspaces (
      org_id, service_id, vendor_workspace_id, display_name, status
    ) VALUES (
      v_rec.org_id,
      v_service_id,
      v_rec.vendor_workspace_id,
      v_rec.vendor || ' / ' || v_rec.vendor_workspace_id,  -- 임시 표시명
      'active'
    )
    ON CONFLICT (service_id, vendor_workspace_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END LOOP;

  RAISE NOTICE 'vendor_workspaces backfill: inserted=%, skipped(no service match)=%',
    v_inserted, v_skipped;
END $$;
