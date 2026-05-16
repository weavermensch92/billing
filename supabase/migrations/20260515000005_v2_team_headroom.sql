-- ============================================================
-- Gridge Billing MSP v2.0 — M-1007 teams + team_headroom
-- 2단 헤드룸: 팀 우선 → Org fallback (잔액 → headroom 순차 소진의 일부)
-- 의존: billing.orgs (P1), billing.members (P1), billing.admin_users (P1)
-- 기존 self_approval_headroom (Org 1단) 위에 팀 단계 추가
-- ============================================================

-- ─── 1. teams — 고객 Org 내부 팀 계층 ─────────────────────
-- 단순 1뎁스. 추후 parent_team_id로 트리 확장 가능
CREATE TABLE IF NOT EXISTS billing.teams (
  idx              BIGSERIAL PRIMARY KEY,
  id               UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id           UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  parent_team_id   UUID REFERENCES billing.teams(id),  -- 추후 트리 확장용
  is_unassigned    BOOLEAN NOT NULL DEFAULT FALSE,     -- "미할당" 시스템 팀 플래그
  created_at       TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),

  UNIQUE (org_id, name)
);

-- Org당 "미할당" 팀 1개만
CREATE UNIQUE INDEX uniq_org_unassigned_team
  ON billing.teams(org_id)
  WHERE is_unassigned = TRUE;

-- 모든 Org에 기본 "미할당" 팀 자동 생성 트리거
CREATE OR REPLACE FUNCTION billing.create_default_unassigned_team()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO billing.teams (org_id, name, is_unassigned)
    VALUES (NEW.id, '미할당', TRUE)
    ON CONFLICT (org_id, name) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_org_insert_default_unassigned_team
  AFTER INSERT ON billing.orgs
  FOR EACH ROW EXECUTE FUNCTION billing.create_default_unassigned_team();

COMMENT ON TABLE billing.teams IS
  '고객 Org 내부 팀. "미할당" 팀은 시스템 팀으로 Org 생성 시 자동 INSERT.';


-- ─── 2. members.team_id 확장 — 멤버를 팀에 배치 ──────────
ALTER TABLE billing.members
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES billing.teams(id);

CREATE INDEX IF NOT EXISTS idx_members_team
  ON billing.members(team_id)
  WHERE team_id IS NOT NULL;

COMMENT ON COLUMN billing.members.team_id IS
  '멤버의 팀 소속. NULL이면 "미할당" 팀(자동)으로 간주.';


-- ─── 3. team_headroom — 팀별 헤드룸 (Org 헤드룸 하위) ─────
CREATE TABLE IF NOT EXISTS billing.team_headroom (
  team_id              UUID PRIMARY KEY REFERENCES billing.teams(id) ON DELETE CASCADE,
  org_id               UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,

  headroom_limit_krw   BIGINT NOT NULL DEFAULT 0 CHECK (headroom_limit_krw >= 0),
  headroom_used_krw    BIGINT NOT NULL DEFAULT 0 CHECK (headroom_used_krw >= 0),

  CONSTRAINT team_used_lte_limit
    CHECK (headroom_used_krw <= headroom_limit_krw),

  reset_at             TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),  -- 다음 결제일에 0 리셋
  created_at           TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

CREATE INDEX idx_team_headroom_org
  ON billing.team_headroom(org_id, reset_at);

COMMENT ON TABLE billing.team_headroom IS
  '팀별 헤드룸. 고객 어드민이 Org headroom 일부를 팀에 분배. 차감 시 팀 우선 → Org fallback.';


-- ─── 4. consume_team_headroom — 팀 우선 차감 원자 함수 ────
-- 반환: success = 차감 성공 여부 (팀 또는 Org에서)
--      consumed_from = 'team' | 'org' | 'both' | 'none'
--      team_consumed_krw, org_consumed_krw
CREATE OR REPLACE FUNCTION billing.consume_team_headroom(
  p_team_id      UUID,
  p_amount_krw   BIGINT
) RETURNS TABLE (
  success            BOOLEAN,
  consumed_from      TEXT,
  team_consumed_krw  BIGINT,
  org_consumed_krw   BIGINT
) AS $$
DECLARE
  v_org_id        UUID;
  v_team_avail    BIGINT;
  v_team_take     BIGINT;
  v_org_take      BIGINT;
  v_org_ok        BOOLEAN;
