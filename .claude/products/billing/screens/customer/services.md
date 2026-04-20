# Billing / Screens / Customer / services — `/app/services`

> 전체 계정 현황. 4개 탭 (전체 / 월정액 / API / 에이전트) + 계정 상세 드로어.

---

## 목적

고객이 소유한 모든 AI 계정을 한눈에. 상태 / VCN / 한도 / 이번 달 사용량 확인.

## 레이아웃

```
┌────────────────────────────────────────────────┐
│ AI 서비스                     [+ 신규 요청]      │
├────────────────────────────────────────────────┤
│ [전체 14]  [구독 8]  [API 3]  [에이전트 3]     │
├────────────────────────────────────────────────┤
│ 필터: 🔍 검색  │ 상태: [전체▾]  │ 멤버: [전체▾] │
├────────────────────────────────────────────────┤
│ 카드 뷰 (grid-cols-3)                           │
│ ┌─────────────────────────┐                    │
│ │ 🟠 Claude Team          │                    │
│ │ 👤 Alice Kim            │                    │
│ │ 💳 ****4521             │                    │
│ │ 🟢 활성                  │                    │
│ │ ───────────────────────  │                    │
│ │ 이번 달: ₩28,500 / 30k  │                    │
│ │ 진행률 ▓▓▓▓▓▓░░░░ 95%  │                    │
│ │              [상세 ↗]    │                    │
│ └─────────────────────────┘                    │
│ ...                                             │
└────────────────────────────────────────────────┘
```

## 4개 탭 필터링

| 탭 | 조건 |
|---|---|
| 전체 | `accounts.status IN ('active','pending','suspended')` |
| 구독 | `services.category = 'subscription'` |
| API | `services.category = 'api'` |
| 에이전트 | `services.category = 'agent'` |

URL 쿼리: `?tab=all|subscription|api|agent`

## 카드 구성 요소

- **벤더 아이콘**: Claude 🟠 / ChatGPT 🟢 / Gemini 🔵 / Cursor ⚫ / 기타 ⚪
- **서비스명**: `services.display_name`
- **사용자**: `members.name` (본인은 "나")
- **VCN 마스킹**: `****{last4}`
- **상태 배지**:
  - 🟢 활성 (`active`)
  - 🟡 대기 (`pending` 또는 VCN 미등록)
  - 🔴 일시중지 (`suspended`)
  - ⚫ 해지 중 (`terminating`)
- **이번 달 사용량**: 한도 대비 진행바
  - 80% 초과 → 🟠 경고
  - 95% 초과 → 🔴 위험 + 한도 증액 제안

## 계정 상세 드로어 (`/app/services/[accountId]`)

우측 슬라이드 드로어 800px:

```
┌──────────────────────────────────────────┐
│ Claude Team · Alice Kim           [×]    │
├──────────────────────────────────────────┤
│ 상태       🟢 활성                         │
│ 개설일     2026-05-01                      │
│ 서비스 ID  svc_claude_team                 │
│                                            │
│ VCN 정보                                   │
│ ├ 카드사     신한 V-Card                   │
│ ├ 번호       **** **** **** 4521           │
│ ├ 유효기간   2027-05                       │
│ ├ 월 한도    ₩30,000                       │
│ └ 건당 한도  제한 없음                     │
│                                            │
│ 이번 달 사용량                              │
│ 진행바 ▓▓▓▓▓▓▓▓▓░ 95% (₩28,500)           │
│                                            │
│ 최근 결제 내역 (5건)                        │
│ ├ 2026-05-14  ₩28,500  Claude Team 월정액 │
│ ├ 2026-04-15  ₩28,500  ...                │
│                                            │
│ [한도 증액 요청]  [한도 낮춤]  [해지 요청]  │
└──────────────────────────────────────────┘
```

드로어 액션은 모두 `action_requests INSERT` (PB-008 Service-First).

## 데이터 소스

```sql
-- 카드 뷰
SELECT a.*, m.name AS member_name, s.display_name, s.vendor,
  vc.last4, vc.expires_at, vc.monthly_limit_krw,
  COALESCE(mtd.charge, 0) AS mtd_charge,
  ROUND(100.0 * COALESCE(mtd.charge, 0) / NULLIF(vc.monthly_limit_krw, 0), 0) AS usage_pct
FROM accounts a
JOIN members m ON m.id = a.member_id
JOIN services s ON s.id = a.service_id
LEFT JOIN virtual_cards vc ON vc.account_id = a.id AND vc.role = 'primary'
LEFT JOIN LATERAL (
  SELECT SUM(customer_charge_krw) AS charge
  FROM v_transaction_customer
  WHERE account_id = a.id
    AND authorized_at >= date_trunc('month', now())
) mtd ON TRUE
WHERE a.org_id = $1
  AND a.status IN ('active','pending','suspended')
ORDER BY mtd.charge DESC NULLS LAST;
```

## 권한

- Member: 본인 계정 (`member_id = auth.uid()`) 만
- Owner/Admin: 조직 전체
- 멤버 필터 드롭다운: Owner/Admin 만 노출

## 실시간 갱신

- `accounts.status` 변경 → 카드 배지 즉시 갱신
- `virtual_cards.status` 변경 → VCN 정보 갱신
- `transactions` INSERT → 사용량 진행바 갱신

## 빈 상태

**계정 0개 (첫 로그인 직후)**:
```
┌──────────────────────────────────┐
│        🤖                        │
│  아직 AI 서비스가 없어요.         │
│  첫 번째 계정을 요청해보세요.     │
│  [+ 신규 요청]                   │
└──────────────────────────────────┘
```

**특정 탭 빈**: "해당 카테고리에 계정이 없습니다"

## Sprint 우선순위

**Sprint 1 필수**. 온보딩 직후 바로 활용. 드로어는 Sprint 2.

## 참조

- 신규 요청: `screens/customer/services_new.md`
- 계정 데이터 모델: `schemas/tables/accounts.md`
- VCN 상태: `rules/vcn.md` (PB-002)
- Service-First: `rules/service_first.md` (PB-008)
