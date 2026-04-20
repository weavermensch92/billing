# Billing / Screens / Console / invoice_detail — `/console/billing/[invoiceId]`

> 월말 검수 UI. Finance 승인 / Super 고액 2차 / Smart Bill 연동 상태 / 라인 아이템 편집 (draft 만).

---

## 목적

Finance 가 월말 배치로 생성된 draft 청구서를 검수 → `issued` 전환 → Smart Bill 발행 추적.

## 레이아웃

```
┌────────────────────────────────────────────────────┐
│ INV-2026-04-001 · Alpha Inc. · 2026년 4월           │
│ 상태: 🟡 Draft · 발행 전                     [⋯ 액션]│
├────────────────────────────────────────────────────┤
│ 금액 (3단계 breakdown)                              │
│ ┌──────────────────────────────────────────────┐  │
│ │ Step 1: 공급가액 (할인 전)                    │  │
│ │   서비스별 원가 합계            ₩7,700,000   │  │
│ │                                                │  │
│ │ Step 2: 크레딧백 차감                          │  │
│ │   10% 크레딧백                 - ₩770,000    │  │
│ │                                                │  │
│ │ Step 3: 최종                                   │  │
│ │   공급가액                      ₩6,930,000   │  │
│ │   VAT (10%)                    ₩693,000      │  │
│ │   ───────────────────────────────────────    │  │
│ │   총 청구액                    ₩7,623,000 ★  │  │
│ │                                                │  │
│ │ 티어 조정 (티어 1 = monthly, 없음)             │  │
│ │   interim_paid                  ₩0            │  │
│ │   deposit_used                  ₩0            │  │
│ │                                                │  │
│ │   실 납부액                    ₩7,623,000     │  │
│ └──────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────┤
│ 🔍 검수 체크리스트                                  │
│                                                      │
│ ☐ 예상 청구액 범위 내 (이전 월 대비 ±30%)           │
│   이전 월: ₩7,458,000 / 차이 +2.2% ✅               │
│                                                      │
│ ☐ 크레딧백 적용 정확성                              │
│   기간 내 (M4/6): ✅ / 10% = ₩770,000 ✅            │
│                                                      │
│ ☐ Anthropic 패스스루 비율                           │
│   패스스루: ₩2,103,000 (27.3%) — 정상 범위          │
│                                                      │
│ ☐ 라인 아이템 이상 없음                              │
│   142건 / 미매칭 0건 ✅                              │
│                                                      │
│ [검수 완료 저장]                                    │
├────────────────────────────────────────────────────┤
│ 📋 라인 아이템 (142건)                               │
│ 가맹점              멤버      건수  금액              │
│ Anthropic           Alice    23   ₩1,245,000        │
│ OpenAI              Alice    18   ₩858,000          │
│ Claude Team         Alice    1    ₩28,500           │
│ Claude Team         Bob      1    ₩28,500           │
│ Cursor Business     Charlie  1    ₩22,000           │
│ ...                                                  │
│ [전체 보기]  [CSV 다운로드]                          │
├────────────────────────────────────────────────────┤
│ 📝 발행 정보                                         │
│ Smart Bill 상태: ⏳ 미발행                          │
│ 세금계산서 ID: -                                     │
│                                                      │
│ 납부 기한: 2026-05-15 (D-14)                         │
│ 수납 계좌: 우리은행 1005-xxx                         │
│                                                      │
│ [[발행]]  ← Finance 승인 후 활성화                   │
└────────────────────────────────────────────────────┘
```

## Draft 상태 편집 (제한적)

`status = 'draft'` 일 때만 수정 가능:
- 라인 아이템 제외·포함 (가맹점 미매칭 수동 매핑)
- 크레딧백 금액 수동 조정 (Super 만)
- 납부 기한 조정

**Immutable 진입 시점**: `[발행]` 버튼 클릭 → `status = 'issued'` → 이후 수정 불가 (PB-005 / Rules).

## [발행] 버튼 동작

```sql
BEGIN;
-- 1. status 전환
UPDATE invoices 
SET status = 'issued', 
    issued_at = now(),
    due_date = CURRENT_DATE + interval '14 days'
WHERE id = $1 AND status = 'draft';

-- 2. Smart Bill API 호출 (비동기)
-- → smartbill_webhook 에서 tax_invoice_id 수신 후 업데이트

-- 3. 고객 Owner 이메일 발송
INSERT INTO notifications (org_id, type, data) VALUES (...);

-- 4. audit_logs
INSERT INTO audit_logs (..., visibility='both', ...);

COMMIT;
```