BEGIN
  IF p_amount_krw <= 0 THEN
    RAISE EXCEPTION 'amount must be positive (got %)', p_amount_krw;
  END IF;

  -- 팀 정보 + 가용분 조회 (락)
  SELECT th.org_id, (th.headroom_limit_krw - th.headroom_used_krw)
    INTO v_org_id, v_team_avail
    FROM billing.team_headroom th
    WHERE th.team_id = p_team_id
    FOR UPDATE;

  IF NOT FOUND THEN
    -- 팀 헤드룸 row 없음 → Org headroom으로만 시도
    v_team_take := 0;
    SELECT t.org_id INTO v_org_id FROM billing.teams t WHERE t.id = p_team_id;
  ELSE
    v_team_take := LEAST(v_team_avail, p_amount_krw);
    IF v_team_take > 0 THEN
      UPDATE billing.team_headroom
        SET headroom_used_krw = headroom_used_krw + v_team_take,
            updated_at = billing.now_utc()
        WHERE team_id = p_team_id;
    END IF;
  END IF;

  v_org_take := p_amount_krw - v_team_take;

  IF v_org_take = 0 THEN
    -- 팀만으로 충당
    RETURN QUERY SELECT TRUE, 'team'::TEXT, v_team_take, 0::BIGINT;
    RETURN;
  END IF;

  -- 부족분을 Org headroom으로 시도 (기존 consume_self_approval 활용)
  v_org_ok := billing.consume_self_approval(v_org_id, v_org_take);

  IF v_org_ok THEN
    IF v_team_take > 0 THEN
      RETURN QUERY SELECT TRUE, 'both'::TEXT, v_team_take, v_org_take;
    ELSE
      RETURN QUERY SELECT TRUE, 'org'::TEXT, 0::BIGINT, v_org_take;
    END IF;
    RETURN;
  END IF;

  -- 실패: 팀에서 빠진 거 롤백
  IF v_team_take > 0 THEN
    UPDATE billing.team_headroom
      SET headroom_used_krw = headroom_used_krw - v_team_take,
          updated_at = billing.now_utc()
      WHERE team_id = p_team_id;
  END IF;

  RETURN QUERY SELECT FALSE, 'none'::TEXT, 0::BIGINT, 0::BIGINT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.consume_team_headroom IS
  '팀 우선 → Org fallback 헤드룸 차감. 실패 시 팀 차감 자동 롤백. wallet 소진 후 호출 (잔액→헤드룸 순차).';


-- ─── 5. reset_team_headroom_for_org — Org 결제일 리셋 ────
-- 기존 reset_self_approval_usage 와 짝 — Org 결제일 도래 시 둘 다 리셋
CREATE OR REPLACE FUNCTION billing.reset_team_headroom_for_org(p_org_id UUID)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE billing.team_headroom
    SET headroom_used_krw = 0,
        reset_at = billing.now_utc(),
        updated_at = billing.now_utc()
    WHERE org_id = p_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 5-2. 팀 헤드룸 총합 검증 — Org 한도 초과 차단 ────────
-- Q-V4 D: 고객 어드민이 팀별 분배 시 합계가 Org headroom 초과 못 함
-- BEFORE INSERT/UPDATE 트리거로 검증
CREATE OR REPLACE FUNCTION billing.validate_team_headroom_sum()
RETURNS TRIGGER AS $$
DECLARE
  v_org_limit   BIGINT;
  v_sum_limit   BIGINT;
