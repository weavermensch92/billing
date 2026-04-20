# Billing / Screens / Console / payments — `/console/payments`

> 결제 모니터링 통합. 피드 / 거절 큐 / 이상 이벤트 / 매입 미확정 4개 하위 페이지.

---

## 목적

Ops / Super 가 실시간 결제 흐름 감시 + 거절·이상 즉시 대응. Phase 0 일일 CSV, Phase 1 웹훅 기반.

## 하위 페이지 구조

```
/console/payments              [피드]  [거절]  [이상]  [매입 미확정]
├── /console/payments          실시간 피드 (기본)
├── /console/payments/declined 거절 대응 큐 ⭐ 핵심
├── /console/payments/anomalies 이상 이벤트
└── /console/payments/unsettled 매입 미확정 (Phase 1+)
```

## 메인 페이지 — 실시간 피드

```
┌──────────────────────────────────────────────────────┐
│ 결제 모니터링                                          │
│ [전체 피드]  [거절 🔴 3]  [이상 🟠 2]  [미확정 ⚫ 1]  │
├──────────────────────────────────────────────────────┤
│ 📊 오늘 요약 (실시간)                                  │
│ ┌────────┬────────┬────────┬────────┐             │
│ │ 승인   │ 거절   │ 매출   │ 대지급  │             │
│ │ 142건 │ 2건   │ ₩4.3M  │ ₩4.3M  │             │
│ └────────┴────────┴────────┴────────┘             │
├──────────────────────────────────────────────────────┤
│ 필터: [오늘▾] [전체 고객▾] [전체 상태▾]              │
├──────────────────────────────────────────────────────┤
│ 실시간 피드 (최신순)                                   │
│ 14:23  Alpha · Alice · Claude.ai · $22.50 ✅         │
│ 14:15  Alpha · Bob · OpenAI · $45.00 ✅              │
│ 14:11  Alpha · Alice · Lovable.dev · $29.00 🔴       │
│        ↑ OVERSEAS_BLOCK — [대응] 버튼                 │
│ 13:58  Alpha · Bob · Anthropic · $125.00 ✅          │
│ ...                                                    │
│ [더 보기 (50건 더)]                                   │
└──────────────────────────────────────────────────────┘
```

## 거절 대응 큐 (`/console/payments/declined`) — 가장 중요

```
┌──────────────────────────────────────────────────────┐
│ 🔴 거절 대응 큐                                        │
├──────────────────────────────────────────────────────┤
│ SLA 임박 (1)                                          │
│ ──────────────────────────                           │
│ 🔥 Alpha · Alice · Lovable.dev · $29             │
│    OVERSEAS_BLOCK · 5분 전 · SLA D+0 4h 남음         │
│    [상세 보기]  [즉시 대응]                            │
│                                                        │
│ 진행 중 (2)                                            │
│ ──────────────────────────                           │
│ 🟡 Alpha · Bob · OpenAI · $45                         │
│    LIMIT_EXCEEDED · 2시간 전                          │
│    Ops 담당: Luna · 상태: VCN 한도 증액 진행 중        │
│    [상세 보기]                                         │
│                                                        │
│ 🟡 Alpha · Charlie · Cursor · $22                     │
│    MCC_BLOCK · 3시간 전                                │
│    Ops 담당: Luna · 상태: MCC 추가 신청 중             │
│    [상세 보기]                                         │
└──────────────────────────────────────────────────────┘
```

### 상세 보기 드로어

```
┌────────────────────────────────────────────┐
│ 거절 건 #txn_abc123                  [×]    │
├────────────────────────────────────────────┤
│ 🔴 OVERSEAS_BLOCK                           │
│                                              │
│ 고객사:  Alpha Inc.                         │
│ VCN:     신한 ****1234                       │
│ 계정:    Alice / Lovable                     │
│ 가맹점:  LOVABLE.DEV (USD $29)               │
│ 시각:    2026-05-15 14:11:05                 │
│                                              │
│ [카드사 원본 페이로드]                       │
│ {"decline_code": "INT_BLOCK", "mcc": "7372", │
│  "amount_original": 29.00, "currency": "USD"}│
│                                              │
│ ━━━━━━━━━ 원인 분석 ━━━━━━━━━               │
│ 해당 VCN 의 해외결제 허용 설정 누락 확인.   │
│                                              │
│ ━━━━━━━━━ 조치 ━━━━━━━━━                   │
│                                              │
│ 1. VCN 설정 변경                            │
│    현재: 해외결제 허용 OFF                  │
│    [해외결제 허용 ON] ← 클릭                │
│                                              │
│ 2. 카드사 포털 (신한 V-Card) 에서 반영       │
│    [카드사 포털 바로가기 ↗]                  │
│    ☐ 반영 완료 체크                         │
│                                              │
│ 3. 고객 통지                                 │
│    [통지 템플릿 미리보기]                    │
│    [Slack Connect 로 전송]                   │
│                                              │
│ 4. 재시도 확인 (30분 후)                     │
│    ☐ 다음 결제 성공 확인                     │
│                                              │
│           [해결 완료 저장]                    │
└────────────────────────────────────────────┘
```

