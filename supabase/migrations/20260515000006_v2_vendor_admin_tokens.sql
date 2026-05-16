-- ============================================================
-- Gridge Billing MSP v2.0 — M-1004 vendor_admin_tokens
-- 카드 교체 후 1회 수동 등록한 벤더 Admin Token 보관·회전
-- 의존: billing.orgs, billing.admin_users
-- ============================================================

-- ─── 1. vendor_admin_tokens — 토큰 보관 ──────────────────
-- 암호화 컬럼은 BYTEA. 앱 레이어에서 AES-256-GCM 등으로 암호화 후 INSERT.
-- DB는 평문 토큰을 절대 저장하지 않음 (RLS + 컬럼 마스킹 정책).
CREATE TABLE IF NOT EXISTS billing.vendor_admin_tokens (
  idx                  BIGSERIAL PRIMARY KEY,
  id                   UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id               UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,

  vendor               TEXT NOT NULL,                  -- anthropic | openai | cursor | ...
  vendor_workspace_id  TEXT NOT NULL,
  token_label          TEXT NOT NULL,                  -- 사람이 식별할 라벨 (예: "Anthropic Workspace-Acme")

  token_encrypted      BYTEA NOT NULL,                 -- 앱 레이어 암호화 (절대 평문 X)
  token_hash           TEXT NOT NULL,                  -- SHA-256 hex (중복·변경 감지)
  token_prefix         TEXT,                           -- 첫 8자 마스킹 표시용 (예: "sk-ant-..")

  token_meta           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- scopes, role, vendor-specific 메타

  issued_at            TIMESTAMPTZ,                    -- 벤더가 발급한 시각 (알려진 경우)
  registered_at        TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  expires_at           TIMESTAMPTZ,                    -- 벤더 정책 기반 만료 (있다면)

  last_used_at         TIMESTAMPTZ,
  last_used_for        TEXT,                           -- member_sync | key_issuance | invoice_fetch | ...
  use_count            BIGINT NOT NULL DEFAULT 0,

  -- 회전·폐기
  rotated_at           TIMESTAMPTZ,
  rotated_to_token_id  UUID REFERENCES billing.vendor_admin_tokens(id),
  revoked_at           TIMESTAMPTZ,
  revoked_by           UUID REFERENCES billing.admin_users(id),
  revoked_reason       TEXT,

  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','rotated','revoked','expired')),

  registered_by        UUID REFERENCES billing.admin_users(id),  -- 등록한 슈퍼어드민 또는 NULL = 고객 본인
  registered_by_member_id UUID,                                  -- 고객 어드민 (members.id)

  created_at           TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),

  UNIQUE (vendor, token_hash)
);

CREATE INDEX idx_vendor_tokens_org_active
  ON billing.vendor_admin_tokens(org_id, vendor)
  WHERE status = 'active';
CREATE INDEX idx_vendor_tokens_expiring
  ON billing.vendor_admin_tokens(expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;

COMMENT ON TABLE billing.vendor_admin_tokens IS
  'Q4-1 A: 카드 교체 후 1회 수동 등록 토큰. token_encrypted는 앱 레이어 암호화. 평문은 DB에 없음.';
COMMENT ON COLUMN billing.vendor_admin_tokens.token_encrypted IS
  'BYTEA. 애플리케이션 레이어에서 AES-256-GCM 등으로 암호화 후 INSERT. 키 관리는 KMS/Vault.';
COMMENT ON COLUMN billing.vendor_admin_tokens.token_prefix IS
  '첫 8자만 평문 보관. UI 마스킹 표시용 (예: "sk-ant-..."). 식별 가능하되 토큰 자체는 노출 X.';


-- ─── 2. Org × Vendor × Workspace 당 active 토큰 1개만 강제 ─
CREATE UNIQUE INDEX uniq_active_token_per_workspace
  ON billing.vendor_admin_tokens(org_id, vendor, vendor_workspace_id)
  WHERE status = 'active';


-- ─── 3. mark_token_used — 사용 시 호출 (last_used_at·count 갱신) ─
CREATE OR REPLACE FUNCTION billing.mark_token_used(
  p_token_id  UUID,
  p_used_for  TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE billing.vendor_admin_tokens
    SET last_used_at = billing.now_utc(),
        last_used_for = p_used_for,
        use_count = use_count + 1,
        updated_at = billing.now_utc()
    WHERE id = p_token_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 4. rotate_vendor_token — 회전 함수 ──────────────────
-- 신규 토큰 등록 후 기존 토큰을 rotated 상태로 전이 + 연결
CREATE OR REPLACE FUNCTION billing.rotate_vendor_token(
  p_old_token_id   UUID,
  p_new_token_id   UUID,
  p_rotated_by     UUID
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE billing.vendor_admin_tokens
    SET status = 'rotated',
        rotated_at = billing.now_utc(),
        rotated_to_token_id = p_new_token_id,
        revoked_by = p_rotated_by,
        updated_at = billing.now_utc()
    WHERE id = p_old_token_id
      AND status = 'active';
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 5. 만료 처리 배치 ──────────────────────────────────
CREATE OR REPLACE FUNCTION billing.expire_vendor_tokens()
RETURNS INT AS $$
DECLARE v_count INT;
BEGIN
  UPDATE billing.vendor_admin_tokens
    SET status = 'expired', updated_at = billing.now_utc()
    WHERE status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at <= billing.now_utc();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 6. RLS — 토큰 자체는 슈퍼어드민만 read (고객도 자기 메타만) ─
ALTER TABLE billing.vendor_admin_tokens ENABLE ROW LEVEL SECURITY;

-- 슈퍼어드민: 전체
CREATE POLICY vendor_tokens_admin_all ON billing.vendor_admin_tokens
  FOR ALL USING (billing.is_admin_user());

-- 고객 어드민: 자기 Org의 메타 read (token_encrypted·token_hash는 별도 함수 통해서만)
CREATE POLICY vendor_tokens_org_read ON billing.vendor_admin_tokens
  FOR SELECT USING (
    org_id = billing.my_org_id()
    AND billing.my_role() IN ('owner','admin')
  );
-- INSERT는 함수 통해 (RLS 통과 위해 SECURITY DEFINER 함수 사용 권장)

CREATE TRIGGER trg_vendor_tokens_updated_at
  BEFORE UPDATE ON billing.vendor_admin_tokens
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
