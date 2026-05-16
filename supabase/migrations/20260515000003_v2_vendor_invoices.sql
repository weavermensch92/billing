-- ============================================================
-- Gridge Billing MSP v2.0 — M-1003 vendor_invoices + items
-- 청구 단일 진리원천 (옵션 3)
-- 의존: billing.orgs (P1), billing.services (P1), billing.transactions (P1)
-- ============================================================

-- ─── 1. vendor_invoices — 벤더 청구서 헤더 ────────────────
-- 매월 Anthropic·OpenAI 등의 invoice API 폴링 결과 저장
-- Immutable: UPDATE/DELETE 차단 (status 변경은 별도 컬럼으로)
CREATE TABLE IF NOT EXISTS billing.vendor_invoices (
  idx                  BIGSERIAL PRIMARY KEY,
  id                   UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  vendor               TEXT NOT NULL,                  -- anthropic | openai | cursor | ...
  vendor_invoice_id    TEXT NOT NULL,                  -- 벤더 측 청구서 ID
  vendor_workspace_id  TEXT NOT NULL,                  -- 벤더 측 워크스페이스 ID

  org_id               UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,

  -- 기간
  billing_period_start DATE NOT NULL,
  billing_period_end   DATE NOT NULL,

  -- 금액
  total_usd            NUMERIC(14,4) NOT NULL CHECK (total_usd >= 0),
  exchange_rate        NUMERIC(10,4) NOT NULL,         -- USD→KRW (수신 시점)
  fx_at                TIMESTAMPTZ NOT NULL,
  total_krw            BIGINT NOT NULL CHECK (total_krw >= 0),  -- ROUND(usd × rate)

  -- 매칭 검증 (카드 거래와 정합)
  matched_card_charge_krw  BIGINT,                     -- 같은 기간 카드 거래 합계
  match_status         TEXT NOT NULL DEFAULT 'pending'
                         CHECK (match_status IN (
                           'pending',      -- 매칭 미시도
                           'matched',      -- 카드 거래와 일치 (오차 < 1%)
                           'partial',      -- 일부 일치
                           'mismatched',   -- 큰 차이 (조사 대상)
                           'processed'     -- 마감 완료
                         )),
  match_diff_krw       BIGINT,             -- invoice - card
  matched_at           TIMESTAMPTZ,
  matched_by           UUID REFERENCES billing.admin_users(id),

  -- 원본 보존
  raw_payload          JSONB NOT NULL,                 -- 벤더 응답 전체

  fetched_at           TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),

  UNIQUE (vendor, vendor_invoice_id)
);

CREATE INDEX idx_vendor_invoices_org_period
  ON billing.vendor_invoices(org_id, billing_period_start DESC);
CREATE INDEX idx_vendor_invoices_unmatched
  ON billing.vendor_invoices(match_status, fetched_at)
  WHERE match_status IN ('pending', 'partial', 'mismatched');

COMMENT ON TABLE billing.vendor_invoices IS
  '벤더 측 청구서. 청구 단일 진리원천 (옵션 3). Immutable. raw_payload 원본 보존.';


-- ─── 2. vendor_invoice_items — 청구서 라인 아이템 ─────────
CREATE TABLE IF NOT EXISTS billing.vendor_invoice_items (
  idx           BIGSERIAL PRIMARY KEY,
  id            UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  invoice_id    UUID NOT NULL REFERENCES billing.vendor_invoices(id) ON DELETE RESTRICT,
  line_no       INT NOT NULL,

  item_type     TEXT NOT NULL CHECK (item_type IN (
                  'api_usage',     -- API 토큰 사용량
                  'seat_license',  -- 좌석 라이선스
                  'addon',         -- 부가 기능
                  'support',       -- 지원 비용
                  'credit',        -- 크레딧 구매
                  'other'
                )),
  description   TEXT NOT NULL,
  quantity      NUMERIC(14,4),                       -- tokens, seats 등
  unit          TEXT,                                -- 'tokens', 'seats', 'requests'
  amount_usd    NUMERIC(14,4) NOT NULL,
  amount_krw    BIGINT NOT NULL,

  -- 매핑 메타 (사용량 할당 단서)
  -- api_usage 경우: api_key_id, model_name, project_id
  -- seat_license 경우: member_email, vendor_user_id
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),

  UNIQUE (invoice_id, line_no)
);

CREATE INDEX idx_invoice_items_invoice
  ON billing.vendor_invoice_items(invoice_id, line_no);
CREATE INDEX idx_invoice_items_type
  ON billing.vendor_invoice_items(item_type, created_at DESC);

COMMENT ON TABLE billing.vendor_invoice_items IS
  '청구서 라인. item_type별 meta JSON으로 매핑 단서 보관 (api_key_id, member_email 등).';