BEGIN
  -- Org의 headroom 한도 조회
  SELECT self_approval_headroom_krw INTO v_org_limit
    FROM billing.orgs
    WHERE id = NEW.org_id;

  IF v_org_limit IS NULL THEN
    v_org_limit := 0;
  END IF;

  -- 변경 후 팀 headroom 합계 계산 (현재 row 제외 + NEW 추가)
  SELECT COALESCE(SUM(headroom_limit_krw), 0) INTO v_sum_limit
    FROM billing.team_headroom
    WHERE org_id = NEW.org_id
      AND team_id <> NEW.team_id;

  v_sum_limit := v_sum_limit + NEW.headroom_limit_krw;

  IF v_sum_limit > v_org_limit THEN
    RAISE EXCEPTION 'team_headroom 합계(%) > Org headroom 한도(%). Org 한도 먼저 증액 필요.',
                    v_sum_limit, v_org_limit;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_team_headroom_validate_sum
  BEFORE INSERT OR UPDATE OF headroom_limit_krw, org_id ON billing.team_headroom
  FOR EACH ROW EXECUTE FUNCTION billing.validate_team_headroom_sum();

COMMENT ON FUNCTION billing.validate_team_headroom_sum IS
  '팀 헤드룸 합계 ≤ Org headroom 검증. Q-V4 D. 초과 시 EXCEPTION (고객 어드민 화면에 표시).';

-- 매일 호출되는 결제일 리셋 잡 (pg_cron)
-- Org별 billing_day_of_month (M-1002에서 추가)와 오늘 날짜 매칭
CREATE OR REPLACE FUNCTION billing.daily_headroom_reset()
RETURNS INT AS $$
DECLARE
  v_total_orgs INT := 0;
  v_org RECORD;
BEGIN
  FOR v_org IN
    SELECT id FROM billing.orgs
      WHERE status = 'active'
        AND billing_day_of_month = EXTRACT(DAY FROM billing.now_utc())::INT
  LOOP
    PERFORM billing.reset_self_approval_usage_for_org(v_org.id);
    PERFORM billing.reset_team_headroom_for_org(v_org.id);
    v_total_orgs := v_total_orgs + 1;
  END LOOP;
  RETURN v_total_orgs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.daily_headroom_reset IS
  '매일 KST 00:00 pg_cron 호출. 오늘이 결제일인 Org만 Org+팀 헤드룸 리셋.';

-- 단일 Org reset 함수 (기존 self_approval 리셋의 Org-targeted 버전)
-- 기존 reset_self_approval_usage()는 모든 Org 일괄이라 별도 추가
CREATE OR REPLACE FUNCTION billing.reset_self_approval_usage_for_org(p_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE billing.orgs
    SET self_approval_used_krw = 0,
        self_approval_reset_at = billing.now_utc(),
        updated_at = billing.now_utc()
    WHERE id = p_org_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 6. shadow_member_findings.assigned_team_id FK 추가 ──
-- M-1005에서 FK 미지정 상태로 만든 컬럼에 FK 적용
ALTER TABLE billing.shadow_member_findings
  ADD CONSTRAINT fk_shadow_assigned_team
    FOREIGN KEY (assigned_team_id) REFERENCES billing.teams(id);


-- ─── 7. RLS 정책 ──────────────────────────────────────────
ALTER TABLE billing.teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.team_headroom ENABLE ROW LEVEL SECURITY;

-- 팀: 고객 어드민·팀 멤버는 자기 Org만, 슈퍼어드민은 전체
CREATE POLICY teams_org_read ON billing.teams
  FOR SELECT USING (org_id = billing.my_org_id());
CREATE POLICY teams_org_admin_write ON billing.teams
  FOR ALL USING (
    org_id = billing.my_org_id()
    AND billing.my_role() IN ('owner','admin')
  );
CREATE POLICY teams_admin_all ON billing.teams
  FOR ALL USING (billing.is_admin_user());

-- 팀 헤드룸: 고객 어드민이 write, 모든 Org 멤버가 read
CREATE POLICY team_headroom_org_read ON billing.team_headroom
  FOR SELECT USING (org_id = billing.my_org_id());
CREATE POLICY team_headroom_org_admin_write ON billing.team_headroom
  FOR ALL USING (
    org_id = billing.my_org_id()
    AND billing.my_role() IN ('owner','admin')
  );
CREATE POLICY team_headroom_admin_all ON billing.team_headroom
  FOR ALL USING (billing.is_admin_user());

CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON billing.teams
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();

CREATE TRIGGER trg_team_headroom_updated_at
  BEFORE UPDATE ON billing.team_headroom
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
