# Billing / Schemas / usage_snapshots — 테이블 본문

> AiOPS 브릿지 일일 사용량 집계. I-004 파이프라인. "이번 달 예상 비용" 표시 데이터 소스.

---

## DDL

```sql
CREATE TABLE usage_snapshots (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  account_id             UUID REFERENCES accounts(id),
  service_id             UUID REFERENCES services(id),
  
  -- 시점
  snapshot_date          DATE NOT NULL,
  snapshot_hour          INT CHECK (snapshot_hour BETWEEN 0 AND 23),  -- 시간 단위 (optional)
  
  -- 사용량
  api_calls              INT DEFAULT 0,
  input_tokens           BIGINT DEFAULT 0,
  output_tokens          BIGINT DEFAULT 0,
  
  -- 예상 비용 (AiOPS 추정)
  estimated_cost_krw     BIGINT NOT NULL,
  
  -- 출처
  source                 TEXT NOT NULL DEFAULT 'aiops_bridge'
                         CHECK (source IN ('aiops_bridge','manual','reconciled')),
  
  -- 원본 참조
  aiops_snapshot_id      UUID,             -- AiOPS 측 usage_snapshot 연결
  
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (org_id, account_id, snapshot_date, snapshot_hour)
);

CREATE INDEX idx_usage_snapshots_org_date ON usage_snapshots(org_id, snapshot_date DESC);
CREATE INDEX idx_usage_snapshots_account ON usage_snapshots(account_id, snapshot_date DESC);
CREATE INDEX idx_usage_snapshots_source ON usage_snapshots(source, snapshot_date DESC);
```

## 데이터 수집

### `source='aiops_bridge'` (자동, I-004)

매일 03:00 배치:
```sql
-- AiOPS aiops.usage_snapshots 에서 MSP 브릿지 고객만
INSERT INTO billing.usage_snapshots (
  org_id, account_id, service_id, snapshot_date,
  api_calls, input_tokens, output_tokens,
  estimated_cost_krw, source, aiops_snapshot_id
)
SELECT 
  au.billing_org_id, NULL, ms.service_id, ms.snapshot_date,
  ms.api_calls, ms.input_tokens, ms.output_tokens,
  ms.estimated_cost_krw, 'aiops_bridge', ms.id
FROM aiops.usage_snapshots ms
JOIN aiops.orgs au ON au.id = ms.org_id
JOIN billing.org_contracts oc ON oc.org_id = au.billing_org_id
WHERE oc.aiops_bridge_enabled = TRUE
  AND ms.snapshot_date = CURRENT_DATE - 1
ON CONFLICT (org_id, account_id, snapshot_date, snapshot_hour) DO UPDATE
  SET estimated_cost_krw = EXCLUDED.estimated_cost_krw,
      api_calls = EXCLUDED.api_calls;
```

### `source='reconciled'` (월말 배치)

월말에 `transactions` 실결제와 교차 확인 후 `reconciled` 로 업데이트.

## "이번 달 예상 비용" 계산

고객 포털 홈 StatCard 활용:
```sql
SELECT SUM(estimated_cost_krw) AS mtd_estimated
FROM usage_snapshots
WHERE org_id = $1
  AND snapshot_date >= date_trunc('month', now())::date
  AND snapshot_date <= CURRENT_DATE;
```

월말까지 선형 예측:
```sql
WITH days_info AS (
  SELECT 
    EXTRACT(DAY FROM CURRENT_DATE) AS days_elapsed,
    EXTRACT(DAY FROM (date_trunc('month', now()) + interval '1 month - 1 day')) AS days_in_month
),
mtd AS (
  SELECT SUM(estimated_cost_krw) AS amount
  FROM usage_snapshots
  WHERE org_id = $1 
    AND snapshot_date >= date_trunc('month', now())::date
)
SELECT 
  mtd.amount AS mtd,
  ROUND(mtd.amount * days_info.days_in_month / days_info.days_elapsed) AS projected_month_end
FROM mtd, days_info;
```

## RLS

```sql
ALTER TABLE usage_snapshots ENABLE ROW LEVEL SECURITY;

-- 조직원 조회 (본인 or 권한)
CREATE POLICY "usage_snapshots_member_select"
  ON usage_snapshots FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM members WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );
```

## 주요 쿼리

```sql
-- 서비스별 당월 누적
SELECT s.display_name, SUM(us.estimated_cost_krw) AS mtd_cost
FROM usage_snapshots us
JOIN services s ON s.id = us.service_id
WHERE us.org_id = $1
  AND us.snapshot_date >= date_trunc('month', now())::date
GROUP BY s.display_name
ORDER BY mtd_cost DESC;

-- 교차 검증 (월말, I-004)
WITH estimated AS (
  SELECT SUM(estimated_cost_krw) AS est
  FROM usage_snapshots
  WHERE org_id = $1 AND snapshot_date >= $month_start AND snapshot_date < $month_end
),
actual AS (
  SELECT SUM(customer_charge_krw) AS act
  FROM transactions
  WHERE org_id = $1 AND billing_month = $month_start AND status = 'settled'
)
SELECT est, act, 
  ROUND(100.0 * ABS(est - act) / NULLIF(act, 0), 1) AS variance_pct
FROM estimated, actual;
```

## 참조

- I-004 교차 검증: `integrations/billing-aiops.md`
- AiOPS 측 logs: `products/aiops/schemas/tables/logs.md`
- 이상 감지 (aiops_billing_gap): `rules/anomaly_detection.md` (PB-012-04)
- 고객 포털 "이번 달 예상": `screens/customer/home.md § StatCard`