-- ─── 3. Immutable 트리거 ─────────────────────────────────
-- vendor_invoices: 매칭 관련 컬럼만 UPDATE 허용, 다른 컬럼은 차단
CREATE OR REPLACE FUNCTION billing.protect_vendor_invoice_immutable_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.vendor IS DISTINCT FROM NEW.vendor
     OR OLD.vendor_invoice_id IS DISTINCT FROM NEW.vendor_invoice_id
     OR OLD.vendor_workspace_id IS DISTINCT FROM NEW.vendor_workspace_id
     OR OLD.org_id IS DISTINCT FROM NEW.org_id
     OR OLD.billing_period_start IS DISTINCT FROM NEW.billing_period_start
     OR OLD.billing_period_end IS DISTINCT FROM NEW.billing_period_end
     OR OLD.total_usd IS DISTINCT FROM NEW.total_usd
     OR OLD.exchange_rate IS DISTINCT FROM NEW.exchange_rate
     OR OLD.total_krw IS DISTINCT FROM NEW.total_krw
     OR OLD.raw_payload IS DISTINCT FROM NEW.raw_payload THEN
    RAISE EXCEPTION 'vendor_invoice core fields are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vendor_invoices_immutable
  BEFORE UPDATE ON billing.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION billing.protect_vendor_invoice_immutable_fields();

-- vendor_invoice_items 는 완전 immutable
CREATE OR REPLACE FUNCTION billing.prevent_invoice_items_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'vendor_invoice_items is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_items_no_update
  BEFORE UPDATE ON billing.vendor_invoice_items
  FOR EACH ROW EXECUTE FUNCTION billing.prevent_invoice_items_mutation();

CREATE TRIGGER trg_invoice_items_no_delete
  BEFORE DELETE ON billing.vendor_invoice_items
  FOR EACH ROW EXECUTE FUNCTION billing.prevent_invoice_items_mutation();


-- ─── 4. 정합 검증 뷰 — 카드 거래 vs 청구서 ───────────────
CREATE OR REPLACE VIEW billing.v_invoice_vs_card_diff
WITH (security_invoker = true) AS
SELECT
  vi.id              AS invoice_id,
  vi.vendor,
  vi.org_id,
  vi.billing_period_start,
  vi.billing_period_end,
  vi.total_krw       AS invoice_total_krw,
  COALESCE(card_sum.card_total_krw, 0) AS card_total_krw,
  (vi.total_krw - COALESCE(card_sum.card_total_krw, 0)) AS diff_krw,
  CASE
    WHEN ABS(vi.total_krw - COALESCE(card_sum.card_total_krw, 0))::FLOAT
           / NULLIF(vi.total_krw, 0) < 0.01 THEN 'matched'
    WHEN ABS(vi.total_krw - COALESCE(card_sum.card_total_krw, 0))::FLOAT
           / NULLIF(vi.total_krw, 0) < 0.05 THEN 'partial'
    ELSE 'mismatched'
  END AS suggested_match_status
FROM billing.vendor_invoices vi
LEFT JOIN LATERAL (
  SELECT SUM(t.amount_krw) AS card_total_krw
    FROM billing.transactions t
    WHERE t.org_id = vi.org_id
      AND t.transacted_at::DATE >= vi.billing_period_start
      AND t.transacted_at::DATE <= vi.billing_period_end
      AND t.status = 'settled'
) card_sum ON TRUE;

COMMENT ON VIEW billing.v_invoice_vs_card_diff IS
  '청구서 ↔ 카드 거래 정합 검증. 매월 마감 시 슈퍼어드민이 검수.';


-- ─── 5. 매칭 라인 아이템 — 사용량 할당 미정 검출 뷰 ──────
-- 자세한 사용량 할당은 M-1008 usage_allocations에서 처리, 여기서는 미할당 식별 뷰만
CREATE OR REPLACE VIEW billing.v_unallocated_invoice_items
WITH (security_invoker = true) AS
SELECT
  vii.id            AS item_id,
  vii.invoice_id,
  vi.org_id,
  vi.vendor,
  vii.item_type,
  vii.description,
  vii.amount_krw,
  vii.meta
FROM billing.vendor_invoice_items vii
JOIN billing.vendor_invoices vi ON vi.id = vii.invoice_id
WHERE vii.item_type IN ('api_usage', 'seat_license')
  AND (vii.meta->>'member_email' IS NULL OR vii.meta->>'member_email' = '')
  AND (vii.meta->>'api_key_id' IS NULL OR vii.meta->>'api_key_id' = '');

COMMENT ON VIEW billing.v_unallocated_invoice_items IS
  '청구서 라인 중 멤버·키 매핑이 비어있는 항목. "미할당" 팀에 임시 배치 대상.';


-- ─── 6. RLS 정책 ──────────────────────────────────────────
ALTER TABLE billing.vendor_invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.vendor_invoice_items ENABLE ROW LEVEL SECURITY;

-- 고객 (org_admin)은 자기 Org 청구서만 read
CREATE POLICY vendor_invoices_org_read ON billing.vendor_invoices
  FOR SELECT USING (org_id = billing.my_org_id());

CREATE POLICY vendor_invoices_admin_all ON billing.vendor_invoices
  FOR ALL USING (billing.is_admin_user());

CREATE POLICY vendor_invoice_items_org_read ON billing.vendor_invoice_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM billing.vendor_invoices vi
            WHERE vi.id = vendor_invoice_items.invoice_id
              AND vi.org_id = billing.my_org_id())
  );

CREATE POLICY vendor_invoice_items_admin_all ON billing.vendor_invoice_items
  FOR ALL USING (billing.is_admin_user());
