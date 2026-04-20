# Billing / Playbook / Month-End Close — 월말 마감 SOP

> M+1일 00:30 배치 → M+1일 15:00 세계서 발행. Finance / Super 주관. Phase 0 수동 검수, Phase 1 자동화.

---

## 마감 타임라인

```
M월 31일 23:59   M월 마지막 결제 수신 (authorized)
M월 31일 23:59 ~ M+1일 02:00   settle 확정 대기 (카드사 매입)

M+1일 00:30   invoice_generation 배치 시작 (pg_cron)
M+1일 01:00   드래프트 청구서 생성 완료
M+1일 02:00   교차 검증 배치 (AiOPS ↔ Billing, I-004)

M+1일 09:00   Finance 출근 → 콘솔 /billing/drafts 확인
M+1일 10:00   초안 검수 시작
M+1일 12:00   Super 2차 검토 (고액 청구서만)
M+1일 15:00   [발행] 버튼 → Smart Bill API 호출 → 고객 이메일

M+1일 16:00   티어 3 예치금 차감 완료 확인
M+1일 17:00   마감 완료 보고

M+15일        납부 기한 (티어 1 기준)
M+16일 이후   연체 감지 → overdue_actions 트리거
```

## M+1일 00:30 — 배치 실행 (pg_cron)

### 배치 스크립트 `invoice_generation`

```sql
-- 1. 이전 월 (M월) settled 결제 집계
WITH monthly_transactions AS (
  SELECT org_id,
    SUM(customer_charge_krw) AS subtotal_before_cb,
    COUNT(*) AS txn_count
  FROM transactions
  WHERE billing_month = (CURRENT_DATE - interval '1 month')::date
    AND status = 'settled'
  GROUP BY org_id
),
-- 2. 크레딧백 계산 (기간 내면 10%)
with_creditback AS (
  SELECT mt.*,
    CASE
      WHEN oc.creditback_end_date >= CURRENT_DATE - interval '1 month'
      THEN FLOOR(mt.subtotal_before_cb * oc.creditback_rate)
      ELSE 0
    END AS credit_back_amount,
    oc.billing_tier,
    oc.deposit_remaining_krw
  FROM monthly_transactions mt
  JOIN org_contracts oc ON oc.org_id = mt.org_id
  WHERE oc.terminated_at IS NULL
),
-- 3. 티어별 차감
with_tier_adjust AS (
  SELECT wcb.*,
    (subtotal_before_cb - credit_back_amount) AS subtotal,
    FLOOR((subtotal_before_cb - credit_back_amount) * 0.10) AS vat,
    -- 티어 2 주간 선수금
    COALESCE((SELECT SUM(paid_krw) FROM interim_statements
      WHERE org_id = wcb.org_id
        AND billing_month = (CURRENT_DATE - interval '1 month')::date
        AND status = 'paid'), 0) AS interim_paid,
    -- 티어 3 예치금 차감
    CASE WHEN wcb.billing_tier = 'prepaid_monthly'
      THEN LEAST(wcb.deposit_remaining_krw,
                 subtotal_before_cb - credit_back_amount +
                 FLOOR((subtotal_before_cb - credit_back_amount) * 0.10))
      ELSE 0 END AS deposit_used
  FROM with_creditback wcb
)
-- 4. invoices INSERT
INSERT INTO invoices (org_id, billing_month, invoice_number,
  subtotal_before_creditback_krw, credit_back_amount_krw,
  subtotal_krw, vat_krw, total_due_krw,
  interim_paid_krw, deposit_used_krw, net_due_krw,
  status, due_date
)
SELECT org_id,
  (CURRENT_DATE - interval '1 month')::date,
  'INV-' || to_char(CURRENT_DATE - interval '1 month', 'YYYY-MM') || '-' ||
    LPAD(ROW_NUMBER() OVER (ORDER BY org_id)::text, 3, '0'),
  subtotal_before_cb, credit_back_amount,
  subtotal, vat, subtotal + vat,
  interim_paid, deposit_used,
  (subtotal + vat) - interim_paid - deposit_used,
  'draft',
  CURRENT_DATE + interval '15 days'
FROM with_tier_adjust;

-- 5. credit_backs INSERT
INSERT INTO credit_backs (org_id, invoice_id, billing_month,
  transactions_total_krw, credit_amount_krw, rate, is_final)
SELECT
  wcb.org_id, i.id,
  (CURRENT_DATE - interval '1 month')::date,
  wcb.subtotal_before_cb,
  wcb.credit_back_amount,
  0.100,
  (oc.creditback_end_date = (CURRENT_DATE - interval '1 month')::date + interval '1 month')
FROM with_creditback wcb
JOIN invoices i ON i.org_id = wcb.org_id AND i.billing_month = (CURRENT_DATE - interval '1 month')::date
JOIN org_contracts oc ON oc.org_id = wcb.org_id
WHERE wcb.credit_back_amount > 0;

-- 6. transactions 의 invoice_id 연결
UPDATE transactions t
SET invoice_id = i.id
FROM invoices i
WHERE t.org_id = i.org_id
  AND t.billing_month = i.billing_month
  AND t.status = 'settled'
  AND i.status = 'draft';

-- 7. final_creditback_applied 플래그 업데이트 (M6 마지막 공제 반영)
UPDATE org_contracts oc
SET final_creditback_applied = TRUE
FROM credit_backs cb
WHERE cb.org_id = oc.org_id
  AND cb.is_final = TRUE;

-- 8. 배치 로그
INSERT INTO invoice_batches (billing_month, started_at, completed_at, invoice_count)
SELECT (CURRENT_DATE - interval '1 month')::date, now() - interval '30 minutes', now(),
  (SELECT COUNT(*) FROM invoices WHERE billing_month = (CURRENT_DATE - interval '1 month')::date);
```

