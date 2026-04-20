# Billing / Screens / Customer / org_members — `/app/org/members`

> 조직 멤버 관리. Owner/Admin 전용. 초대 / 권한 변경 / 오프보딩 진입점.

---

## 목적

Owner/Admin 이 조직의 모든 멤버와 그들의 AI 계정 현황을 한눈에. 초대·권한·오프보딩 실행.

## 레이아웃

```
┌──────────────────────────────────────────────────────┐
│ 조직 관리 > 멤버                [+ 멤버 초대]         │
├──────────────────────────────────────────────────────┤
│ 필터: [전체]  활성  초대 대기  오프보딩 중            │
├──────────────────────────────────────────────────────┤
│ 이름        역할       상태     팀          계정   계  │
│ Alice Kim   Owner     🟢      개발팀       3개  ₩85k │
│ Bob Lee     Admin     🟢      마케팅팀     4개  ₩142k│
│ Charlie P.  Admin     🟢      개발팀       4개  ₩88k │
│ Diana       Member    🟢      개발팀       2개  ₩55k │
│ Eve         Member    🟡(초대) -           0개  -    │
│ Frank       Member    🟠(오프)개발팀       7개  -    │
│   └ 오프보딩 진행 중 D+2/7 ...                        │
│ ...                                                    │
└──────────────────────────────────────────────────────┘
```

## 상태 표시

| 상태 | 아이콘 | 의미 |
|---|---|---|
| 🟢 active | 녹색 | 활성 (로그인 가능 + 계정 사용) |
| 🟡 invited | 노란 | 초대 전송, 수락 대기 |
| 🟠 offboarding | 오렌지 | 오프보딩 진행 중 (D+N/7) |
| 🔴 offboarded | 빨강 | 오프보딩 완료 (로그인 불가) |
| ⚫ suspended | 회색 | 일시 중지 |

## 역할 배지

| 역할 | 배지 |
|---|---|
| Owner | 🌟 Owner (한 명만) |
| Admin | 🛡️ Admin |
| Member | 👤 Member |

## 행 액션

각 행 우측 `[⋯]` 메뉴:

### Owner 본인 행
- [프로필 편집]
- [Owner 양도] → 양도 다이얼로그

### 다른 Owner/Admin/Member 행
- [상세 보기] → 드로어
- [역할 변경] (Admin → Member / Member → Admin)
- [팀 변경]
- [초대 재발송] (status='invited' 만)
- [오프보딩 시작] → `/org/members/[id]/offboarding` 이동

## 멤버 상세 드로어 (`/org/members/[id]`)

```
┌────────────────────────────────────────┐
│ Alice Kim                         [×]   │
├────────────────────────────────────────┤
│ 이메일:      alice@alpha.co.kr          │
│ 역할:        Admin                      │
│ 팀:          개발팀                     │
│ 가입일:      2026-04-01 (D+45)          │
│ 최근 로그인: 2시간 전                    │
│                                          │
│ ────── 사용 중 AI 서비스 (3) ──────     │
│ 🟠 Claude Team        ₩28,500 / ₩30k   │
│ 🟢 ChatGPT Team       ₩34,000 / ₩35k   │
│ 🔵 Anthropic API      사용량 기반        │
│                                          │
│ ────── 최근 요청 (2) ──────             │
│ • 한도 증액 (승인됨) - 3일 전           │
│ • VCN 재발급 (진행 중) - 오늘           │
│                                          │
│ [역할 변경]  [팀 변경]  [오프보딩 시작] │
└────────────────────────────────────────┘
```

## 멤버 초대 (`/org/members/new`)

```
┌────────────────────────────────────────┐
│ 새 멤버 초대                            │
├────────────────────────────────────────┤
│ 이메일 (필수)                           │
│ ┌──────────────────────────────────┐  │
│ │ alice@example.com                │  │
│ └──────────────────────────────────┘  │
│                                          │
│ 이름 (선택)                             │
│ ┌──────────────────────────────────┐  │
│ │ Alice Kim                        │  │
│ └──────────────────────────────────┘  │
│                                          │
│ 역할                                    │
│ ○ Member (기본)                         │
│ ○ Admin (조직 관리 권한)                │
│                                          │
│ 팀 (선택)                               │
│ ┌──────────────────────────────────┐  │
│ │ 개발팀 ▾                         │  │
│ └──────────────────────────────────┘  │
│                                          │
│ 메시지 (초대 이메일 포함, 선택)          │
│ ┌──────────────────────────────────┐  │
│ │                                   │  │
│ └──────────────────────────────────┘  │
│                                          │
│             [취소]  [초대 발송]         │
└────────────────────────────────────────┘
```

초대 발송:
1. `members INSERT (status='invited', invited_by)`
2. Supabase Auth `inviteUserByEmail`
3. `audit_logs INSERT (visibility='both', action='member_invited')`
4. 이메일 발송

## Owner 양도

```
┌────────────────────────────────────────┐
│ ⚠️ Owner 양도                           │
│                                          │
│ Owner 권한은 반드시 1명에게만 있습니다.  │
│ 양도 후 본인은 Admin 으로 변경됩니다.    │
│                                          │
│ 양도 대상 (현재 Admin 중 선택):          │
│ ○ Bob Lee                                │
│ ○ Charlie P.                             │
│                                          │
│ 확인을 위해 본인 이메일 입력:            │
│ ┌──────────────────────────────────┐  │
│ │                                   │  │
│ └──────────────────────────────────┘  │
│                                          │
│         [취소]  [양도 확정]             │
└────────────────────────────────────────┘
```

본인 이메일 입력 → `members.role` 트랜잭션 (PB-001 Owner 1명 유지).

## 데이터 소스

```sql
-- 리스트
SELECT m.*, t.name AS team_name,
  (SELECT COUNT(*) FROM accounts WHERE member_id = m.id AND status = 'active') AS active_accounts,
  (SELECT SUM(customer_charge_krw) FROM v_transaction_customer t
    JOIN accounts a ON a.id = t.account_id
    WHERE a.member_id = m.id 
      AND t.authorized_at >= date_trunc('month', now())) AS mtd_spending,
  -- 오프보딩 진행 상태
  (SELECT oe.completion_stats FROM offboarding_events oe
    WHERE oe.member_id = m.id AND oe.completed_at IS NULL) AS offboarding_progress
FROM members m
LEFT JOIN teams t ON t.id = m.team_id
WHERE m.org_id = $1
ORDER BY 
  CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
  m.name;
```

## 권한

- **Owner/Admin**: 모든 기능
- **Member**: 사이드바에서 이 메뉴 숨김
- Owner 양도는 Owner 본인만

## Sprint 우선순위

**Sprint 2 필수** (초대 기본 기능). 상세 드로어 + 오프보딩은 Sprint 3~4.

## 참조

- `members` 스키마: `schemas/tables/members.md`
- Owner 양도 원칙: `rules/reseller.md` (PB-001)
- 오프보딩 상세: `screens/customer/org_members_offboarding.md`
- 역할 매트릭스: `screens/customer/INDEX.md § 권한 매트릭스`
