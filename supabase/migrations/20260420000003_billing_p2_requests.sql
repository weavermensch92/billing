-- ============================================================
-- Sprint 2 — P2 테이블 (요청 워크플로 + 알림)
-- ============================================================

-- ============================================================
-- 13. request_events — 요청 타임라인 (Immutable)
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.request_events (
  idx         BIGSERIAL PRIMARY KEY,
  id          UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  request_id  UUID NOT NULL REFERENCES billing.action_requests(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES billing.orgs(id),
  event_type  TEXT NOT NULL
                CHECK (event_type IN (
                  'created','assigned','path_decided','approved','rejected',
                  'awaiting_customer','customer_confirmed','completed','cancelled',
                  'vcn_issued','message_sent','sla_warning','sla_breach','system_note'
                )),
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('member','admin','system')),
  actor_id    UUID,
  event_data  JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

CREATE RULE request_events_no_update AS ON UPDATE TO billing.request_events DO INSTEAD NOTHING;
CREATE RULE request_events_no_delete AS ON DELETE TO billing.request_events DO INSTEAD NOTHING;

CREATE INDEX idx_request_events_request_id ON billing.request_events(request_id, created_at);
CREATE INDEX idx_request_events_org_id     ON billing.request_events(org_id, created_at DESC);

-- ============================================================
-- 14. request_messages — 고객↔AM 메시지 스레드
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.request_messages (
  idx                   BIGSERIAL PRIMARY KEY,
  id                    UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  request_id            UUID NOT NULL REFERENCES billing.action_requests(id) ON DELETE CASCADE,
  org_id                UUID NOT NULL REFERENCES billing.orgs(id),
  message_type          TEXT NOT NULL DEFAULT 'text'
                          CHECK (message_type IN ('text','system_update','attachment')),
  sender_type           TEXT NOT NULL CHECK (sender_type IN ('member','admin','system')),
  sender_id             UUID,
  sender_name           TEXT,
  body                  TEXT NOT NULL,
  attachments           JSONB DEFAULT '[]',
  read_by_member_at     TIMESTAMPTZ,
  read_by_admin_at      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

CREATE INDEX idx_request_messages_request_id
  ON billing.request_messages(request_id, created_at);
CREATE INDEX idx_request_messages_unread_member
  ON billing.request_messages(request_id)
  WHERE read_by_member_at IS NULL AND sender_type = 'admin';
CREATE INDEX idx_request_messages_unread_admin
  ON billing.request_messages(request_id)
  WHERE read_by_admin_at IS NULL AND sender_type = 'member';

-- ============================================================
-- 15. notification_preferences — 알림 설정 (채널 × 이벤트)
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.notification_preferences (
  idx        BIGSERIAL PRIMARY KEY,
  id         UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id     UUID NOT NULL REFERENCES billing.orgs(id),
  member_id  UUID REFERENCES billing.members(id),
  scope      TEXT NOT NULL DEFAULT 'member'
               CHECK (scope IN ('system','org','member')),
  channel    TEXT NOT NULL CHECK (channel IN ('email','slack','sms','in_app')),
  event_type TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  config     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  UNIQUE (org_id, member_id, channel, event_type)
);

CREATE TRIGGER trg_notif_pref_updated_at
  BEFORE UPDATE ON billing.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();

-- ============================================================
-- 16. offboarding_events — 오프보딩 영향/이행 추적 (PB-011)
-- ============================================================
CREATE TABLE IF NOT EXISTS billing.offboarding_events (
  idx                    BIGSERIAL PRIMARY KEY,
  id                     UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id                 UUID NOT NULL REFERENCES billing.orgs(id),
  target_member_id       UUID NOT NULL REFERENCES billing.members(id),
  parent_request_id      UUID REFERENCES billing.action_requests(id),
  accounts_affected      INT NOT NULL DEFAULT 0,
  expected_savings_krw   BIGINT NOT NULL DEFAULT 0,
  actions_summary        JSONB NOT NULL DEFAULT '{}',  -- { terminate: N, transfer: N, keep: N }
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','in_progress','completed','cancelled')),
  initiated_by           UUID NOT NULL,                -- member_id
  initiated_at           TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  completed_at           TIMESTAMPTZ
);

CREATE INDEX idx_offboarding_events_org ON billing.offboarding_events(org_id, initiated_at DESC);

-- ============================================================
-- RLS 활성화 + 정책
-- ============================================================
ALTER TABLE billing.request_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.request_messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.notification_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.offboarding_events        ENABLE ROW LEVEL SECURITY;

-- request_events: 같은 조직 + 본인 관련 요청만
CREATE POLICY "members read org request_events"
  ON billing.request_events FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND (
      billing.my_role() IN ('owner','admin')
      OR EXISTS (
        SELECT 1 FROM billing.action_requests r
        WHERE r.id = request_events.request_id
          AND r.requester_id = billing.my_member_id()
      )
    )
  );

CREATE POLICY "admin read all request_events"
  ON billing.request_events FOR SELECT
  USING (billing.is_admin_user());

-- request_messages: 요청 접근 권한과 동일
CREATE POLICY "members read org request_messages"
  ON billing.request_messages FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND (
      billing.my_role() IN ('owner','admin')
      OR EXISTS (
        SELECT 1 FROM billing.action_requests r
        WHERE r.id = request_messages.request_id
          AND r.requester_id = billing.my_member_id()
      )
    )
  );