## 이상 이벤트 (`/console/payments/anomalies`)

PB-012 `anomaly_events` 큐:

```
┌──────────────────────────────────────────────┐
│ 🟠 이상 이벤트 (2)                            │
├──────────────────────────────────────────────┤
│ 🟠 payment_surge — Alpha Inc.                │
│    일일 결제 전주 대비 +210%                  │
│    감지: 오늘 06:00 (배치)                   │
│    자동 조치: Ops 알림 완료                  │
│    [상세]  [해결]  [FP 표시]                 │
│                                                │
│ 🟡 unmapped_merchant - ALPHA_INC_PLATFORM    │
│    3건 미매칭 · 감지 48h 전                   │
│    [상세]  [서비스 매칭]                      │
└──────────────────────────────────────────────┘
```

## 매입 미확정 (`/console/payments/unsettled`) — Phase 1+

```
┌──────────────────────────────────────────────┐
│ ⚫ 매입 미확정 (1)                             │
├──────────────────────────────────────────────┤
│ authorized 이후 3일 경과 settled 되지 않음    │
│                                                │
│ Alpha · Lovable.dev · $29 · D+4              │
│ 예상 원인: 해외 결제 매입 지연               │
│ [상세]  [카드사 재확인 요청]                  │
└──────────────────────────────────────────────┘
```

## 피드 실시간 (Supabase Realtime)

```typescript
supabase
  .channel('transactions_stream')
  .on('postgres_changes', { 
    event: 'INSERT', 
    schema: 'public', 
    table: 'transactions'
  }, (payload) => {
    prependToFeed(payload.new);
    if (payload.new.status === 'declined') {
      incrementDeclineCounter();
      pushNotification('거절 감지');
    }
  })
  .subscribe();
```

## 데이터 소스

```sql
-- 오늘 요약
SELECT 
  COUNT(*) FILTER (WHERE status IN ('authorized','settled')) AS approved,
  COUNT(*) FILTER (WHERE status = 'declined') AS declined,
  SUM(customer_charge_krw) FILTER (WHERE status IN ('authorized','settled')) AS revenue,
  SUM(gridge_cost_krw) FILTER (WHERE status IN ('authorized','settled')) AS cost
FROM transactions
WHERE authorized_at::date = CURRENT_DATE;

-- 거절 큐 (SLA 기준 정렬)
SELECT t.*, o.name AS org_name, m.name AS member_name, s.display_name AS service_name,
  vc.last4,
  GREATEST(0, 24 - EXTRACT(EPOCH FROM (now() - t.authorized_at)) / 3600) AS hours_until_sla
FROM transactions t
JOIN orgs o ON o.id = t.org_id
LEFT JOIN accounts a ON a.id = t.account_id
LEFT JOIN members m ON m.id = a.member_id
LEFT JOIN services s ON s.id = a.service_id
LEFT JOIN virtual_cards vc ON vc.id = t.virtual_card_id
WHERE t.status = 'declined'
ORDER BY hours_until_sla ASC;
```

## 권한

- **조회**: Super / Ops
- **대응 액션 실행**: Super / Ops
- **카드사 포털 연동**: Super / Ops (IP 화이트리스트)
- **이상 이벤트 해결**: Super / Ops (severity=critical 은 Super 만)

## Sprint 우선순위

**Sprint 3 필수**. Alpha Day 1 이후 거절 첫 발생 시점부터.

## 참조

- 거절 대응 SOP: `playbook/decline-response.md`
- 이상 감지 규칙: `rules/anomaly_detection.md` (PB-012)
- `transactions`: `schemas/tables/transactions.md`
- `anomaly_events`: `schemas/tables/anomaly_events.md`
- 카드사 실무: `playbook/card-issuer-ops.md`