## Smart Bill 상태 표시

| 상태 | 아이콘 | 표시 |
|---|---|---|
| `pending` | ⏳ | 미발행 |
| `issued` | ✅ | 발행 완료 — SB-2026-05-001 |
| `rejected` | 🔴 | 거부 — 사유: ... |
| `cancelled` | ⚫ | 취소 (수정 발행 진행) |

실패 시 Finance 에 Slack 알림 + `[수동 재시도]` 버튼.

## 고액 청구서 (Super 2차 승인)

`total_due_krw > ₩10,000,000` 조건:

```
⚠️ 이 청구서는 고액 범위입니다 (₩10M 초과)
Super 2차 승인이 필요합니다.

[Finance 검수 완료] (1차) — ✅ Luna 완료
[Super 최종 승인] (2차) — 🟡 대기

Super 승인 이전에는 [발행] 버튼이 비활성화됩니다.
```

Super 2차 승인 후 발행 버튼 활성화.

## 수정 발행 (Cancel + Re-issue)

`status = 'issued'` 후 오류 발견 시:
```
[⋯ 액션] → [취소 후 재발행]
```

절차:
1. 기존 `status = 'void'` + `voided_at = now()`
2. 신규 draft INSERT (동일 내용 or 수정)
3. 재발행 → 신규 tax_invoice_id
4. Smart Bill 원본 취소 + 재발행 API

**주의**: 수정 발행은 **연속 거래번호 규정** 준수 필수 (세무당국). 자세한 절차는 `playbook/smartbill.md § 수정 발행`.

## 예상 범위 검증

배치 생성 시 자동 계산:
```sql
WITH comparison AS (
  SELECT
    this_invoice.total_due_krw AS current,
    (SELECT total_due_krw FROM invoices 
      WHERE org_id = this_invoice.org_id 
        AND billing_month = this_invoice.billing_month - interval '1 month') AS previous
  FROM invoices this_invoice
  WHERE id = $1
)
SELECT current, previous,
  ROUND(100.0 * (current - previous) / NULLIF(previous, 0), 1) AS variance_pct
FROM comparison;
```

- `|variance_pct| > 30%` → 🟡 경고 (검수 필수 의견)
- `|variance_pct| > 50%` → 🔴 위험 (Super 확인 권장)

## 데이터 소스

```sql
SELECT i.*, o.name AS org_name,
  cb.credit_amount_krw, cb.is_final,
  -- 이전 월 비교
  (SELECT total_due_krw FROM invoices 
    WHERE org_id = i.org_id 
      AND billing_month = i.billing_month - interval '1 month') AS previous_month_total,
  -- Smart Bill 상태
  i.tax_invoice_id, i.tax_invoice_status, i.tax_invoice_issued_at,
  -- 라인 아이템 집계
  (SELECT json_agg(json_build_object(
      'merchant', merchant_descriptor,
      'count', cnt,
      'total', total_krw
    ))
    FROM (
      SELECT merchant_descriptor, COUNT(*) AS cnt, SUM(customer_charge_krw) AS total_krw
      FROM transactions WHERE invoice_id = i.id
      GROUP BY merchant_descriptor
      ORDER BY total_krw DESC
    ) line_items) AS line_items
FROM invoices i
JOIN orgs o ON o.id = i.org_id
LEFT JOIN credit_backs cb ON cb.invoice_id = i.id
WHERE i.id = $1;
```

## 권한

- **조회**: Super / Finance
- **라인 아이템 편집**: Super / Finance (draft 만)
- **[검수 완료]**: Finance
- **[Super 2차 승인]**: Super (고액만)
- **[발행]**: Finance (고액은 Super 2차 후)
- **수정 발행**: Super 만

## 실시간 갱신

- Smart Bill 웹훅 → `tax_invoice_status` 변경 → 배지 즉시 갱신
- 고객 납부 확인 → `status = 'paid'` → 🟢 완납

## Sprint 우선순위

**Sprint 3 필수**. Alpha D+30 첫 청구서 발행 시점부터 Finance 업무 핵심.

## 참조

- `invoices` 스키마: `schemas/tables/invoices.md`
- 3단 티어 금액 계산: `rules/billing_tier.md` (PB-003)
- 크레딧백: `rules/creditback.md` (PB-004)
- Immutable: `rules/immutable_ledger.md` (PB-005)
- 월말 마감 절차: `playbook/month-end-close.md`
- Smart Bill 실무: `playbook/smartbill.md`
- 고객 포털 측: `screens/customer/billing.md`
