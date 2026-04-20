-- ============================================================
-- Sprint 2 검토 — Auth 통합 + Realtime publication + invite 플로우
-- ============================================================

-- ─── 1. admin_users.user_id 추가 (auth.users 연결) ────────────
ALTER TABLE billing.admin_users
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT;

COMMENT ON COLUMN billing.admin_users.user_id IS
  'Supabase Auth user id. signInWithPassword 로그인 후 매칭.';

-- admin_role() 헬퍼 함수 user_id 기준으로 변경
CREATE OR REPLACE FUNCTION billing.is_admin_user() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM billing.admin_users
    WHERE user_id = auth.uid() AND is_active = TRUE
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION billing.admin_role() RETURNS TEXT AS $$
  SELECT role FROM billing.admin_users
  WHERE user_id = auth.uid() AND is_active = TRUE
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ─── 2. Supabase Auth 신규 가입 시 members.user_id 자동 매칭 ──
-- invited 상태 멤버가 같은 이메일로 가입하면 user_id 채우고 active 전환
CREATE OR REPLACE FUNCTION billing.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  -- members 테이블: invited 상태인 동일 이메일 레코드 찾아 active로 전환
  UPDATE billing.members
  SET user_id = NEW.id,
      status = 'active',
      joined_at = billing.now_utc()
  WHERE email = NEW.email
    AND status = 'invited'
    AND user_id IS NULL;

  -- admin_users 테이블: 동일 이메일 레코드가 있고 user_id가 NULL이면 채움
  UPDATE billing.admin_users
  SET user_id = NEW.id
  WHERE email = NEW.email
    AND is_active = TRUE
    AND user_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION billing.handle_new_auth_user();

-- ─── 3. Realtime publication 추가 (billing 스키마 노출) ───────
-- Supabase는 기본 supabase_realtime publication에 public 스키마만 포함.
-- billing 테이블을 Realtime 대상으로 추가.
ALTER PUBLICATION supabase_realtime ADD TABLE billing.action_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE billing.request_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE billing.request_events;
ALTER PUBLICATION supabase_realtime ADD TABLE billing.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE billing.virtual_cards;

-- ─── 4. billing 스키마를 API에 노출 ──────────────────────────
-- PostgREST가 billing 스키마를 인식하도록 설정.
-- Supabase CLI/Dashboard에서도 Settings → API → Exposed schemas 에 'billing' 추가 필요.
GRANT USAGE ON SCHEMA billing TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA billing TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA billing TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA billing TO anon, authenticated, service_role;

-- 향후 테이블에도 자동 적용
ALTER DEFAULT PRIVILEGES IN SCHEMA billing
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA billing
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA billing
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
