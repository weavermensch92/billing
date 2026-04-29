-- ============================================================
-- Vendor Admin API 연동 (Phase 1 POC — Anthropic Admin API)
-- accounts 에 벤더 측 식별자 매핑 + 호출 감사 테이블
-- ============================================================

-- ─── accounts 확장: 벤더 측 식별자 ──────────────────────
-- provider_user_id: Anthropic organization member id / OpenAI user id
-- provider_invite_id: 초대 진행 중 id (승인 전 상태 추적)
-- provider_resource_id: workspace/project 등 상위 리소스 (향후)
ALTER TABLE billing.accounts
  ADD COLUMN IF NOT EXISTS provider_user_id     TEXT,
  ADD COLUMN IF NOT EXISTS provider_invite_id   TEXT,
  ADD COLUMN IF NOT EXISTS provider_resource_id TEXT;

COMMENT ON COLUMN billing.accounts.provider_user_id IS
  '벤더 측 사용자 식별자 (Anthropic member_id / OpenAI user_id). admin_api 모드 서비스에서만 set.';
COMMENT ON COLUMN billing.accounts.provider_invite_id IS
  '벤더 초대 진행 id. 초대 수락 전 상태에서 revoke 하려면 필요.';

CREATE INDEX IF NOT EXISTS idx_accounts_provider_user
  ON billing.accounts(provider_user_id)
  WHERE provider_user_id IS NOT NULL;

-- ─── vendor_api_calls — 호출 감사 (Immutable) ───────────
CREATE TABLE IF NOT EXISTS billing.vendor_api_calls (
  idx              BIGSERIAL PRIMARY KEY,
  id               UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id           UUID NOT NULL REFERENCES billing.orgs(id),
  vendor           TEXT NOT NULL
                     CHECK (vendor IN ('anthropic','openai','google','cursor')),
  operation        TEXT NOT NULL
                     CHECK (operation IN (
                       'invite_member','remove_member','list_members',
                       'set_spend_limit','get_usage','create_api_key','revoke_api_key'
                     )),
  account_id       UUID REFERENCES billing.accounts(id),
  request_id       UUID REFERENCES billing.action_requests(id),
  http_status      INT,
  success          BOOLEAN NOT NULL DEFAULT FALSE,
  request_body     JSONB NOT NULL DEFAULT '{}',
  response_body    JSONB NOT NULL DEFAULT '{}',
  provider_ref     TEXT,     -- 반환된 provider 식별자 (invite_id / user_id)
  error_message    TEXT,
  latency_ms       INT,
  is_mock          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

-- Immutable (PB-005 준수)
CREATE RULE vendor_api_calls_no_update AS ON UPDATE TO billing.vendor_api_calls DO INSTEAD NOTHING;
CREATE RULE vendor_api_calls_no_delete AS ON DELETE TO billing.vendor_api_calls DO INSTEAD NOTHING;

CREATE INDEX IF NOT EXISTS idx_vendor_calls_org_created
  ON billing.vendor_api_calls(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_calls_account
  ON billing.vendor_api_calls(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_calls_request
  ON billing.vendor_api_calls(request_id) WHERE request_id IS NOT NULL;

COMMENT ON TABLE billing.vendor_api_calls IS
  '벤더 Admin API 호출 감사 로그. Immutable. PCI/컴플라이언스 요건 + 디버깅 용도.';
COMMENT ON COLUMN billing.vendor_api_calls.is_mock IS
  'NEXT_PUBLIC_MOCK_MODE=true 상태에서 실행된 호출. 실제 벤더 호출 X.';

-- RLS: 콘솔 전용 (admin_users), 고객 포털 노출 안 함
ALTER TABLE billing.vendor_api_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_api_calls_admin_read
  ON billing.vendor_api_calls FOR SELECT
  TO authenticated
  USING (billing.is_admin_user());

CREATE POLICY vendor_api_calls_admin_insert
  ON billing.vendor_api_calls FOR INSERT
  TO authenticated
  WITH CHECK (billing.is_admin_user());
