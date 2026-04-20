# Billing / Screens / Customer / home — `/app/home`

> 고객 포털 홈 대시보드. 조직 현황 한눈에 + 액션 유도.

---

## 목적

로그인 직후 첫 화면. "오늘 뭘 봐야 하나 / 뭘 해야 하나" 5초 내 파악.

## 레이아웃

```
┌────────────────────────────────────────────────────┐
│ Alpha Inc. · 2026년 5월                             │
├────────────────────────────────────────────────────┤
│ StatCard 4개 (grid-cols-4)                          │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐      │
│ │ 계정    │ │ 이번 달 │ │ 진행 중 │ │ 크레딧백 │   │
│ │ 활성 14 │ │ ₩7.3M  │ │ 요청 2  │ │ M3 / 6  │    │
│ │ ▲ 2     │ │ MoM +12%│ │ 🔴 1   │ │ ₩770k   │    │
│ └────────┘ └────────┘ └────────┘ └────────┘      │
├────────────────────────────────────────────────────┤
│ 최근 활동 타임라인 (10건)                           │
│ ├ VCN 발급 완료 — Alice (Claude Team)  · 2h 전      │
│ ├ 청구서 발행 — 2026년 4월              · 2d 전     │
│ ├ 신규 서비스 요청 — Bob (Cursor Business) · 3d 전  │
│ └ ...                                              │
├────────────────────────────────────────────────────┤
│ 📊 지난 6개월 결제 추이 (라인 차트)                  │
│ 📈 이번 달 서비스별 지출 (도넛)                      │
└────────────────────────────────────────────────────┘
```

## StatCard 4개 상세

### 1. 활성 계정
- 현재: `COUNT(accounts WHERE status='active' AND org_id=$1)`
- 비교: 이전 월 대비 증감 (▲ 2 / ▼ 1)
- 클릭 → `/app/services`

### 2. 이번 달 결제
- 현재: `SUM(customer_charge_krw)` 당월 settled+authorized
- 비교: MoM % 변화
- 클릭 → `/app/billing/transactions`

### 3. 진행 중 요청
- 현재: `COUNT(action_requests WHERE status NOT IN ('completed','cancelled','rejected'))`
- 경고 아이콘: `status='awaiting_customer'` 건 있으면 🔴 + 개수
- 클릭 → `/app/requests`

### 4. 크레딧백 진행
- 현재: `creditback_end_date - contract_start_date` 중 경과 비율
- 표시: `M3 / 6` (3개월차 / 6개월)
- 누적 금액: `SUM(credit_backs.credit_amount_krw)`
- 클릭 → `/app/billing/creditback`

## 최근 활동 타임라인

`audit_logs` 에서 `visibility IN ('customer_only','both')` 조건:

```sql
SELECT al.*, 
  CASE 
    WHEN al.actor_type = 'customer' THEN m.name 
    WHEN al.actor_type = 'admin' THEN au.name
    ELSE 'System'
  END AS actor_display_name
FROM audit_logs al
LEFT JOIN members m ON m.id = al.actor_id AND al.actor_type = 'customer'
LEFT JOIN admin_users au ON au.id = al.actor_id AND al.actor_type = 'admin'
WHERE al.org_id = $1
  AND al.visibility IN ('customer_only','both')
ORDER BY al.created_at DESC
LIMIT 10;
```

표시 형식: `{아이콘} {액션 설명} — {대상} · {상대 시간}`

## 차트

### 지난 6개월 결제 추이 (라인)
- X축: 월
- Y축: ₩
- 시리즈: Anthropic 패스스루 (별도 색) / 일반 서비스
- Recharts `<LineChart>`

### 이번 달 서비스별 지출 (도넛)
- 데이터: `SELECT service_id, SUM(customer_charge_krw)` 당월
- 상위 5개 + 기타 병합
- 호버 시 툴팁 (금액, 비중)

## 데이터 소스

```typescript
// 모든 데이터 병렬 페치
const [stats, activity, chartMonthly, chartServices] = await Promise.all([
  fetch('/api/home/stats'),
  fetch('/api/home/activity?limit=10'),
  fetch('/api/home/chart/monthly?months=6'),
  fetch('/api/home/chart/services?month=current'),
]);
```

## 권한

- 모든 멤버: ✅
- Owner/Admin: StatCard 4개 전부
- Member: StatCard 3개만 (#2 "이번 달 결제" 는 본인 계정 지출만 표시)

## 실시간 갱신 (Supabase Realtime)

- `action_requests` UPDATE → StatCard #3 갱신
- `transactions` INSERT → StatCard #2 갱신
- `audit_logs` INSERT → 활동 타임라인 상단 추가

## 빈 상태 (Alpha Day 1)

계정 0개:
```
┌──────────────────────────────┐
│   🚀                         │
│   첫 AI 계정을 설정해볼까요?   │
│   담당 AM Luna 가 도와드립니다. │
│   [첫 계정 요청하기]          │
└──────────────────────────────┘
```

## Sprint 우선순위

**Phase 0 Sprint 1 필수**. Alpha 온보딩 Day 1 이후 가장 먼저 보는 화면.

- StatCard 4개 → Sprint 1 완성
- 차트 2개 → Sprint 3 추가
- 타임라인 → Sprint 2 추가

## 참조

- 권한 매트릭스: `screens/customer/INDEX.md § 권한`
- audit_logs 가시성: `rules/audit_visibility.md` (PB-010)
- 크레딧백 규칙: `rules/creditback.md` (PB-004)
- 원본: `04_고객_포털_스펙.md § /app/home`