CREATE POLICY "members create request_messages"
  ON billing.request_messages FOR INSERT
  WITH CHECK (
    org_id = billing.my_org_id()
    AND sender_type = 'member'
    AND sender_id = billing.my_member_id()
  );

CREATE POLICY "admin manage request_messages"
  ON billing.request_messages FOR ALL
  USING (billing.is_admin_user());

-- notification_preferences: 본인 or Owner(조직 기본값)
CREATE POLICY "member read own notif"
  ON billing.notification_preferences FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND (scope = 'system' OR member_id = billing.my_member_id() OR billing.my_role() = 'owner')
  );

CREATE POLICY "member manage own notif"
  ON billing.notification_preferences FOR ALL
  USING (
    org_id = billing.my_org_id()
    AND member_id = billing.my_member_id()
  );

CREATE POLICY "owner manage org notif"
  ON billing.notification_preferences FOR ALL
  USING (
    org_id = billing.my_org_id()
    AND scope = 'org'
    AND billing.my_role() = 'owner'
  );

-- offboarding_events: owner/admin
CREATE POLICY "owner admin read offboarding"
  ON billing.offboarding_events FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND billing.my_role() IN ('owner','admin')
  );

CREATE POLICY "admin read all offboarding"
  ON billing.offboarding_events FOR SELECT
  USING (billing.is_admin_user());

-- ============================================================
-- 자동 이벤트 트리거 — action_requests 상태 변경 시 request_events 자동 기록
-- ============================================================
CREATE OR REPLACE FUNCTION billing.auto_request_event()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO billing.request_events (
      request_id, org_id, event_type, actor_type, actor_id, event_data
    ) VALUES (
      NEW.id, NEW.org_id, 'created', 'member', NEW.requester_id,
      jsonb_build_object('action_type', NEW.action_type)
    );
    RETURN NEW;
  END IF;

  -- 상태 전이 감지
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_event_type := CASE NEW.status
      WHEN 'in_review'         THEN 'assigned'
      WHEN 'awaiting_customer' THEN 'awaiting_customer'
      WHEN 'approved'          THEN 'approved'
      WHEN 'rejected'          THEN 'rejected'
      WHEN 'completed'         THEN 'completed'
      WHEN 'cancelled'         THEN 'cancelled'
      ELSE 'system_note'
    END;

    INSERT INTO billing.request_events (
      request_id, org_id, event_type, actor_type, actor_id, event_data
    ) VALUES (
      NEW.id, NEW.org_id, v_event_type,
      COALESCE((SELECT 'admin'::TEXT WHERE NEW.resolved_by IS NOT NULL), 'system'),
      NEW.resolved_by,
      jsonb_build_object('from', OLD.status, 'to', NEW.status)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_action_requests_auto_event
  AFTER INSERT OR UPDATE OF status ON billing.action_requests
  FOR EACH ROW EXECUTE FUNCTION billing.auto_request_event();
