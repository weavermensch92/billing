-- ============================================================
-- Gridge Billing MSP v2.0 — M-1005 member_sync
-- 1h 주기 멤버 sync + 그림자 멤버 감지·해소
-- 의존: billing.orgs, billing.accounts, billing.teams (M-1007), billing.admin_users
-- ============================================================

-- ─── 1. member_sync_jobs — sync 잡 실행 이력 ──────────────
CREATE TABLE IF NOT EXISTS billing.member_sync_jobs (
  idx                   BIGSERIAL PRIMARY KEY,
  id                    UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  vendor                TEXT NOT NULL,
  vendor_workspace_id   TEXT NOT NULL,
  org_id                UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,

  triggered_by          TEXT NOT NULL DEFAULT 'cron'
                          CHECK (triggered_by IN ('cron','manual','event')),
  triggered_by_admin_id UUID REFERENCES billing.admin_users(id),

  status                TEXT NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running','success','partial','failed')),
  vendor_members_count  INT,            -- 벤더가 보고한 멤버 수
  diff_added_count      INT NOT NULL DEFAULT 0,
  diff_removed_count    INT NOT NULL DEFAULT 0,
  diff_changed_count    INT NOT NULL DEFAULT 0,
  shadow_found_count    INT NOT NULL DEFAULT 0,

  error_message         TEXT,
  raw_payload           JSONB,          -- 벤더 응답 (디버깅용)

  started_at            TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  finished_at           TIMESTAMPTZ
);

CREATE INDEX idx_sync_jobs_org_started
  ON billing.member_sync_jobs(org_id, started_at DESC);
CREATE INDEX idx_sync_jobs_vendor_recent
  ON billing.member_sync_jobs(vendor, started_at DESC);

COMMENT ON TABLE billing.member_sync_jobs IS
  '1h 주기 멤버 sync 잡 실행 이력. raw_payload는 디버깅·재처리용.';


-- ─── 2. member_sync_events — 멤버별 변경 이벤트 (Immutable) ─
CREATE TABLE IF NOT EXISTS billing.member_sync_events (
  idx               BIGSERIAL PRIMARY KEY,
  id                UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  sync_job_id       UUID NOT NULL REFERENCES billing.member_sync_jobs(id) ON DELETE RESTRICT,
  org_id            UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,

  vendor            TEXT NOT NULL,
  vendor_user_id    TEXT NOT NULL,
  vendor_user_email TEXT,

  event_type        TEXT NOT NULL CHECK (event_type IN (
                      'added',         -- 신규 발견 (그림자 가능성)
                      'removed',       -- 벤더에서 제거됨
                      'role_changed',
                      'modified'       -- 기타 변경
                    )),
  -- 매핑: 그릿지 DB의 account가 매칭되면 채워짐. NULL = 그림자.
  account_id        UUID REFERENCES billing.accounts(id),

  detail            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

CREATE INDEX idx_sync_events_org_created
  ON billing.member_sync_events(org_id, created_at DESC);
CREATE INDEX idx_sync_events_shadow
  ON billing.member_sync_events(vendor, vendor_user_id, created_at DESC)
  WHERE account_id IS NULL;

-- Immutable
CREATE OR REPLACE FUNCTION billing.prevent_sync_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'member_sync_events is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_events_no_update
  BEFORE UPDATE ON billing.member_sync_events
  FOR EACH ROW EXECUTE FUNCTION billing.prevent_sync_event_mutation();

CREATE TRIGGER trg_sync_events_no_delete
  BEFORE DELETE ON billing.member_sync_events
  FOR EACH ROW EXECUTE FUNCTION billing.prevent_sync_event_mutation();


-- ─── 3. shadow_member_findings — 그림자 멤버 상태 ─────────
-- vendor + vendor_user_id 1건 = 1 row (UPSERT 패턴)
-- sync 잡이 같은 그림자를 매시간 발견해도 last_confirmed_at만 업데이트
CREATE TABLE IF NOT EXISTS billing.shadow_member_findings (
  idx                  BIGSERIAL PRIMARY KEY,
  id                   UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id               UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,

  vendor               TEXT NOT NULL,
  vendor_user_id       TEXT NOT NULL,
  vendor_user_email    TEXT,
  vendor_user_name     TEXT,
  vendor_role          TEXT,                   -- admin | member | owner 등 (벤더별 상이)

  first_seen_at        TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  last_confirmed_at    TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),

  -- 자동 등록된 account_id (auto_register 정책에 따라)
  registered_account_id UUID REFERENCES billing.accounts(id),
  -- "미할당" 팀에 임시 배치된 경우 team_id (M-1007 teams)
  assigned_team_id     UUID,                   -- references billing.teams(id) — FK는 M-1007 적용 후 추가

  resolution           TEXT NOT NULL DEFAULT 'unresolved'
                         CHECK (resolution IN (
                           'unresolved',       -- 발견됐고 처리 안 됨
                           'auto_registered',  -- 그릿지 DB에 자동 INSERT 완료
                           'manual_assigned',  -- 고객 어드민이 팀·역할 지정
                           'ignored',          -- 슈퍼어드민이 무시 결정
                           'removed_at_vendor' -- 벤더에서 제거됨 (해소)
                         )),
  resolved_at          TIMESTAMPTZ,
  resolved_by          UUID,                   -- admin_users.id 또는 members.id

  notified_super_at    TIMESTAMPTZ,
  notified_org_admin_at TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),

  UNIQUE (org_id, vendor, vendor_user_id)
);

