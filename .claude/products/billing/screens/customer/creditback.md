# Billing / Screens / Customer / creditback — `/app/billing/creditback`

> 크레딧백 진행 상황. 6개월 진행바 + 누적 절감액 + M6 경고 + 종료 D-30 배너.

---

## 목적

Owner/Admin 이 크레딧백 프로그램 혜택 현황 한눈에. 종료 시점 명확히 안내 → CSM 업셀 자연 연결 (I-005).

## 레이아웃

```
┌──────────────────────────────────────────────────┐
│ 💎 크레딧백 프로그램                               │
├──────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────┐ │
│ │ 📈 진행 현황                                   │ │
│ │                                                │ │
│ │ 계약 시작: 2026-04-01                          │ │
│ │ 크레딧백 종료: 2026-10-01 (D-150)              │ │
│ │                                                │ │
│ │ M1 M2 M3 M4 M5 M6                              │ │
│ │ ▓▓ ▓▓ ▓▓ ░░ ░░ ░░                              │ │
│ │ 적용  적용  적용  예정  예정  ⚠️마지막          │ │
│ │                                                │ │
│ │ 3 / 6 개월 경과                                │ │
│ └──────────────────────────────────────────────┘ │
│                                                    │
│ ┌──────────────────────────────────────────────┐ │
│ │ 💰 누적 절감 금액                              │ │
│ │                                                │ │
│ │ ₩2,310,000                                    │ │
│ │ (M1~M3 누적 크레딧백 적용)                    │ │
│ │                                                │ │
│ │ 예상 최종 (M6 까지)                            │ │
│ │ 약 ₩4,620,000                                  │ │
│ └──────────────────────────────────────────────┘ │
│                                                    │
│ 📅 월별 적용 내역                                  │
│ ┌────────────────────────────────────────────┐   │
│ │ 2026년 4월 (M1)  ₩770,000  ✅ 적용 완료 (5월 청구)│   │
│ │ 2026년 5월 (M2)  ₩820,000  ✅ 적용 완료          │   │
│ │ 2026년 6월 (M3)  ₩720,000  ✅ 적용 완료          │   │
│ │ 2026년 7월 (M4)  ~         🟡 예정               │   │
│ │ 2026년 8월 (M5)  ~         🟡 예정               │   │
│ │ 2026년 9월 (M6)  ~         ⚠️ 마지막 공제        │   │
│ └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

## 크레딧백 종료 D-30 배너 (중요)

D-30 이내 진입 시 페이지 상단 강조 배너:

```
┌──────────────────────────────────────────────┐
│ ⚠️ 크레딧백 프로그램이 2026-10-01 에 종료됩니다│
│                                                │
│ 종료 이후에는 AI 서비스 원가에 10% 할인이      │
│ 적용되지 않습니다.                             │
│                                                │
│ Gridge 담당 AM Luna 가 다음 스텝을 안내드릴   │
│ 예정입니다. 궁금하신 점은 아래 연결 경로로:    │
│                                                │
│ [Slack Connect 채널 열기]                      │
│ [담당 AM 에게 메시지]                          │
└──────────────────────────────────────────────┘
```

이 배너는 단순 경고가 아니라 **다음 스텝 안내** (Wiring/AiOPS 번들 전환 I-005 타이밍).

## M6 마지막 공제 경고 (final_creditback_applied)

M6 청구서 발행 후 (`final_creditback_applied = TRUE`):

```
✅ 2026년 9월 마지막 크레딧백이 적용되었습니다.
   6개월간 총 절감 금액: ₩4,480,000
   
   이후 결제는 원가 100% 로 청구됩니다.
   (Anthropic API 는 파트너십 할인 유지)
```

## 진행바 시각화

```tsx
<div className="grid grid-cols-6 gap-2">
  {months.map((m, i) => (
    <div key={m.number} className={cn(
      "h-12 rounded flex flex-col items-center justify-center text-xs",
      m.status === 'applied' ? 'bg-primary-100 text-primary-700' :
      m.status === 'pending' ? 'bg-gray-50 text-gray-500' :
      m.status === 'final' ? 'bg-warning-100 text-warning-700 border-2 border-warning' :
      ''
    )}>
      <div>M{m.number}</div>
      <div>{labelFor(m.status)}</div>
    </div>
  ))}
</div>
```

## 데이터 소스

```sql
-- 진행 현황
SELECT oc.contract_start_date, oc.creditback_end_date, oc.creditback_rate,
       oc.final_creditback_applied,
  CURRENT_DATE - oc.contract_start_date AS days_elapsed,
  oc.creditback_end_date - CURRENT_DATE AS days_remaining,
  COUNT(cb.id) AS applied_months,
  SUM(cb.credit_amount_krw) AS total_applied
FROM org_contracts oc
LEFT JOIN credit_backs cb ON cb.org_id = oc.org_id
WHERE oc.org_id = $1 AND oc.terminated_at IS NULL
GROUP BY oc.contract_start_date, oc.creditback_end_date,
         oc.creditback_rate, oc.final_creditback_applied;

-- 월별 적용 내역
SELECT cb.billing_month, cb.credit_amount_krw, cb.is_final,
  i.invoice_number, i.issued_at
FROM credit_backs cb
JOIN invoices i ON i.id = cb.invoice_id
WHERE cb.org_id = $1
ORDER BY cb.billing_month;
```

## 예상 최종 금액 추정

현재까지 평균 × 남은 개월수:
```sql
SELECT ROUND(AVG(credit_amount_krw)) * 6 AS estimated_final
FROM credit_backs WHERE org_id = $1;
```

## 권한

- **Owner/Admin 만** 접근. Member 는 사이드바에서 숨김.

## 실시간 갱신

- `credit_backs` INSERT → 월별 내역 신규 행 추가
- `org_contracts.final_creditback_applied` 변경 → 마지막 경고 배너

## 빈 상태

**Alpha 직후 (크레딧백 적용 전)**:
```
크레딧백은 첫 달 청구서 발행과 함께 시작됩니다.
(예정: 2026-05-01 발행 / 10% 차감)
```

## Sprint 우선순위

**Sprint 3 필수**. Alpha D+30 이후 재계약 유도에 핵심.

## 참조

- `credit_backs`: `schemas/tables/credit_backs.md`
- 크레딧백 규칙: `rules/creditback.md` (PB-004)
- 업셀 전환 (I-005): `integrations/billing-wiring.md`
- `final_creditback_applied` 트리거: `playbook/month-end-close.md`
- 해지·연장: `playbook/termination.md`
