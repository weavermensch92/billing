-- ============================================================
-- Sprint 3 — 이상 감지 룰 + 이벤트 테이블 (PB-012)
-- ============================================================

-- ─── anomaly_rules — 감지 룰 카탈로그 ────────────────────────
CREATE TABLE IF NOT EXISTS billing.anomaly_rules (
  idx               BIGSERIAL PRIMARY KEY,
  id                UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  rule_code         TEXT UNIQUE NOT NULL,
  category          TEXT NOT NULL
                      CHECK (category IN ('decline','payment','cross_check','operational')),
  severity          TEXT NOT NULL DEFAULT 'warning'
                      CHECK (severity IN ('info','warning','critical')),
  name              TEXT NOT NULL,
  description       TEXT,
  trigger_condition JSONB NOT NULL DEFAULT '{}',  -- 감지 조건 파라미터
  auto_actions      JSONB NOT NULL DEFAULT '[]',  -- 자동 실행 액션
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

CREATE TRIGGER trg_anomaly_rules_updated_at
  BEFORE UPDATE ON billing.anomaly_rules
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();

-- ─── anomaly_events — 감지된 이상 (Immutable) ────────────────
CREATE TABLE IF NOT EXISTS billing.anomaly_events (
  idx             BIGSERIAL PRIMARY KEY,
  id              UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  rule_id         UUID NOT NULL REFERENCES billing.anomaly_rules(id),
  rule_code       TEXT NOT NULL,
  severity        TEXT NOT NULL,
  org_id          UUID REFERENCES billing.orgs(id),
  related_type    TEXT,
  related_id      UUID,
  detection_data  JSONB NOT NULL DEFAULT '{}',
  auto_actions_executed JSONB DEFAULT '[]',
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES billing.admin_users(id),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES billing.admin_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

CREATE RULE anomaly_events_no_delete AS ON DELETE TO billing.anomaly_events DO INSTEAD NOTHING;
-- UPDATE는 acknowledge/resolve를 위해 허용

CREATE INDEX idx_anomaly_events_org           ON billing.anomaly_events(org_id, created_at DESC);
CREATE INDEX idx_anomaly_events_unresolved    ON billing.anomaly_events(severity, created_at DESC)
  WHERE resolved_at IS NULL;

-- ─── RLS ────────────────────────────────────────────────────
ALTER TABLE billing.anomaly_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.anomaly_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read anomaly_rules"
  ON billing.anomaly_rules FOR SELECT USING (billing.is_admin_user());

CREATE POLICY "super manage anomaly_rules"
  ON billing.anomaly_rules FOR ALL USING (billing.admin_role() = 'super');

CREATE POLICY "admin read anomaly_events"
  ON billing.anomaly_events FOR SELECT USING (billing.is_admin_user());

CREATE POLICY "admin update anomaly_events"
  ON billing.anomaly_events FOR UPDATE USING (billing.is_admin_user());

-- Realtime 노출
ALTER PUBLICATION supabase_realtime ADD TABLE billing.anomaly_events;

-- ─── Seed: 9개 감지 룰 (PB-012) ───────────────────────────────
INSERT INTO billing.anomaly_rules (rule_code, category, severity, name, description, trigger_condition, auto_actions)
VALUES
  -- 카테고리 1: 거절 급증
  ('decline_burst', 'decline', 'critical',
   '거절 폭증 (5분 10건+)',
   '5분 내 동일 VCN/Org에서 결제 거절이 10건 이상 발생',
   '{"window_minutes": 5, "threshold": 10}',
   '["pause_vcn_issuance", "notify_super", "create_decline_response_request"]'),

  ('high_decline_rate', 'decline', 'warning',
   '일일 거절율 30% 초과',
   '특정 고객사의 일일 거절율이 30%를 초과',
   '{"window_hours": 24, "threshold_pct": 30}',
   '["notify_am"]'),

  -- 카테고리 2: 결제 이상
  ('unusual_amount', 'payment', 'warning',
   '비정상 금액 감지',
   '평균 대비 10배 이상 높은 단건 결제',
   '{"multiplier": 10, "lookback_days": 30}',
   '["notify_am"]'),

  ('limit_breach_approach', 'payment', 'info',
   '한도 90% 도달',
   'VCN 월 한도의 90% 이상 소진',
   '{"threshold_pct": 90}',
   '["notify_customer_admin"]'),

  -- 카테고리 3: 교차 검증 (I-004 AiOPS ↔ Billing)
  ('aiops_billing_gap', 'cross_check', 'critical',
   'AiOPS ↔ Billing 오차 > 1%',
   'AiOPS usage_snapshots의 예상 비용과 Billing transactions의 실제 결제액 오차가 1% 초과',
   '{"threshold_pct": 1}',
   '["notify_finance", "create_investigation_task"]'),

  ('anthropic_passthrough_mismatch', 'cross_check', 'warning',
   'Anthropic 패스스루 불일치',
   'Anthropic 결제에 is_anthropic_passthrough = FALSE인 건 감지',
   '{"vendor": "anthropic"}',
   '["notify_finance"]'),

  -- 카테고리 4: 운영 이상
  ('sla_breach', 'operational', 'warning',
   '요청 SLA 위반',
   'action_requests의 sla_deadline이 경과된 미해결 요청',
   '{}',
   '["notify_am", "notify_super"]'),

  ('stale_request', 'operational', 'info',
   '요청 장기 방치 (3일+)',
   '생성 후 3일 이상 in_review 상태 유지',
   '{"stale_days": 3}',
   '["notify_am"]'),

  ('vcn_stuck_pending', 'operational', 'warning',
   'VCN 24h 이상 pending',
   'VCN이 24시간 이상 pending 또는 issuing 상태에 머묾',
   '{"stuck_hours": 24}',
   '["notify_super"]');
