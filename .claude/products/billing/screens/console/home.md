# Billing / Screens / Console / home — `/console/home`

> AM (Luna) 출근 시작점. 역할별 차등 표시. 오늘 할 일 중심.

---

## 목적

운영자 (Luna + Phase 1 이후 Finance/Ops) 가 콘솔 접속 후 **5분 내에 오늘 처리할 일 파악**.

## 역할별 뷰 차등 (`admin_users.role`)

| 역할 | 주요 섹션 |
|---|---|
| **Super** | 플랫폼 전체 + 위험 이벤트 + 파트너십 지표 |
| **AM** | 담당 고객사 + 요청 큐 + 업셀 시그널 + 월간 리뷰 |
| **Finance** | 월말 검수 큐 + 연체 + Smart Bill 상태 |
| **Ops** | 거절 큐 + VCN 만료 임박 + 이상 이벤트 |

## AM (Luna) 기본 뷰

```
┌──────────────────────────────────────────────────┐
│ 안녕하세요 Luna님. 2026-05-15 수요일                │
├──────────────────────────────────────────────────┤
│ 📌 오늘 할 일 (7)                                  │
│                                                    │
│ 🔴 긴급 (1)                                        │
│ ├ Alpha - 결제 거절 건 1건 대응 필요               │
│                                                    │
│ 🟡 요청 큐 (3)                                     │
│ ├ Alpha - Alice 신규 Claude Team (SLA 2h 전)      │
│ ├ Alpha - Bob 한도 증액 (SLA 6h)                   │
│ └ Alpha - VCN 재발급 (SLA 12h)                     │
│                                                    │
│ 🟠 승인 대기 - awaiting_customer (2)               │
│ ├ Alice - VCN 발급 완료, 고객 등록 대기 D+2        │
│ └ Charlie - VCN 발급 완료, 고객 등록 대기 D+5      │
│                                                    │
│ 📅 오늘 미팅                                       │
│ └ Alpha 월간 리뷰 (15:00) — 준비 노트 열기 →       │
├──────────────────────────────────────────────────┤
│ 📊 담당 고객사 (3)                                 │
│ ┌─────────────────────────────┐                  │
│ │ Alpha Inc.  ⭐ Alpha 파일럿   │                  │
│ │ 🟢 정상 · 이번 달 ₩7.3M       │                  │
│ │ 요청 2 · 거절 0 · 업셀 1 🎯   │                  │
│ │ [상세]                        │                  │
│ └─────────────────────────────┘                  │
├──────────────────────────────────────────────────┤
│ 🎯 업셀 시그널 (1)                                 │
│ └ Alpha Inc. - Wiring 도입 제안 (개발팀 AI 60%)    │
│   [대화 시작] [시그널 무시] [제안서 템플릿]        │
└──────────────────────────────────────────────────┘
```

## "오늘 할 일" 우선순위 규칙

1. **🔴 긴급**: `anomaly_events WHERE severity='critical' AND status='open'`
2. **🟡 요청 큐**: `action_requests WHERE assigned_to=$me AND status='pending' AND sla_deadline < now() + interval '24 hours'`
3. **🟠 승인 대기**: `status='awaiting_customer' AND created_at > now() - interval '7 days'`
4. **📅 오늘 미팅**: `monthly_reviews WHERE assigned_to=$me AND scheduled_at::date = CURRENT_DATE`

## 담당 고객사 카드

`am_assignments` 기반으로 본인 담당 조직만 표시:

```sql
SELECT o.*,
  oc.billing_tier,
  oc.creditback_end_date,
  (SELECT COUNT(*) FROM action_requests 
    WHERE org_id = o.id AND status IN ('pending','in_progress')) AS open_requests,
  (SELECT COUNT(*) FROM transactions 
    WHERE org_id = o.id AND status = 'declined' 
      AND authorized_at > now() - interval '7 days') AS recent_declines,
  (SELECT COUNT(*) FROM upsell_signals 
    WHERE org_id = o.id AND status = 'new') AS open_signals,
  (SELECT SUM(customer_charge_krw) FROM transactions 
    WHERE org_id = o.id AND billing_month = date_trunc('month', now())::date
      AND status IN ('authorized','settled')) AS mtd_revenue
FROM orgs o
JOIN am_assignments am ON am.org_id = o.id AND am.admin_user_id = $me
WHERE o.status = 'active'
ORDER BY mtd_revenue DESC NULLS LAST;
```

