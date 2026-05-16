-- ============================================================
-- billing.api_keys 정식 DDL (벤더 키 대행 발급 — 축 A)
--
-- 배경:
--   lib/billing/key-issuance/executor.ts 가 billing.api_keys 를 참조하나
--   기존 마이그레이션에 DDL 이 누락된 상태. 코드는 작동 중 (런타임 INSERT)
--   이지만 마이그레이션 정합성이 깨져 있어 새 환경 마이그레이션 시 깨짐.
--   본 마이그레이션이 정식 스키마를 명시.
--
--   보안 보강:
--     기존 executor 는 key_value 평문을 INSERT 했음. 본 PR 에서
--     executor.ts 를 SHA-256 hash + prefix 로 교체. 본 마이그레이션은
--     양쪽 호환을 위해 컬럼을 모두 보유 (운영 backfill 후 별도 PR 에서
--     key_value 컬럼 DROP 예정).
--
-- 멱등성:
--   - CREATE TABLE IF NOT EXISTS
--   - 컬럼은 ADD COLUMN IF NOT EXISTS 로 (이미 운영에 다른 모양의
--     api_keys 가 있을 경우 충돌 회피)
-- ============================================================

CREATE TABLE IF NOT EXISTS billing.api_keys (
  idx               BIGSERIAL PRIMARY KEY,
  id                UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  org_id            UUID NOT NULL REFERENCES billing.orgs(id),
  account_id        UUID NOT NULL REFERENCES billing.accounts(id),
  provider          TEXT NOT NULL,                        -- 'anthropic' | 'openai' | ...
  provider_key_id   TEXT NOT NULL,                        -- 벤더 측 키 ID

  -- 보안 컬럼 (PR #1 에서 executor 가 사용)
  key_hash          TEXT,                                  -- SHA-256(plaintext) hex
  key_prefix        TEXT,                                  -- 노출용 12자 prefix
  key_vault_id      UUID,                                  -- 회전·재노출 필요 시 vault 참조

  -- 보안 부채 — backfill 후 별도 PR 에서 DROP 예정
  key_value         TEXT,                                  -- DEPRECATED 평문. 운영 backfill 후 DROP.

  label             TEXT,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','rotating','revoked')),

  issued_by         UUID REFERENCES billing.members(id),
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  revoked_at        TIMESTAMPTZ,
  last_used_at      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

-- 이미 운영 DB 에 다른 모양의 api_keys 가 있을 수 있으므로 누락 컬럼 보충
ALTER TABLE billing.api_keys ADD COLUMN IF NOT EXISTS key_hash     TEXT;
ALTER TABLE billing.api_keys ADD COLUMN IF NOT EXISTS key_prefix   TEXT;
ALTER TABLE billing.api_keys ADD COLUMN IF NOT EXISTS key_vault_id UUID;
ALTER TABLE billing.api_keys ADD COLUMN IF NOT EXISTS key_value    TEXT;
ALTER TABLE billing.api_keys ADD COLUMN IF NOT EXISTS label        TEXT;
ALTER TABLE billing.api_keys ADD COLUMN IF NOT EXISTS revoked_at   TIMESTAMPTZ;
ALTER TABLE billing.api_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_api_keys_org_status
  ON billing.api_keys (org_id, status);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix
  ON billing.api_keys (key_prefix)
  WHERE key_prefix IS NOT NULL AND status != 'revoked';

-- provider + provider_key_id 유니크 (동일 벤더 키 중복 등록 방지)
DROP INDEX IF EXISTS billing.uq_api_keys_provider_key_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_provider_key_id
  ON billing.api_keys (provider, provider_key_id);

-- updated_at 자동 갱신
DROP TRIGGER IF EXISTS trg_api_keys_updated_at ON billing.api_keys;
CREATE TRIGGER trg_api_keys_updated_at
  BEFORE UPDATE ON billing.api_keys
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();

COMMENT ON TABLE  billing.api_keys IS
  '외부 벤더 키 대행 발급 (축 A). 평문은 key_value (DEPRECATED) → 점진적으로 key_hash + key_prefix 로 이전. 운영 backfill 후 key_value DROP 예정.';
COMMENT ON COLUMN billing.api_keys.key_value IS
  'DEPRECATED. 평문 키. 보안 부채 — backfill 완료 후 별도 PR 에서 DROP.';
COMMENT ON COLUMN billing.api_keys.key_hash IS
  'SHA-256(plaintext) hex. 인증 시 입력 비교만, 역산 불가.';


-- ─── RLS ────────────────────────────────────────────────────
ALTER TABLE billing.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super can manage api_keys" ON billing.api_keys;
DROP POLICY IF EXISTS "members can read own org api_keys" ON billing.api_keys;

CREATE POLICY "super can manage api_keys"
  ON billing.api_keys FOR ALL
  USING (billing.admin_role() = 'super')
  WITH CHECK (billing.admin_role() = 'super');

-- 고객은 본인 org 의 non-revoked 키 조회 (Owner/Admin)
CREATE POLICY "members can read own org api_keys"
  ON billing.api_keys FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND status != 'revoked'
    AND billing.my_role() IN ('owner','admin')
  );
