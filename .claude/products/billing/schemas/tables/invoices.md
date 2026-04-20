# Billing / Schemas / invoices — 테이블 본문

> 월별 청구서. 3단 티어 모두 커버 (`interim_paid_krw`, `deposit_used_krw`, `net_due_krw`). issued 이후 immutable.

---

## DDL

```sql
CREATE TABLE invoices (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                          UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,

  -- 청구 식별
  billing_month                   DATE NOT NULL,           -- 'YYYY-MM-01'
  invoice_number                  TEXT UNIQUE NOT NULL,    -- 'INV-2026-05-001'

  -- 금액 3단계 (PB-003 티어별)
  subtotal_before_creditback_krw  BIGINT NOT NULL,         -- 원가 합계
  credit_back_amount_krw          BIGINT NOT NULL DEFAULT 0,
  subtotal_krw                    BIGINT NOT NULL,         -- 할인 후 공급가액
  vat_krw                         BIGINT NOT NULL,         -- VAT 10%
  total_due_krw                   BIGINT NOT NULL,         -- 공급가액 + VAT

  -- 티어별 차감
  interim_paid_krw                BIGINT NOT NULL DEFAULT 0,  -- 티어 2 주간 선수금
  deposit_used_krw                BIGINT NOT NULL DEFAULT 0,  -- 티어 3 예치금 차감
  net_due_krw                     BIGINT NOT NULL,             -- 최종 납부액

  -- 세금계산서
  tax_invoice_id                  TEXT,                    -- Smart Bill 외부 ID
  tax_invoice_issued_at           TIMESTAMPTZ,
  tax_invoice_status              TEXT CHECK (tax_invoice_status IN
                                    ('pending','issued','rejected','cancelled')),

  -- 상태
  status                          TEXT NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','issued','paid','overdue','void')),

  -- 타임스탬프
  issued_at                       TIMESTAMPTZ,
  due_date                        DATE,
  paid_at                         TIMESTAMPTZ,
  voided_at                       TIMESTAMPTZ,

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, billing_month)
);

CREATE INDEX idx_invoices_org_month ON invoices(org_id, billing_month DESC);
CREATE INDEX idx_invoices_overdue ON invoices(due_date, status)
  WHERE status = 'issued' AND due_date < CURRENT_DATE;
```

## 금액 계산 순서 (티어별)

### 티어 1 (monthly) — 기본
```
subtotal_before_creditback = SUM(transactions.gridge_cost_krw WHERE billing_month = $1)
credit_back_amount = subtotal_before_creditback × 0.10  (크레딧백 기간 내)
subtotal = subtotal_before_creditback - credit_back_amount
vat = subtotal × 0.10
total_due = subtotal + vat
net_due = total_due  (공제 없음)
```

### 티어 2 (weekly) — 주간 선수금 공제
```
... (위와 동일)
net_due = total_due - interim_paid_krw
```

### 티어 3 (prepaid_monthly) — 예치금 차감
```
... (위와 동일)
deposit_available = org_contracts.deposit_remaining_krw
deposit_used = MIN(total_due, deposit_available)
net_due = total_due - deposit_used
-- 이후 org_contracts.deposit_remaining_krw -= deposit_used
```

## Immutable 전이

```sql
-- issued 이후 금액 수정 금지
CREATE RULE invoices_no_update_after_issued AS
  ON UPDATE TO invoices
  WHERE OLD.status = 'issued'
    AND (OLD.subtotal_krw IS DISTINCT FROM NEW.subtotal_krw
         OR OLD.vat_krw IS DISTINCT FROM NEW.vat_krw
         OR OLD.total_due_krw IS DISTINCT FROM NEW.total_due_krw)
  DO INSTEAD NOTHING;
```

상태 전이만 허용: `draft → issued → paid / overdue / void`.

## RLS

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Owner/Admin 만
CREATE POLICY "invoices_owner_admin_select"
  ON invoices FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM members
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner','admin')
        AND status = 'active'
    )
  );
```

Member 는 청구서 접근 불가.

## 월말 배치 플로우 (PB-003 + PB-004)

```
M+1월 1일 00:30
     │
     ▼
[for each org where status='active']
     │
     ├─ transactions 집계 (billing_month = M월)
     ├─ credit_back 계산 (기간 내면 10%)
     ├─ interim_paid 조회 (티어 2)
     ├─ deposit_used 계산 (티어 3)
     ├─ invoices INSERT (status='draft')
     └─ credit_backs INSERT
     
M+1월 1일 10:00
     │
     ▼
[Finance] 콘솔 /console/billing/drafts 검수
     │
     ▼
[Finance] [발행] 클릭
     │
     ├─ status='issued', issued_at=now()
     ├─ Smart Bill API 호출 → tax_invoice_id
     ├─ 고객 이메일 발송
     └─ audit_logs 기록
```

## 주요 쿼리

```sql
-- 고객 월별 청구서
SELECT * FROM invoices
WHERE org_id = $1
ORDER BY billing_month DESC
LIMIT 12;

-- 연체 (D+1 이상)
SELECT i.*, o.name, CURRENT_DATE - i.due_date AS overdue_days
FROM invoices i JOIN orgs o ON o.id = i.org_id
WHERE i.status = 'issued' AND i.due_date < CURRENT_DATE
ORDER BY overdue_days DESC;
```

## 참조

- 3단 티어: `rules/billing_tier.md` (PB-003)
- 크레딧백: `rules/creditback.md` (PB-004)
- 월말 마감 플레이북: `playbook/month-end-close.md` (v0.20)
- Smart Bill 연동: `playbook/smartbill.md` (v0.20)
- 원본: `03_데이터_모델.md § 9 정산·청구`