## 업셀 시그널 카드

```sql
SELECT us.*, o.name AS org_name
FROM upsell_signals us
JOIN orgs o ON o.id = us.org_id
JOIN am_assignments am ON am.org_id = o.id AND am.admin_user_id = $me
WHERE us.status = 'new'
ORDER BY us.detected_at DESC;
```

클릭 시:
- **[대화 시작]** → Slack Connect 채널 열기 + 제안 템플릿 미리 채움
- **[시그널 무시]** → `status = 'dismissed'` + 사유 입력
- **[제안서 템플릿]** → Wiring/AiOPS 제안서 생성 (실제 데이터 기반)

## Super 뷰 (전체 플랫폼)

Luna 기본 뷰 대신:
- 전 조직 요약 (KPI 대시보드)
- 파트너십 지표 (Anthropic 패스스루 월 매출)
- 위험 이벤트 (Super 승인 대기 액션)

```
📊 플랫폼 전체
├ 활성 고객   1개사  (월 매출 ₩7.3M)
├ 거절 대응   1건 진행 중
├ 크레딧백 종료 임박  0건 (D-60 내)
└ Anthropic 패스스루  ₩2.1M (당월)

⚠️ Super 승인 대기 (2)
├ VCN 한도 5배 증액 (Alpha - Alice) — 2시간 전
└ service.code_migrate - Alpha 사업자 변경
```

## Finance 뷰 (월말 중심)

M월 말 ~ M+1월 17일 동안 집중 모드:
```
📅 5월 마감 체크리스트
├ ✅ 배치 완료 (2026-06-01 00:42)
├ ✅ 교차 검증 (2026-06-01 02:15)
├ 🟡 Finance 검수 (오늘 10:00 ~)
├ ⏳ Super 고액 2차 (대기)
├ ⏳ Smart Bill 발행 (대기)
└ ⏳ 예치금 차감 (대기)

연체 (0)
발행 완료 이번 달 (0)
```

## Ops 뷰 (Phase 1~)

```
🚨 거절 큐 (3)
├ Alpha Inc. - Alice - OVERSEAS_BLOCK (5분 전)
├ ...

VCN 만료 임박 (2)
├ Alpha Inc. - Bob - D-14
├ Alpha Inc. - Charlie - D-28
```

## 데이터 소스

역할 감지 → 해당 쿼리 실행:
```typescript
const role = await getCurrentAdminRole();
const data = await Promise.all([
  role === 'am' || role === 'super' ? fetchAMData() : null,
  role === 'super' ? fetchSuperData() : null,
  role === 'finance' || role === 'super' ? fetchFinanceData() : null,
  role === 'ops' || role === 'super' ? fetchOpsData() : null,
].filter(Boolean));
```

## 권한

- 로그인한 admin 의 `role` + `secondary_roles` 기준
- Phase 0: Luna 는 `am + ops` → 두 뷰 통합
- Phase 0: 위버는 `super + finance` → 두 뷰 통합

## 실시간 갱신

- `action_requests` INSERT → 요청 큐 +1
- `anomaly_events` INSERT + severity='critical' → 긴급 배너 추가
- `upsell_signals` INSERT → 업셀 카드 추가
- `transactions.status = 'declined'` → Ops 뷰 거절 큐 +1

## Sprint 우선순위

**Sprint 1 필수**. Luna 출근 첫날부터 반드시 작동.

## 참조

- `am_assignments`: `schemas/INDEX.md § 5 조직·멤버`
- `upsell_signals` (I-005): `integrations/billing-wiring.md`
- `anomaly_events`: `rules/anomaly_detection.md` (PB-012)
- Super 위험 액션: `screens/console/INDEX.md § 2단계 승인`
- `admin_users.role`: `schemas/tables/admin_users.md`
