# Billing / Schemas / credit_backs — 테이블 본문

> 크레딧백 적용 이력. PB-004. Immutable.

---

## DDL

```sql
CREATE TABLE credit_backs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  invoice_id               UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,

  billing_month            DATE NOT NULL,             -- 귀속 월 (M월)
  transactions_total_krw   BIGINT NOT NULL,           -- 대상 월 결제 합계
  credit_amount_krw        BIGINT NOT NULL,           -- 10% 값
  rate                     NUMERIC(4,3) NOT NULL DEFAULT 0.100,
  is_final                 BOOLEAN NOT NULL DEFAULT FALSE,  -- M6 마지막 공제

  -- 역기록 (PB-005-03)
  reversal_of              UUID REFERENCES credit_backs(id),  -- 부호 반대
  correction_note          TEXT,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, billing_month)  -- 1 org × 1 month × 1 credit_back
);

CREATE INDEX idx_credit_backs_org ON credit_backs(org_id, billing_month DESC);

-- Immutable
CREATE RULE credit_backs_no_update AS ON UPDATE TO credit_backs DO INSTEAD NOTHING;
CREATE RULE credit_backs_no_delete AS ON DELETE TO credit_backs DO INSTEAD NOTHING;
```

## 역기록 패턴 (PB-005-03)

**잘못된 크레딧백 수정**:
```sql
-- 원본 cb_aaa: credit_amount_krw = 900000
-- 실제는 850000 이어야 했음

-- 1. 역기록 (취소)
INSERT INTO credit_backs (org_id, invoice_id, billing_month,
                          transactions_total_krw, credit_amount_krw, rate,
                          reversal_of, correction_note)
VALUES ($org, $inv, '2026-05-01', 9000000, -900000, 0.100,
        'cb_aaa', 'reversal of cb_aaa');

-- 2. 정정
INSERT INTO credit_backs (org_id, invoice_id, billing_month,
                          transactions_total_krw, credit_amount_krw, rate,
                          correction_note)
VALUES ($org, $inv, '2026-05-01', 8500000, 850000, 0.100,
        'corrected from cb_aaa');

-- 최종 순액: -900000 + 850000 = -50000 (차액)
```

## 주요 쿼리

```sql
-- 크레딧백 진행 상태 (고객 포털 /app/billing/creditback)
SELECT
  oc.contract_start_date,
  oc.creditback_end_date,
  oc.creditback_rate,
  oc.final_creditback_applied,
  COALESCE(SUM(cb.credit_amount_krw), 0) AS total_applied,
  COUNT(DISTINCT cb.billing_month) AS applied_months,
  GREATEST(0, 6 - COUNT(DISTINCT cb.billing_month)) AS remaining_months
FROM org_contracts oc
LEFT JOIN credit_backs cb ON cb.org_id = oc.org_id
WHERE oc.org_id = $1 AND oc.terminated_at IS NULL
GROUP BY oc.contract_start_date, oc.creditback_end_date,
         oc.creditback_rate, oc.final_creditback_applied;
```

## 참조

- 규칙: `rules/creditback.md` (PB-004)
- 원본: `03_데이터_모델.md § 9-4 credit_backs`
