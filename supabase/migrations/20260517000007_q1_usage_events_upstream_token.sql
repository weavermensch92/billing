-- ============================================================
-- Gridge Billing v2.0 — Phase 1.5 (Gateway 통합)
-- M-2056: gridge_api_usage_events.upstream_admin_token_id
--
-- 목적: 게이트웨이 호출 1건이 어떤 upstream admin token 으로 실행됐는지
--       추적. 회계 분리 (PB-009) 와 패스스루 회계 (PB-007) 의 정확도 보강.
--
-- PRD §8.7.3 — INSERT 시 박기.
-- ============================================================

ALTER TABLE billing.gridge_api_usage_events
  ADD COLUMN IF NOT EXISTS upstream_admin_token_id UUID
    REFERENCES billing.vendor_admin_tokens(id);

-- Immutable RULE 영향 없음 (DDL).

-- 인덱스: token 별 누적 분석용. nullable 허용 (env fallback 사용 시 NULL).
CREATE INDEX IF NOT EXISTS idx_gridge_usage_events_upstream_token
  ON billing.gridge_api_usage_events (upstream_admin_token_id, created_at DESC)
  WHERE upstream_admin_token_id IS NOT NULL;

COMMENT ON COLUMN billing.gridge_api_usage_events.upstream_admin_token_id IS
  'M-2056. FK vendor_admin_tokens(id). 게이트웨이 호출 시 사용된 upstream admin token. NULL = env ANTHROPIC_API_KEY fallback (점진적 도입 — 운영 셋업 완료 후 NOT NULL 승격).';
