-- ============================================================
-- members 소프트 삭제 + 삭제함 흐름
--
-- 추가:
--   deleted_at         TIMESTAMPTZ        — NULL = 활성, NOT NULL = 삭제함
--   deleted_by_admin_id UUID              — 어느 Super 가 삭제했는지 추적
--
-- 의미:
--   소프트 삭제 = status 그대로 유지 + deleted_at = now()
--   복구       = deleted_at = NULL
--   재초대(동일 org, 동일 email) 시 trash row 발견되면 새 row INSERT
--                대신 복원 (status='invited' 로 리셋)
--
-- 영향:
--   - 기존 status='active' WHERE 조회는 그대로 작동 (소프트 삭제하면
--     로그인 차단할 거면 status='offboarded' 까지 같이 바꾸지만, 본
--     마이그레이션에서는 status 는 건드리지 않음 — application code 책임)
--   - 콘솔에서 trash 목록은 deleted_at IS NOT NULL 로 필터
-- ============================================================

ALTER TABLE billing.members
  ADD COLUMN IF NOT EXISTS deleted_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_admin_id UUID REFERENCES billing.admin_users(id);

-- 활성 멤버 빠른 조회 + (org, email) 유니크 보장은 application 단에서 처리
CREATE INDEX IF NOT EXISTS idx_members_deleted_at
  ON billing.members (deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN billing.members.deleted_at IS
  'Soft delete timestamp. NULL=활성, NOT NULL=삭제함(trash). 콘솔 Super 가 삭제 시 설정.';
COMMENT ON COLUMN billing.members.deleted_by_admin_id IS
  '소프트 삭제를 수행한 관리자(admin_users.id). 감사용.';
