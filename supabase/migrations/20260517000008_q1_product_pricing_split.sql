-- ============================================================
-- Gridge Billing v2.0 — M-2057: gridge_api_products 가격 정책 분리
--
-- 목적:
--   기존 input_price_per_1k_krw / output_price_per_1k_krw 는 "최종 청구가"
--   로 의미가 모호했음 (마진 포함 여부 불명, USD 원가/환율 불투명).
--
--   사용자 정책 (PRD §7 갱신): 디폴트 = 마진 0% (pass-through). 외부 가격
--   기준을 상시 끌어오고 운영자가 필요 시 수정.
--
-- 변경:
--   - upstream_input_price_per_1k_usd  (벤더 공식 단가, USD)
--   - upstream_output_price_per_1k_usd
--   - fx_rate_krw_per_usd              (적용 환율 스냅샷, KRW/USD)
--   - markup_pct                       (마진율 %, 디폴트 0)
--   - markup_fixed_krw                 (고정 마진 KRW, 디폴트 0)
--   - pricing_source                   (manual | vendor_fetch)
--   - pricing_updated_at               (마지막 갱신 시각)
--
--   기존 input/output_price_per_1k_krw 는 "계산된 최종 청구가" 로
--   의미 명확화 (코멘트 갱신). 운영자가 수동 입력 / 자동 계산 둘 다 허용.
--
-- 백필:
--   기존 row 의 upstream_*_usd / fx_rate 는 0 / NULL 로 두고
--   pricing_source='manual'. 운영자가 콘솔에서 후속 입력.
-- ============================================================

ALTER TABLE billing.gridge_api_products
  ADD COLUMN IF NOT EXISTS upstream_input_price_per_1k_usd  NUMERIC(12,6) NOT NULL DEFAULT 0
    CHECK (upstream_input_price_per_1k_usd  >= 0),
  ADD COLUMN IF NOT EXISTS upstream_output_price_per_1k_usd NUMERIC(12,6) NOT NULL DEFAULT 0
    CHECK (upstream_output_price_per_1k_usd >= 0),
  ADD COLUMN IF NOT EXISTS fx_rate_krw_per_usd              NUMERIC(10,4)
    CHECK (fx_rate_krw_per_usd IS NULL OR fx_rate_krw_per_usd > 0),
  ADD COLUMN IF NOT EXISTS markup_pct                       NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (markup_pct >= 0 AND markup_pct <= 1000),
  ADD COLUMN IF NOT EXISTS markup_fixed_krw                 BIGINT       NOT NULL DEFAULT 0
    CHECK (markup_fixed_krw >= 0),
  ADD COLUMN IF NOT EXISTS pricing_source                   TEXT         NOT NULL DEFAULT 'manual'
    CHECK (pricing_source IN ('manual','vendor_fetch')),
  ADD COLUMN IF NOT EXISTS pricing_updated_at               TIMESTAMPTZ  NOT NULL DEFAULT billing.now_utc();

COMMENT ON COLUMN billing.gridge_api_products.upstream_input_price_per_1k_usd IS
  'M-2057. 벤더 공식 input 단가 (USD per 1k tokens). 외부 fetch 또는 수동 입력. 디폴트 0.';
COMMENT ON COLUMN billing.gridge_api_products.upstream_output_price_per_1k_usd IS
  'M-2057. 벤더 공식 output 단가 (USD per 1k tokens).';
COMMENT ON COLUMN billing.gridge_api_products.fx_rate_krw_per_usd IS
  'M-2057. 적용 환율 (KRW per 1 USD) 스냅샷. NULL = 환율 미적용 (KRW 직접 입력 모드).';
COMMENT ON COLUMN billing.gridge_api_products.markup_pct IS
  'M-2057. 그릿지 마진율 (%). 디폴트 0 = pass-through. 운영자 정책 결정.';
COMMENT ON COLUMN billing.gridge_api_products.markup_fixed_krw IS
  'M-2057. 호출당 고정 마진 (KRW). 디폴트 0. 최소청구금 보강용.';
COMMENT ON COLUMN billing.gridge_api_products.pricing_source IS
  'M-2057. manual = 운영자가 input/output_price_per_1k_krw 를 직접 입력. vendor_fetch = upstream_*_usd × fx_rate × (1+markup) 자동 계산.';
COMMENT ON COLUMN billing.gridge_api_products.pricing_updated_at IS
  'M-2057. 가격 마지막 갱신 시각 (수동/자동 모두).';

-- 기존 컬럼 의미 명확화 — 변경 없이 코멘트만 갱신
COMMENT ON COLUMN billing.gridge_api_products.input_price_per_1k_krw IS
  '최종 청구가 (input, KRW per 1k tokens). pricing_source=manual: 운영자 직접 입력. pricing_source=vendor_fetch: upstream_input_price_per_1k_usd × fx_rate_krw_per_usd × (1+markup_pct/100) 자동 계산.';
COMMENT ON COLUMN billing.gridge_api_products.output_price_per_1k_krw IS
  '최종 청구가 (output, KRW per 1k tokens). pricing_source=manual / vendor_fetch 분기는 input 컬럼과 동일.';
