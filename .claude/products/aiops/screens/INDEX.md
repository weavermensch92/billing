# AiOPS / Screens — INDEX

> AiOPS 는 **관측 + 거버넌스** 도구. Super Admin + Admin Teams + Member 3단 권한에 따른 다른 뷰.

---

## 구조

```
screens/
├── INDEX.md
├── dashboard.md         조직 전체 요약 (super_admin)
├── logs_explorer.md     로그 탐색 + 필터 + 상세
├── maturity_view.md     AI 성숙도 대시보드
└── coaching_inbox.md    개인 코칭 카드 수신함
```

## 역할별 화면 경험

| 화면 | super_admin | admin_teams | member |
|---|---|---|---|
| dashboard | ✅ 조직 전체 | ❌ | ❌ |
| logs_explorer | ✅ 전체 + 민감 | ✅ 담당 팀만 | ✅ 본인만 |
| maturity_view | ✅ 조직 + 팀별 | ✅ 담당 팀 | ✅ 본인 |
| coaching_inbox | ✅ | ✅ | ✅ (핵심) |

Member 는 주로 `coaching_inbox` + 본인 `logs` 만 접근.

## 화면 공통

### 기술 스택
- Next.js 14 App Router
- Tailwind CSS + shadcn/ui
- Recharts (차트)
- Supabase Realtime (로그 스트리밍)
- Pretendard + Geist Mono

### 테마
- **라이트 모드 기본** (기업 환경)
- 포인트: `#1722E8` (Gridge)
- Claude 오렌지 / ChatGPT 초록 / Gemini 파랑 등 채널별 색

## Phase 0 Sprint 우선순위

| Sprint | 화면 | 목적 |
|---|---|---|
| **Sprint 1** | dashboard (super_admin) | 조직 AI 사용 현황 한눈에 |
| **Sprint 2** | logs_explorer | 로그 조회 + 문제 진단 |
| **Sprint 2** | coaching_inbox | Member 개인 성장 |
| **Sprint 3** | maturity_view | 조직·팀·개인 성숙도 |

## 참조

- 규칙 PA-001~011: `rules/00_index.md`
- 스키마 테이블 (8개): `schemas/tables/*.md`
- 채널 8개: `channels/*.md`
