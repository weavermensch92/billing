# Billing / Screens / Customer Portal — INDEX

> `app.gridge.ai` 고객 포털. 32개 화면 / 27개 고유 URL / 7개 섹션.
> Next.js 14 + Tailwind + Supabase Auth + Realtime.

---

## 기술 전제

- **브랜드 블루** `#1722E8`, **경고 오렌지** `#FF8A00`
- Pretendard (본문) + Geist Mono (금액·수치)
- Zustand (상태) + Recharts (차트)
- Supabase Realtime 구독: `transactions` / `action_requests` / `invoices`

## 사이트맵

```
/login                       로그인 (Magic Link)
/onboarding                  초대 수락 후 최초 설정

/app                         (대시보드 레이아웃 — 사이드바 + 헤더)
├── /app/home                ★ 홈 (대시보드)
│
├── /app/services            AI 서비스 관리
│   ├── ?tab=all|sub|api|agent  전체 / 월정액 / API / 에이전트
│   ├── /services/[accountId]   계정 상세 (드로어)
│   └── /services/new           신규 요청 wizard
│
├── /app/requests            요청 내역
│   ├── ?filter=active|completed
│   └── /requests/[requestId]
│
├── /app/billing             청구·정산 (Owner/Admin)
│   ├── /billing             월별 청구서 리스트
│   ├── /billing/[invoiceId]       청구서 상세 (드로어)
│   ├── /billing/transactions      결제 내역
│   └── /billing/creditback        크레딧백 현황
│
├── /app/org                 조직 (Owner/Admin)
│   ├── /org                 조직 정보
│   ├── /org/teams           팀 관리
│   ├── /org/teams/[teamId]  팀 상세 (드로어)
│   ├── /org/members         멤버 관리
│   ├── /org/members/new     멤버 초대
│   ├── /org/members/[id]                 멤버 상세
│   └── /org/members/[id]/offboarding     오프보딩 3단계
│
├── /app/settings            설정
│   ├── /settings                     내 계정
│   ├── /settings/notifications       알림
│   ├── /settings/integrations        연동 (Slack 등)
│   ├── /settings/security            보안
│   ├── /settings/audit-log           감사 로그
│   ├── /settings/audit-log/[id]      로그 상세 (드로어)
│   └── /settings/data-export         데이터 내보내기
│
└── /app/discover            업셀 허브 (Owner/Admin, AiOPS/Wiring 소개)
```

---

## 27개 URL 목록

| # | 경로 | 목적 | 권한 |
|---|---|---|---|
| 1 | `/login` | Magic Link 로그인 | public |
| 2 | `/onboarding` | 최초 설정 | invited |
| 3 | `/app/home` | 대시보드 | all |
| 4 | `/app/services` | 전체 계정 현황 (탭 4개) | all |
| 5 | `/app/services/[id]` | 계정 상세 | self/admin |
| 6 | `/app/services/new` | 신규 요청 wizard | all |
| 7 | `/app/requests` | 요청 내역 | self/admin |
| 8 | `/app/requests/[id]` | 요청 상세 | self/admin |
| 9 | `/app/billing` | 월별 청구서 | owner/admin |
| 10 | `/app/billing/[id]` | 청구서 상세 (드로어) | owner/admin |
| 11 | `/app/billing/transactions` | 결제 내역 | self/owner/admin |
| 12 | `/app/billing/creditback` | 크레딧백 현황 | owner/admin |
| 13 | `/app/org` | 조직 정보 | owner/admin |
| 14 | `/app/org/teams` | 팀 관리 | owner/admin |
| 15 | `/app/org/teams/[id]` | 팀 상세 (드로어) | owner/admin |
| 16 | `/app/org/members` | 멤버 관리 | owner/admin |
| 17 | `/app/org/members/new` | 멤버 초대 | owner/admin |
| 18 | `/app/org/members/[id]` | 멤버 상세 | owner/admin |
| 19 | `/app/org/members/[id]/offboarding` | 오프보딩 3단계 | owner/admin |
| 20 | `/app/settings` | 내 계정 | all |
| 21 | `/app/settings/notifications` | 알림 설정 | all |
| 22 | `/app/settings/integrations` | 연동 관리 | owner/admin |
| 23 | `/app/settings/security` | 보안 | all |
| 24 | `/app/settings/audit-log` | 감사 로그 | owner/admin (본인은 본인것만) |
| 25 | `/app/settings/audit-log/[id]` | 로그 상세 (드로어) | owner/admin |
| 26 | `/app/settings/data-export` | 데이터 내보내기 | owner |
| 27 | `/app/discover` | 업셀 허브 | owner/admin |

