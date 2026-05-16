-- ============================================================
-- Gridge Billing MSP v2.0 — M-1006 key_issuance
-- Q5 A+C: 같은 페이지 즉시 재발행 + 1h/3회 임계 + 24h 쿨다운
-- 의존: billing.orgs, billing.accounts, billing.members, billing.admin_users
-- ============================================================

-- ─── 1. key_issuance_policies — Org별 정책 ────────────────
-- 슈퍼어드민이 Org별 임계 지정. 디폴트: 1h/3회 + 24h 쿨다운.
CREATE TABLE IF NOT EXISTS billing.key_issuance_policies (
  org_id                   UUID PRIMARY KEY REFERENCES billing.orgs(id) ON DELETE CASCADE,
  issuances_per_hour_limit INT NOT NULL DEFAULT 3
                             CHECK (issuances_per_hour_limit > 0 AND issuances_per_hour_limit <= 100),
  cooldown_hours           INT NOT NULL DEFAULT 24
                             CHECK (cooldown_hours > 0 AND cooldown_hours <= 168),
  daily_max                INT,                 -- NULL = 무제한, 보조 상한
  created_by               UUID REFERENCES billing.admin_users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

COMMENT ON TABLE billing.key_issuance_policies IS
  'Org별 키 발급 임계 정책. 디폴트는 1h/3회 + 24h 쿨다운. 슈퍼어드민 조정 가능.';


-- ─── 2. key_issuance_quota — 런타임 윈도우 (Org 1 row) ───
-- pending 자율승인과 유사한 카운터 패턴. 동시성은 FOR UPDATE 락.
CREATE TABLE IF NOT EXISTS billing.key_issuance_quota (
  org_id                    UUID PRIMARY KEY REFERENCES billing.orgs(id) ON DELETE CASCADE,
  current_window_count      INT NOT NULL DEFAULT 0,
  current_window_start_at   TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  cooldown_until            TIMESTAMPTZ,         -- NULL이면 쿨다운 아님
  last_issued_at            TIMESTAMPTZ,
  last_blocked_at           TIMESTAMPTZ,
  total_issued_count        BIGINT NOT NULL DEFAULT 0,
  total_blocked_count       BIGINT NOT NULL DEFAULT 0,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

COMMENT ON TABLE billing.key_issuance_quota IS
  '키 발급 런타임 카운터. Org당 1 row. current_window는 1h 슬라이딩 윈도우.';


-- ─── 3. key_issuance_events — 발급·차단 이력 (Immutable) ──
CREATE TABLE IF NOT EXISTS billing.key_issuance_events (
  idx               BIGSERIAL PRIMARY KEY,
  id                UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id            UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,
  account_id        UUID REFERENCES billing.accounts(id),
  member_id         UUID REFERENCES billing.members(id),  -- 신청자

  event_type        TEXT NOT NULL CHECK (event_type IN (
                      'issued',      -- 발급 성공
                      'reissued',    -- 같은 키 ID 재발행 (즉시 복구 케이스)
                      'revoked',     -- 사용자 삭제
                      'blocked'      -- 임계 초과 차단
                    )),
  vendor            TEXT NOT NULL,
  vendor_key_id     TEXT,            -- 벤더 측 키 ID (blocked는 NULL 가능)

  approved_by_org_admin_id  UUID REFERENCES billing.members(id),  -- 고객 어드민 승인
  approved_at               TIMESTAMPTZ,

  blocked_by_quota  BOOLEAN NOT NULL DEFAULT FALSE,
  block_reason      TEXT,             -- 'hourly_limit' | 'cooldown' | 'daily_max'

  detail            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

CREATE INDEX idx_key_events_org_created
  ON billing.key_issuance_events(org_id, created_at DESC);
CREATE INDEX idx_key_events_blocked
  ON billing.key_issuance_events(org_id, created_at DESC)
  WHERE blocked_by_quota = TRUE;

-- Immutable
CREATE OR REPLACE FUNCTION billing.prevent_key_event_mutation()
RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'key_issuance_events is immutable'; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_key_events_no_update
  BEFORE UPDATE ON billing.key_issuance_events
  FOR EACH ROW EXECUTE FUNCTION billing.prevent_key_event_mutation();
CREATE TRIGGER trg_key_events_no_delete
  BEFORE DELETE ON billing.key_issuance_events
  FOR EACH ROW EXECUTE FUNCTION billing.prevent_key_event_mutation();


-- ─── 4. consume_key_issuance_quota — 원자 함수 ────────────
-- 호출 흐름:
--   1) 쿨다운 중이면 즉시 (FALSE, 'cooldown', cooldown_until) 반환
--   2) 윈도우 시작 후 1h 경과면 새 윈도우 시작 + count=1
--   3) 윈도우 내 count < limit 이면 허용 + count++
--   4) count >= limit 도달 시 쿨다운 진입 + 차단 반환
CREATE OR REPLACE FUNCTION billing.consume_key_issuance_quota(
  p_org_id UUID
) RETURNS TABLE (
  allowed           BOOLEAN,
  block_reason      TEXT,
  remaining_in_window INT,
  cooldown_until    TIMESTAMPTZ
) AS $$
DECLARE
  v_policy          RECORD;
  v_quota           RECORD;
  v_now             TIMESTAMPTZ := billing.now_utc();
  v_window_age_sec  INT;
