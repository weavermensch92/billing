-- ============================================================
-- billing.api_keys.team_id 추가 — 팀 단위 키 발급 지원
--
-- 배경:
--   현재 api_keys 는 (org_id, account_id) 만 가짐. "팀별로 다른 키"
--   가 필요한 케이스 (팀 분리·예산 분리·접근 권한 분리) 를 지원 못 함.
--
-- 의미:
--   team_id = NULL  → org 전체용 키 (기존 행위, default)
--   team_id = UUID  → 해당 팀 전용 키 (새 발급 단위)
--
-- 마이그레이션 정책:
--   - 컬럼은 NULLABLE (기존 row 영향 0).
--   - ON DELETE SET NULL — 팀 삭제 시 키 보존, 단순 org-wide 로 강등.
--   - RLS 변경 없음 (org_id 기준 격리 유지). 팀별 가시성 분리는
--     별도 PR 에서 member.role 분기로 추가.
-- ============================================================

ALTER TABLE billing.api_keys
  ADD COLUMN IF NOT EXISTS team_id UUID
    REFERENCES billing.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_team
  ON billing.api_keys(team_id, status)
  WHERE team_id IS NOT NULL;

COMMENT ON COLUMN billing.api_keys.team_id IS
  'NULL = org 전체용 키. UUID = 해당 팀 전용. 팀 삭제 시 NULL 로 강등 (키 자체는 보존).';