---

## 공통 App Shell

- 왼쪽 사이드바 220px (아이콘 + 라벨 + 배지)
- 상단 헤더 56px (로고, 조직명, 알림 벨, 프로필)
- 콘텐츠 최대 1200px 중앙 정렬
- 빈 상태 / 로딩 스켈레톤 / 에러 토스트 재사용

### 사이드바 (7 메뉴)

| 메뉴 | 경로 | 조건 |
|---|---|---|
| 🏠 홈 | `/app/home` | 항상 |
| 💳 AI 서비스 | `/app/services` | 항상 |
| 📋 요청 내역 | `/app/requests` (배지 N) | 항상 |
| 🧾 청구·정산 | `/app/billing` | Owner/Admin |
| 👥 조직 | `/app/org` | Owner/Admin |
| ⚙️ 설정 | `/app/settings` | 항상 |
| 💡 더 알아보기 | `/app/discover` | Owner/Admin |

---

## Phase 0 Sprint 1~4 구현 우선순위

### Sprint 1 (Alpha 온보딩 직전 필수)
1. `/login` + `/onboarding`
2. `/app/home` (StatCard 4개만)
3. `/app/services` (카드 뷰 기본)
4. `/app/services/[id]` 드로어

### Sprint 2 (요청 처리 가능)
5. `/app/services/new` wizard (5 유형)
6. `/app/requests` + `/app/requests/[id]`
7. `/app/org`
8. `/app/org/members` 전수

### Sprint 3 (청구서 운영 가능)
9. `/app/billing` + `/app/billing/[id]` 드로어
10. `/app/billing/transactions`
11. `/app/billing/creditback`
12. `/app/settings` 전수
13. `/app/org/members/[id]/offboarding`

### Sprint 4 (Phase 0 마무리)
14. `/app/settings/audit-log` + 드로어
15. `/app/settings/data-export`
16. `/app/discover` (간단 버전)
17. 알림 시스템
18. Supabase Realtime 구독

## 개별 페이지 스펙

Phase 0 Day-1 필수 페이지만 개별 본문 (향후 확장):
- `home.md` (v0.19+)
- `services.md`
- `services_new.md`
- `requests.md`
- `billing.md`
- `creditback.md`

원본 전수 스펙: 프로젝트 knowledge `04_고객_포털_스펙.md`.

## 권한 매트릭스

| 행위 | Owner | Admin | Member |
|---|---|---|---|
| 내 계정 / 알림 | ✅ | ✅ | ✅ |
| 신규 서비스 요청 (본인) | ✅ | ✅ | ✅ |
| 신규 서비스 요청 (타인 대신) | ✅ | ✅ | ❌ |
| 조직 정보 수정 | ✅ | ❌ | ❌ |
| 팀·멤버 관리 | ✅ | ✅ | ❌ |
| 청구·정산 조회 | ✅ | ✅ | ❌ |
| 연동 관리 | ✅ | ✅ | ❌ |
| Slack 해제 | ✅ | ❌ | ❌ |
| 감사 로그 (조직 전체) | ✅ | ✅ | ❌ 본인만 |
| 내보내기 (전체 ZIP) | ✅ | ❌ | ❌ |

## 참조

- 운영 콘솔: `screens/console/INDEX.md`
- 원본 전수: `04_고객_포털_스펙.md` (프로젝트 knowledge)
- Service-First 원칙: `products/billing/CLAUDE.md § 7-1`