BEGIN
  -- 정책 조회 (없으면 디폴트 INSERT)
  SELECT * INTO v_policy FROM billing.key_issuance_policies WHERE org_id = p_org_id;
  IF NOT FOUND THEN
    INSERT INTO billing.key_issuance_policies (org_id) VALUES (p_org_id)
      RETURNING * INTO v_policy;
  END IF;

  -- 쿼타 row 조회 (없으면 생성). FOR UPDATE 락.
  SELECT * INTO v_quota FROM billing.key_issuance_quota
    WHERE org_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO billing.key_issuance_quota (org_id) VALUES (p_org_id)
      RETURNING * INTO v_quota;
  END IF;

  -- 1. 쿨다운 중?
  IF v_quota.cooldown_until IS NOT NULL AND v_quota.cooldown_until > v_now THEN
    UPDATE billing.key_issuance_quota
      SET total_blocked_count = total_blocked_count + 1,
          last_blocked_at = v_now,
          updated_at = v_now
      WHERE org_id = p_org_id;
    RETURN QUERY SELECT FALSE, 'cooldown'::TEXT, 0, v_quota.cooldown_until;
    RETURN;
  END IF;

  -- 2. 1h 윈도우 경과 → 새 윈도우 시작
  v_window_age_sec := EXTRACT(EPOCH FROM (v_now - v_quota.current_window_start_at))::INT;
  IF v_window_age_sec >= 3600 THEN
    UPDATE billing.key_issuance_quota
      SET current_window_count = 1,
          current_window_start_at = v_now,
          cooldown_until = NULL,
          last_issued_at = v_now,
          total_issued_count = total_issued_count + 1,
          updated_at = v_now
      WHERE org_id = p_org_id;
    RETURN QUERY SELECT TRUE, NULL::TEXT,
                        (v_policy.issuances_per_hour_limit - 1), NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- 3. 윈도우 내 count < limit
  IF v_quota.current_window_count < v_policy.issuances_per_hour_limit THEN
    UPDATE billing.key_issuance_quota
      SET current_window_count = current_window_count + 1,
          last_issued_at = v_now,
          total_issued_count = total_issued_count + 1,
          updated_at = v_now
      WHERE org_id = p_org_id;
    RETURN QUERY SELECT TRUE, NULL::TEXT,
                        (v_policy.issuances_per_hour_limit - v_quota.current_window_count - 1),
                        NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- 4. 임계 도달 → 쿨다운 진입
  UPDATE billing.key_issuance_quota
    SET cooldown_until = v_now + (v_policy.cooldown_hours || ' hours')::INTERVAL,
        total_blocked_count = total_blocked_count + 1,
        last_blocked_at = v_now,
        updated_at = v_now
    WHERE org_id = p_org_id;

  RETURN QUERY SELECT FALSE, 'hourly_limit'::TEXT, 0,
                      (v_now + (v_policy.cooldown_hours || ' hours')::INTERVAL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.consume_key_issuance_quota IS
  'Q5 A+C: 키 발급 시 호출. 1h 윈도우 + count check + 쿨다운 자동 진입. 원자 + FOR UPDATE.';


-- ─── 5. RLS ────────────────────────────────────────────────
ALTER TABLE billing.key_issuance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.key_issuance_quota    ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.key_issuance_events   ENABLE ROW LEVEL SECURITY;

CREATE POLICY key_policies_org_read ON billing.key_issuance_policies
  FOR SELECT USING (org_id = billing.my_org_id());
CREATE POLICY key_policies_admin_all ON billing.key_issuance_policies
  FOR ALL USING (billing.is_admin_user());

CREATE POLICY key_quota_org_read ON billing.key_issuance_quota
  FOR SELECT USING (org_id = billing.my_org_id());
CREATE POLICY key_quota_admin_all ON billing.key_issuance_quota
  FOR ALL USING (billing.is_admin_user());

CREATE POLICY key_events_org_read ON billing.key_issuance_events
  FOR SELECT USING (org_id = billing.my_org_id());
CREATE POLICY key_events_admin_read ON billing.key_issuance_events
  FOR SELECT USING (billing.is_admin_user());

CREATE TRIGGER trg_key_policies_updated_at
  BEFORE UPDATE ON billing.key_issuance_policies
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
