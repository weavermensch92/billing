-- ============================================================
-- Gridge AI API 관리 센터 — 게이트웨이 도메인 신설 (PR #1 / 5)
--
-- 두 축 분리:
--   (A) 외부 벤더 키 대행 = 기존 billing.api_keys (별도 마이그레이션 …5)
--   (B) Gridge 게이트웨이 = 본 마이그레이션의 3개 테이블
--
-- (B) 의 핵심 테이블:
--   gridge_api_products      — 상품 카탈로그 (등급/단가/upstream 매핑)
--   gridge_api_keys          — Org × Product 키 (SHA-256 해시 저장)
--   gridge_api_usage_events  — Immutable 호출 이력 + cost_krw
--
-- UI / 라우팅은 PR #2~#5 에서 추가. 본 PR 은 DDL + RLS 만.
--
-- 보안 원칙:
--   - 평문 키는 절대 저장 안 함. key_hash (SHA-256) + key_prefix(12자) 만.
--   - 평문은 발급 응답에서 1회만 노출.
--   - 모든 변경 audit_logs (visibility 적절히).
--
-- 라우팅 미구현 상태에서 PR #1 머지 → 빈 테이블만 존재. 안전.
-- ============================================================

-- ─── 1. gridge_api_products ────────────────────────────────
-- Super 가 등록하는 게이트웨이 상품. services 와 1:N (한 service 아래 v1/v1-pro/v2 등급).
CREATE TABLE IF NOT EXISTS billing.gridge_api_products (
  idx             BIGSERIAL PRIMARY KEY,
  id              UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  service_id      UUID NOT NULL REFERENCES billing.services(id),
  code            TEXT NOT NULL UNIQUE,               -- 예: 'gridge-ai-v1', 'gridge-ai-v1-pro'
  tier            TEXT NOT NULL DEFAULT 'standard'
                    CHECK (tier IN ('standard','pro','enterprise')),
  display_name    TEXT NOT NULL,
  description     TEXT,

  -- 단가 (per 1k tokens, KRW)
  input_price_per_1k_krw   NUMERIC(12,4) NOT NULL CHECK (input_price_per_1k_krw  >= 0),
  output_price_per_1k_krw  NUMERIC(12,4) NOT NULL CHECK (output_price_per_1k_krw >= 0),
  min_charge_krw           INTEGER       NOT NULL DEFAULT 0 CHECK (min_charge_krw >= 0),

  -- Upstream 라우팅 (PR #5 에서 사용)
  upstream_vendor          TEXT NOT NULL
                             CHECK (upstream_vendor IN ('anthropic','openai','google','self')),
  upstream_model           TEXT NOT NULL,           -- 예: 'claude-sonnet-4-5'
  upstream_admin_token_id  UUID REFERENCES billing.vendor_admin_tokens(id), -- NULL = env 키 사용

  -- 정책
  rate_limit_rpm   INTEGER NOT NULL DEFAULT 60   CHECK (rate_limit_rpm > 0),
  daily_token_cap  INTEGER,                      -- NULL = 무제한
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  released_at      TIMESTAMPTZ,
  deprecated_at    TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

CREATE INDEX IF NOT EXISTS idx_gridge_api_products_active
  ON billing.gridge_api_products (is_active, released_at)
  WHERE is_active = TRUE;

CREATE TRIGGER trg_gridge_api_products_updated_at
  BEFORE UPDATE ON billing.gridge_api_products
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();

COMMENT ON TABLE  billing.gridge_api_products IS
  'Gridge 게이트웨이 (api.gridge.ai) 의 API 상품 카탈로그. Super 가 관리. RLS: Super manage / 고객 is_active 만 read.';
COMMENT ON COLUMN billing.gridge_api_products.upstream_vendor IS
  '내부 라우팅 대상. 고객 노출 면에는 마스킹 (G-004 외부 노출 금지어 컴플라이언스).';


-- ─── 2. gridge_api_keys ────────────────────────────────────
-- Org × Product 키. 평문은 절대 저장하지 않음 — SHA-256 해시 + 12자 prefix 만.
CREATE TABLE IF NOT EXISTS billing.gridge_api_keys (
  idx               BIGSERIAL PRIMARY KEY,
  id                UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  org_id            UUID NOT NULL REFERENCES billing.orgs(id),
  product_id        UUID NOT NULL REFERENCES billing.gridge_api_products(id),
  account_id        UUID REFERENCES billing.accounts(id),  -- 선택: 멤버 귀속 시

  key_prefix        TEXT NOT NULL,                  -- 예: 'gk_live_ab12' (12~16자, 노출용)
  key_hash          TEXT NOT NULL,                  -- SHA-256(secret) hex
  key_vault_id      UUID,                           -- 회전/재노출 정책 필요 시 vault 참조

  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','rotating','revoked')),
  label             TEXT,

  -- 안전판
  monthly_spend_cap_krw  BIGINT CHECK (monthly_spend_cap_krw IS NULL OR monthly_spend_cap_krw >= 0),

  -- 메타
  last_used_at      TIMESTAMPTZ,
  last_used_ip      INET,
  use_count         BIGINT NOT NULL DEFAULT 0,

  -- 회전 / 폐기
  rotated_from_key_id UUID REFERENCES billing.gridge_api_keys(id),
  auto_revoke_at      TIMESTAMPTZ,                   -- rotating 상태 자동 폐기 시각
  revoked_at          TIMESTAMPTZ,
  revoked_by_admin_id UUID REFERENCES billing.admin_users(id),

  issued_by_admin_id  UUID NOT NULL REFERENCES billing.admin_users(id),
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),

  UNIQUE (key_hash)
);

CREATE INDEX IF NOT EXISTS idx_gridge_api_keys_org_status
  ON billing.gridge_api_keys (org_id, status);
CREATE INDEX IF NOT EXISTS idx_gridge_api_keys_prefix
  ON billing.gridge_api_keys (key_prefix)
  WHERE status != 'revoked';
CREATE INDEX IF NOT EXISTS idx_gridge_api_keys_auto_revoke
  ON billing.gridge_api_keys (auto_revoke_at)
  WHERE status = 'rotating' AND auto_revoke_at IS NOT NULL;

CREATE TRIGGER trg_gridge_api_keys_updated_at
  BEFORE UPDATE ON billing.gridge_api_keys
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();

COMMENT ON TABLE  billing.gridge_api_keys IS
  'Gridge 게이트웨이 키. 평문 금지 — SHA-256 해시 + prefix(인증 룩업) 만 저장.';
COMMENT ON COLUMN billing.gridge_api_keys.key_hash IS
  'SHA-256(plaintext) hex. 인증 시 입력 비교만 가능, 역산 불가.';
COMMENT ON COLUMN billing.gridge_api_keys.key_vault_id IS
  '회전 정책상 평문 보관 필요 시 vault.secrets 참조. 기본 NULL (1회 노출만).';


-- ─── 3. gridge_api_usage_events ────────────────────────────
-- Immutable 호출 이력. 단가 스냅샷 + wallet 차감 연결.
CREATE TABLE IF NOT EXISTS billing.gridge_api_usage_events (
  idx               BIGSERIAL PRIMARY KEY,
  id                UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  key_id            UUID NOT NULL REFERENCES billing.gridge_api_keys(id),
  org_id            UUID NOT NULL REFERENCES billing.orgs(id),
  product_id        UUID NOT NULL REFERENCES billing.gridge_api_products(id),

  -- 요청
  request_id        UUID,                                  -- 외부 trace id
  model_used        TEXT NOT NULL,                         -- 라우팅 결과 실 모델
  input_tokens      INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens  >= 0),
  output_tokens    INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  latency_ms        INTEGER,
  status_code       INTEGER NOT NULL,
  error_code        TEXT,                                  -- 'wallet_insufficient' / 'rate_limited' / ...

  -- 단가 스냅샷 (마이그레이션 이후 단가 변경에도 과거 기록 안정)
  input_price_per_1k_krw_snapshot   NUMERIC(12,4) NOT NULL,
  output_price_per_1k_krw_snapshot  NUMERIC(12,4) NOT NULL,
  cost_krw          BIGINT NOT NULL DEFAULT 0 CHECK (cost_krw >= 0),

  -- 회계 분리 (PB-009)
  upstream_vendor       TEXT,
  upstream_request_id   TEXT,
  upstream_cost_usd     NUMERIC(14,6),                     -- 원가
  wallet_ledger_id      UUID,                              -- consume_wallet 결과 (PR #5 에서 연결)

  created_at        TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

CREATE INDEX IF NOT EXISTS idx_gridge_usage_events_org_time
  ON billing.gridge_api_usage_events (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gridge_usage_events_key_time
  ON billing.gridge_api_usage_events (key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gridge_usage_events_product_time
  ON billing.gridge_api_usage_events (product_id, created_at DESC);

-- Immutable 보장 (PB-005)
DROP RULE IF EXISTS gridge_api_usage_events_no_update ON billing.gridge_api_usage_events;
DROP RULE IF EXISTS gridge_api_usage_events_no_delete ON billing.gridge_api_usage_events;
CREATE RULE gridge_api_usage_events_no_update AS
  ON UPDATE TO billing.gridge_api_usage_events DO INSTEAD NOTHING;
CREATE RULE gridge_api_usage_events_no_delete AS
  ON DELETE TO billing.gridge_api_usage_events DO INSTEAD NOTHING;

COMMENT ON TABLE  billing.gridge_api_usage_events IS
  'Gridge 게이트웨이 호출 이력 (Immutable, append-only). 단가 스냅샷 + wallet_ledger_id 연결.';
COMMENT ON COLUMN billing.gridge_api_usage_events.upstream_cost_usd IS
  'PB-009 회계 분리 — 원가. 고객 청구는 cost_krw, 마진은 차이. RLS 로 Super only 접근.';


-- ─── 4. 일별 집계 뷰 ────────────────────────────────────────
CREATE OR REPLACE VIEW billing.v_gridge_usage_daily AS
SELECT
  org_id,
  product_id,
  DATE(created_at AT TIME ZONE 'Asia/Seoul') AS day,
  COUNT(*) AS request_count,
  SUM(input_tokens)  AS input_tokens_sum,
  SUM(output_tokens) AS output_tokens_sum,
  SUM(cost_krw)      AS cost_krw_sum,
  SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS error_count
FROM billing.gridge_api_usage_events
GROUP BY org_id, product_id, DATE(created_at AT TIME ZONE 'Asia/Seoul');

COMMENT ON VIEW billing.v_gridge_usage_daily IS
  '일별 사용량 집계 (Asia/Seoul). 콘솔 / 고객 대시보드용. PR #5 에서 활용.';


-- ─── 5. RLS ─────────────────────────────────────────────────
ALTER TABLE billing.gridge_api_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.gridge_api_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.gridge_api_usage_events  ENABLE ROW LEVEL SECURITY;

-- products: Super manage / 고객은 활성 상품만 read
DROP POLICY IF EXISTS "super can manage gridge_api_products"      ON billing.gridge_api_products;
DROP POLICY IF EXISTS "members can read active gridge_api_products" ON billing.gridge_api_products;

CREATE POLICY "super can manage gridge_api_products"
  ON billing.gridge_api_products FOR ALL
  USING (billing.admin_role() = 'super')
  WITH CHECK (billing.admin_role() = 'super');

CREATE POLICY "members can read active gridge_api_products"
  ON billing.gridge_api_products FOR SELECT
  USING (
    is_active = TRUE
    AND billing.my_org_id() IS NOT NULL
  );

-- keys: Super manage / 고객은 본인 org 의 non-revoked read
DROP POLICY IF EXISTS "super can manage gridge_api_keys" ON billing.gridge_api_keys;
DROP POLICY IF EXISTS "members can read own org gridge_api_keys" ON billing.gridge_api_keys;

CREATE POLICY "super can manage gridge_api_keys"
  ON billing.gridge_api_keys FOR ALL
  USING (billing.admin_role() = 'super')
  WITH CHECK (billing.admin_role() = 'super');

CREATE POLICY "members can read own org gridge_api_keys"
  ON billing.gridge_api_keys FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND status != 'revoked'
    AND billing.my_role() IN ('owner','admin')
  );

-- usage events: Super read / 고객은 본인 org read (원가 컬럼은 뷰에서 별도 차단 — PR #5 에서)
DROP POLICY IF EXISTS "super can read gridge_api_usage_events"      ON billing.gridge_api_usage_events;
DROP POLICY IF EXISTS "super can insert gridge_api_usage_events"    ON billing.gridge_api_usage_events;
DROP POLICY IF EXISTS "members can read own org gridge_api_usage"   ON billing.gridge_api_usage_events;

CREATE POLICY "super can read gridge_api_usage_events"
  ON billing.gridge_api_usage_events FOR SELECT
  USING (billing.admin_role() = 'super');

CREATE POLICY "super can insert gridge_api_usage_events"
  ON billing.gridge_api_usage_events FOR INSERT
  WITH CHECK (billing.admin_role() = 'super');

CREATE POLICY "members can read own org gridge_api_usage"
  ON billing.gridge_api_usage_events FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND billing.my_role() IN ('owner','admin')
  );