## M+1일 02:00 — 교차 검증 (I-004)

```sql
-- AiOPS ↔ Billing 오차 체크
SELECT
  o.name,
  b.customer_charge_total AS billing_total,
  a.estimated_total AS aiops_total,
  ROUND(100.0 * ABS(b.customer_charge_total - a.estimated_total)
    / NULLIF(b.customer_charge_total, 0), 1) AS variance_pct
FROM orgs o
LEFT JOIN LATERAL (SELECT SUM(customer_charge_krw) AS customer_charge_total FROM transactions
  WHERE org_id = o.id AND billing_month = (CURRENT_DATE - interval '1 month')::date
    AND status = 'settled') b ON TRUE
LEFT JOIN LATERAL (SELECT SUM(estimated_cost_krw) AS estimated_total FROM aiops.usage_snapshots
  WHERE org_id = o.id AND snapshot_date >= date_trunc('month', CURRENT_DATE - interval '1 month')
    AND snapshot_date < date_trunc('month', CURRENT_DATE)) a ON TRUE
WHERE o.status = 'active';
```

**오차 > 20%**: `anomaly_events INSERT (type='aiops_billing_gap')` → Super 알림.

## M+1일 09:00 ~ 10:00 — Finance 초안 검수

### 콘솔 `/console/billing/drafts` 체크리스트

- [ ] 예상 청구액 범위 내인지 (이전 월 대비 ±30% 이내)
- [ ] 크레딧백 적용 여부 (creditback_end_date 이내면 적용)
- [ ] Anthropic 패스스루 비율 정상인지
- [ ] 티어 2 주간 선수금 공제 정확한지
- [ ] 티어 3 예치금 차감 정확한지
- [ ] 계약 티어 변경 반영 여부

### 이상 케이스 처리

**전월 대비 변동 큰 고객**:
- 변동 원인 확인 (신규 계정 / 해지 / 사용량 급증)
- 필요 시 고객 사전 고지 ("이번 달 청구액이 큽니다")

**크레딧백 M6 마지막**:
- `is_final = TRUE` 확인
- 고객 포털 배너 "마지막 크레딧백이 적용되었습니다" 노출 확인

## M+1일 12:00 — Super 2차 검토 (고액만)

**조건**: `total_due_krw > ₩10,000,000` 청구서.

Super 가 추가 승인:
- 계정·VCN 근거 명세 최종 확인
- 특이 결제 건 (해외 SaaS, 신규 서비스) 검토
- 승인 후 `approved_by = weaver_id` 기록