CREATE INDEX idx_shadow_unresolved
  ON billing.shadow_member_findings(org_id, last_confirmed_at DESC)
  WHERE resolution = 'unresolved';

COMMENT ON TABLE billing.shadow_member_findings IS
  '그림자 멤버 발견·해소 이력. (org, vendor, vendor_user_id) 유니크. UPSERT 패턴.';
COMMENT ON COLUMN billing.shadow_member_findings.resolution IS
  '발견된 그림자 멤버의 해소 상태. 청구는 시도하지 않음 (QS1 원칙: 누락<오인).';


-- ─── 4. v_unresolved_shadow_members 뷰 ────────────────────
CREATE OR REPLACE VIEW billing.v_unresolved_shadow_members
WITH (security_invoker = true) AS
SELECT
  smf.id,
  smf.org_id,
  smf.vendor,
  smf.vendor_user_email,
  smf.vendor_user_name,
  smf.vendor_role,
  smf.first_seen_at,
  smf.last_confirmed_at,
  EXTRACT(DAY FROM (billing.now_utc() - smf.first_seen_at))::INT AS days_unresolved,
  smf.notified_org_admin_at IS NOT NULL AS notified_to_org
FROM billing.shadow_member_findings smf
WHERE smf.resolution = 'unresolved';

COMMENT ON VIEW billing.v_unresolved_shadow_members IS
  '미해소 그림자 멤버. 슈퍼어드민·고객 어드민 대시보드 표시 대상.';


-- ─── 5. RLS 정책 ──────────────────────────────────────────
ALTER TABLE billing.member_sync_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.member_sync_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.shadow_member_findings ENABLE ROW LEVEL SECURITY;

-- 고객은 자기 Org 분만 read
CREATE POLICY sync_jobs_org_read ON billing.member_sync_jobs
  FOR SELECT USING (org_id = billing.my_org_id());
CREATE POLICY sync_jobs_admin_all ON billing.member_sync_jobs
  FOR ALL USING (billing.is_admin_user());

CREATE POLICY sync_events_org_read ON billing.member_sync_events
  FOR SELECT USING (org_id = billing.my_org_id());
CREATE POLICY sync_events_admin_read ON billing.member_sync_events
  FOR SELECT USING (billing.is_admin_user());

CREATE POLICY shadow_org_read ON billing.shadow_member_findings
  FOR SELECT USING (org_id = billing.my_org_id());
CREATE POLICY shadow_admin_all ON billing.shadow_member_findings
  FOR ALL USING (billing.is_admin_user());

CREATE TRIGGER trg_shadow_findings_updated_at
  BEFORE UPDATE ON billing.shadow_member_findings
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();


-- ─── 6. anomaly_rules seed — 워크스페이스 결제 단절 룰 ────
-- M-1005가 적용하는 신규 1건. (기존 anomaly_detection.sql 패턴 유지)
INSERT INTO billing.anomaly_rules (
  rule_code, category, severity, name, description, is_active
) VALUES (
  'workspace_payment_break',
  'cross_check',
  'critical',
  '워크스페이스 결제 단절',
  '활성 멤버가 있는 워크스페이스에서 24h 동안 그릿지 카드 거래가 0건 — 카드가 다른 결제수단으로 변경됐을 가능성. 그림자 admin 시나리오.',
  TRUE
)
ON CONFLICT (rule_code) DO NOTHING;