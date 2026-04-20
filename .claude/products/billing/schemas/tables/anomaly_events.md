# Billing / Schemas / anomaly_events — 테이블 본문

> 감지된 이상 이벤트. PB-012 룰 기반. Immutable (감지 후 수정 불가, 상태 전이만).

---

## DDL

```sql
CREATE TABLE anomaly_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID REFERENCES orgs(id) ON DELETE CASCADE,
  rule_id           UUID NOT NULL REFERENCES anomaly_rules(id),
  
  -- 감지 컨텍스트
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  detection_data    JSONB NOT NULL,       -- 감지 시점 데이터 스냅샷
  severity          TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  
  -- 관련 엔티티 (optional)
  account_id        UUID REFERENCES accounts(id),
  virtual_card_id   UUID REFERENCES virtual_cards(id),
  transaction_id    UUID REFERENCES transactions(id),
  
  -- 조치 상태
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','investigating','resolved','false_positive')),
  
  -- 해결
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID REFERENCES admin_users(id),
  resolution_note   TEXT,
  auto_actions_executed JSONB DEFAULT '[]'::jsonb,   -- 실행된 자동 조치 로그
  
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_anomaly_events_open ON anomaly_events(severity, detected_at DESC)
  WHERE status = 'open';
CREATE INDEX idx_anomaly_events_org ON anomaly_events(org_id, detected_at DESC);
CREATE INDEX idx_anomaly_events_rule ON anomaly_events(rule_id, detected_at DESC);

-- Immutable 핵심 필드 (PB-005 정합)
CREATE RULE anomaly_events_no_delete AS ON DELETE TO anomaly_events DO INSTEAD NOTHING;
```

## `detection_data` 스냅샷 예시

### decline_burst (거절 급증)
```json
{
  "count": 15,
  "time_window_minutes": 5,
  "affected_accounts": ["uuid1", "uuid2", "uuid3"],
  "total_amount_krw": 450000,
  "decline_reasons": {"OVERSEAS_BLOCK": 10, "MCC_BLOCK": 5}
}
```

### aiops_billing_gap (I-004 교차 검증)
```json
{
  "billing_month": "2026-04",
  "aiops_estimated_krw": 3200000,
  "billing_actual_krw": 4100000,
  "variance_pct": 28.1,
  "threshold": 20
}
```

## RLS

운영자 전용. RLS 없음 (admin Auth 서버 미들웨어로 역할 체크).

## 주요 쿼리

```sql
-- 콘솔 /console/payments/anomalies 큐
SELECT ae.*, ar.display_name AS rule_name, o.name AS org_name
FROM anomaly_events ae
JOIN anomaly_rules ar ON ar.id = ae.rule_id
LEFT JOIN orgs o ON o.id = ae.org_id
WHERE ae.status = 'open'
ORDER BY 
  CASE ae.severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  ae.detected_at DESC;

-- FP 비율 (분기별)
SELECT ar.rule_code, 
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE ae.status = 'false_positive') AS fp_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ae.status = 'false_positive') / COUNT(*), 1) AS fp_rate
FROM anomaly_rules ar
LEFT JOIN anomaly_events ae ON ae.rule_id = ar.id
WHERE ae.detected_at >= now() - interval '3 months'
GROUP BY ar.rule_code
ORDER BY fp_rate DESC;
```

## 참조

- 이상 감지 규칙: `rules/anomaly_detection.md` (PB-012)
- `anomaly_rules`: `schemas/tables/anomaly_rules.md`
- 콘솔 UI: `screens/console/anomalies.md` (v0.24+)
- 거절 SOP: `playbook/decline-response.md`