## M+1일 15:00 — 발행 (Finance [발행] 클릭)

### 발행 액션 트리거
```
[Finance] /console/billing/drafts → [일괄 발행]
      ↓
[for each invoice where status='draft']
      │
      ├─ status = 'issued', issued_at = now()
      │
      ├─ Smart Bill API 호출
      │    POST /api/v1/tax-invoices
      │    {
      │      supplier: { biz_no: '그릿지' },
      │      customer: { biz_no: org.business_registration_no },
      │      amount: subtotal_krw,
      │      vat: vat_krw,
      │      items: [...]
      │    }
      │    → tax_invoice_id 수신
      │
      ├─ tax_invoice_status = 'issued'
      │
      ├─ 고객 Owner 이메일 발송 (청구서 PDF 첨부)
      │
      ├─ 고객 포털 /app/billing 실시간 반영
      │
      └─ audit_logs 기록
```

### Smart Bill 실패 시
- `tax_invoice_status = 'pending'`
- Finance 수동 발행 전환
- 고객에 "세금계산서 2영업일 내 개별 송부" 자동 안내

## M+1일 16:00 — 티어 3 예치금 업데이트

```sql
UPDATE org_contracts oc
SET deposit_remaining_krw = deposit_remaining_krw - i.deposit_used_krw
FROM invoices i
WHERE oc.org_id = i.org_id
  AND i.status = 'issued'
  AND i.billing_month = (CURRENT_DATE - interval '1 month')::date
  AND oc.billing_tier = 'prepaid_monthly'
  AND i.deposit_used_krw > 0;

-- 보충 트리거: 월 예상액 30% 이하
SELECT * FROM org_contracts
WHERE billing_tier = 'prepaid_monthly'
  AND deposit_remaining_krw < monthly_credit_limit_krw * 0.30
  AND terminated_at IS NULL;
-- → 고객 알림 + CSM 메모
```

## M+1일 17:00 — 마감 완료 보고

### 마감 보고서 (Slack #gridge-finance)
```
📊 2026년 4월 마감 완료

총 청구 고객사: 1
총 매출 (공급가액): ₩7,290,000
총 세금계산서: ₩8,019,000 (VAT 포함)
크레딧백 총액: ₩770,000
Anthropic 패스스루 매출: ₩2,340,000 (28.8%)

이상: 없음
Smart Bill 상태: 정상
```

## 월말 마감 체크리스트 (자동 기록)

`monthly_close_checklist` 테이블:
```sql
INSERT INTO monthly_close_checklist (billing_month, checklist)
VALUES (
  (CURRENT_DATE - interval '1 month')::date,
  '[
    {"step": "batch_generation", "done": true, "at": "2026-05-01T00:42Z"},
    {"step": "cross_check", "done": true, "at": "2026-05-01T02:15Z"},
    {"step": "finance_review", "done": true, "at": "2026-05-01T10:30Z"},
    {"step": "super_review_high_value", "done": true, "at": "2026-05-01T12:15Z"},
    {"step": "smart_bill_issue", "done": true, "at": "2026-05-01T15:05Z"},
    {"step": "deposit_update", "done": false, "at": null},
    {"step": "closure_report", "done": true, "at": "2026-05-01T17:10Z"}
  ]'::jsonb
);
```

## Phase 1 자동화 범위

- 배치 생성 → Smart Bill API 자동 발행 (고액만 Super 승인 대기)
- 교차 검증 이상 자동 알림
- 연체 감지 자동 → `overdue_actions` INSERT + Finance 알림

## 참조

- `invoices` / `credit_backs` / `interim_statements`: `schemas/tables/*.md`
- 크레딧백 규칙: `rules/creditback.md` (PB-004)
- 3단 티어: `rules/billing_tier.md` (PB-003)
- Smart Bill 실무: `playbook/smartbill.md`
- 거절 대응: `playbook/decline-response.md`
- 교차 검증: `integrations/billing-aiops.md` (I-004)
- 원본: `07_운영_플레이북.md § 월말 마감`
