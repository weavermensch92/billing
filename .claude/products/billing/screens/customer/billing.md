# Billing / Screens / Customer / billing — `/app/billing`

> 월별 청구서 리스트 + 상세 드로어 (3단계 금액 breakdown + 티어별 차감 + 세계서 다운로드).

---

## 목적

Owner/Admin 이 월별 청구서 조회 + 납부 상태 확인 + 세금계산서 다운로드.

## 레이아웃

```
┌──────────────────────────────────────────────────┐
│ 청구·정산                                          │
│ [월별 청구서]  [결제 내역]  [크레딧백]            │
├──────────────────────────────────────────────────┤
│ StatCard 3개                                       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│ │ 이번 달   │ │ 지난 달   │ │ 누적 연간 │         │
│ │ 예상      │ │ 청구액   │ │ (2026)   │         │
│ │ ₩7.8M    │ │ ₩8.0M    │ │ ₩35.2M   │         │
│ └──────────┘ └──────────┘ └──────────┘         │
├──────────────────────────────────────────────────┤
│ 월별 청구서 리스트                                 │
│ ┌────────────────────────────────────────────┐ │
│ │ 2026년 4월              ₩8,019,000  ✅ 완납  │ │
│ │ 발행: 05-01 · 납부: 05-15              [↗]   │ │
│ ├────────────────────────────────────────────┤ │
│ │ 2026년 3월              ₩7,458,000  ✅ 완납  │ │
│ │ 발행: 04-01 · 납부: 04-12              [↗]   │ │
│ ├────────────────────────────────────────────┤ │
│ │ 2026년 2월              ₩6,890,000  🟡 예정  │ │
│ │ 발행: 03-01 · 납부일: 03-15            [↗]   │ │
│ └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

## 상태 표시

| 상태 | 아이콘 | 문구 |
|---|---|---|
| `draft` | ⚫ | "초안 (발행 전)" |
| `issued` | 🟡 | "발행됨 (납부 예정)" |
| `issued` + 기한 초과 | 🔴 | "연체 D+{days}" |
| `paid` | ✅ | "완납 {paid_at}" |
| `void` | ⚫ | "취소됨" |

## 청구서 상세 드로어 (`/app/billing/[invoiceId]`)

우측 슬라이드 1000px:

```
┌──────────────────────────────────────────────┐
│ 2026년 4월 청구서         INV-2026-04-001    │
│                                        [×]    │
├──────────────────────────────────────────────┤
│ 📊 금액 breakdown (3단계)                     │
│                                                │
│ Step 1: 공급가액 (할인 전)                     │
│   서비스별 원가 합계         ₩7,700,000       │
│                                                │
│ Step 2: 크레딧백 차감                          │
│   - 10% 크레딧백             - ₩770,000       │
│   (크레딧백 M4 / 6)                           │
│                                                │
│ Step 3: 최종 공급가액                          │
│   할인 후 공급가액           ₩6,930,000       │
│   VAT (10%)                  ₩693,000         │
│   ────────────────────────────────────────   │
│   총 청구액 (VAT 포함)       ₩7,623,000 ←     │
│                                                │
│ 티어별 차감 (티어 2~3 만)                      │
│ ├ 주간 선수금 공제          ₩0                │
│ └ 예치금 차감               ₩0                │
│                                                │
│ 실 납부액                   ₩7,623,000        │
│                                                │
│ ────────────────────────────────────────────  │
│ 📋 세부 내역                                   │
│ 서비스      사용자   수량     금액              │
│ Claude Team Alice    1회    ₩28,500           │
│ Claude Team Bob      1회    ₩28,500           │
│ OpenAI API  Alice    ~      ₩2,340,000        │
│ Anthropic   Bob      ~      ₩2,103,000        │
│ ...                                            │
│                                                │
│ ────────────────────────────────────────────  │
│ 📄 세금계산서                                  │
│ SB-2026-05-001 · 발행: 05-01                   │
│ [PDF 다운로드]  [이메일 재발송]                 │
│                                                │
│ 📅 납부                                        │
│ 납부 기한: 2026-05-15                          │
│ 상태: 🟡 예정  (D-3)                          │
│ 계좌: 우리은행 1005-xxx (Gridge AI)            │
│                                                │
│ 입금 확인 후 ✅ 완납 표시까지 1~2영업일 소요    │
└──────────────────────────────────────────────┘
```

## 3단계 금액 breakdown 로직 (PB-003 / PB-004)

```
Step 1: subtotal_before_creditback_krw
Step 2: - credit_back_amount_krw
Step 3: = subtotal_krw
        + vat_krw (10%)
        = total_due_krw

티어 2 / 3: total_due_krw - interim_paid_krw - deposit_used_krw = net_due_krw
```

티어 1 (월간, Alpha 기본) 은 `total_due_krw = net_due_krw`.

## 세부 내역 표시

```sql
SELECT s.display_name, m.name, 
  COUNT(*) AS txn_count,
  SUM(t.customer_charge_krw) AS total
FROM v_transaction_customer t
JOIN accounts a ON a.id = t.account_id
JOIN services s ON s.id = a.service_id
JOIN members m ON m.id = a.member_id
WHERE t.invoice_id = $1
GROUP BY s.display_name, m.name
ORDER BY total DESC;
```

## 세금계산서 다운로드

- Smart Bill API 에서 PDF 가져오기 (pre-signed URL)
- 또는 이메일 재발송 (Smart Bill `resend` API)
- 다운로드 이벤트 → `audit_logs INSERT (visibility='both')`

## 데이터 소스

```sql
-- 리스트
SELECT * FROM invoices WHERE org_id = $1 ORDER BY billing_month DESC LIMIT 12;

-- 이번 달 예상 (M월 진행 중)
SELECT SUM(customer_charge_krw) AS mtd_estimate
FROM v_transaction_customer
WHERE org_id = $1 AND authorized_at >= date_trunc('month', now());
```

## 권한

- **Owner/Admin 만**: 청구서 조회 + 세계서 다운로드
- **Member**: 이 페이지 접근 불가 (사이드바에서 숨김)
- **Member** 개인 사용 내역: `/app/billing/transactions` 에서 본인 것만 조회 가능

## 실시간 갱신

- `invoices.status` 변경 (발행 → 완납) → 카드 배지 실시간 갱신
- `invoices` INSERT (신규 월) → 리스트 최상단 추가

## 빈 상태

**Alpha Day 1~30 (첫 청구서 전)**:
```
첫 청구서는 2026-06-01 에 발행됩니다.
[이번 달 결제 내역 보기]
```

## Sprint 우선순위

**Sprint 3 필수**. Alpha D+30 첫 청구서 발행 시점부터 가장 많이 보는 페이지.

## 참조

- `invoices` 스키마: `schemas/tables/invoices.md`
- 3단 티어: `rules/billing_tier.md` (PB-003)
- 크레딧백: `rules/creditback.md` (PB-004)
- Smart Bill: `playbook/smartbill.md`
- 월말 마감: `playbook/month-end-close.md`
- v_transaction_customer 뷰: `rules/accounting_split_engine.md` (PB-009)
