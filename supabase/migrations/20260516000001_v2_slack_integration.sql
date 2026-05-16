-- ============================================================
-- Gridge Billing MSP v2.0 — M-1010 slack_integration (콘솔 운영)
-- ============================================================
-- 목적: Gridge 내부 운영 Slack 봇 설정을 웹에서 직접 관리 (env 대체).
--       Super 가 토큰·signing secret·채널 매핑을 콘솔에서 등록·수정.
--       토큰류는 Supabase Vault 에 암호화 저장하고 본 테이블은 vault id 만 참조.
-- 의존: billing.admin_users (P1), Supabase Vault (vault.secrets 기본 활성)
-- 운영 정책:
--   - 싱글톤 테이블 (config_key='global' 단일 행)
--   - 모든 admin 읽기 가능 (운영 상태 확인용), Super 만 변경
--   - 토큰 자체는 본 테이블에 없음 — vault.decrypted_secrets 경유 service-role 만 복호화
-- ============================================================

CREATE TABLE IF NOT EXISTS billing.slack_integration (
  config_key                  TEXT PRIMARY KEY DEFAULT 'global'
                                CHECK (config_key = 'global'),

  -- Vault 참조 (실제 토큰은 vault.secrets 에 암호화 저장)
  bot_token_vault_id          UUID,                -- xoxb-... (chat.postMessage 용)
  signing_secret_vault_id     UUID,                -- Slack signing secret (events 검증)

  -- 워크스페이스 메타 (auth.test 결과 캐시)
  workspace_name              TEXT,
  workspace_id                TEXT,                -- Slack team_id (TXXXXXXXX)
  bot_user_id                 TEXT,                -- UXXXXXXXX
  bot_handle                  TEXT,                -- @gridge-billing 등 표시용

  -- 채널 매핑 (현재 운영 채널)
  tax_invoice_channel_id      TEXT,
  tax_invoice_channel_name    TEXT,                -- 표시용 #tax-invoice
  payment_alerts_channel_id   TEXT,
  payment_alerts_channel_name TEXT,

  -- 상태
  is_active                   BOOLEAN NOT NULL DEFAULT FALSE,
  last_test_at                TIMESTAMPTZ,
  last_test_result            TEXT,                -- 'success' / 'token_invalid' / 'channel_not_found' / ...
  last_test_error             TEXT,                -- 실패 시 에러 메시지

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  created_by_admin_id         UUID REFERENCES billing.admin_users(id),
  updated_by_admin_id         UUID REFERENCES billing.admin_users(id)
);

-- updated_at 자동 갱신
CREATE TRIGGER slack_integration_updated_at
  BEFORE UPDATE ON billing.slack_integration
  FOR EACH ROW
  EXECUTE FUNCTION billing.set_updated_at();

-- RLS
ALTER TABLE billing.slack_integration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can read slack_integration"
  ON billing.slack_integration FOR SELECT
  USING (billing.is_admin_user());

CREATE POLICY "super can manage slack_integration"
  ON billing.slack_integration FOR ALL
  USING (billing.admin_role() = 'super');
