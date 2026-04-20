# Wiring AI — 제품 라우터

> Wiring AI (AI 개발팀 가시화 웹 UI) 작업 시 추가 로드되는 제품 라우터.
> 공통 규칙(rules/) + 이 라우터 + 필요 시 rules/ 하위 파일.
> 200줄 이내 유지.

---

## 0. 제품 개요

- **정체**: 개발자가 AI를 적합화하며 개발하고, 그 과정이 조직에 가시화되는 B2B SaaS
- **주 고객**: 엔터프라이즈 + 중견기업 (CTO/기술 리드 → PM 확장)
- **기술 스택**: Next.js 14 (App Router) / TypeScript / Tailwind / Zustand / shadcn/ui / React Flow
- **핵심 원칙**: 적합화 = 개발자의 일 (G-005 원칙 1) / 서버 필터링 우선 (G-052)

---

## 1. Wiring 작업 시 자동 로드 순서

```
ALWAYS_LOAD (이미 컨텍스트에 있음)
  ↓
rules/01_product.md (이미 로드)
rules/03_hierarchy.md (이미 로드)
rules/06_hitl.md (이미 로드)
  ↓
[이 파일]
  ↓
작업 유형별 추가 로드 (§ 3)
```

---

## 2. Wiring 주요 화면 (F-xxx PRD 기능 ID 참조)

| 화면 | F-ID | 파일 | 핵심 규칙 |
|---|---|---|---|
| 온보딩 3단계 | F-001 | `screens/onboarding.md` | 모드별 분기 (A/B/C) |
| **적합화 탭 ★핵심** | F-002 | `rules/adapt_tab.md` | PW-006, PW-007 |
| 칸반 | F-003 | `rules/kanban.md` | PW-008, Stage 분기 |
| 기획서 분석 R1~R7 | F-004 | `screens/spec_analysis.md` | PW-009 |
| 파이프라인 | F-005 | `rules/pipeline_view.md` | PW-002~005 |
| 실시간 로그 | F-006 | `screens/logs.md` | 세션 배지 모드별 |
| 산출물 | F-007 | `screens/artifacts.md` | — |
| 보고서 | F-008 | `screens/reports.md` | AiOPS 연동 탭 |
| 운영 (Stage 3) | F-009 | `screens/ops.md` | Stage 3 전용 |
| 설정 | F-010 | `screens/settings.md` | 10개 하위 메뉴 |
| Org Admin | F-011 | `screens/org_admin.md` | PW-013 |
| IDE 사이드바 | F-100 | `screens/ide.md` | L3/L4 CLI 대체 |
| **데모 시나리오 / 연출 데이터** | — | `demo/CLAUDE.md` | 세일즈 / 파일럿 시연 |

---

## 3. 작업 유형별 추가 로드

### 3.1 화면 구현 (F 체인)

| 요청 키워드 | 추가 로드 |
|---|---|
| 칸반, 6컬럼, HITL 필터 | `rules/kanban.md` + `06_hitl.md` (확인) |
| 적합화 탭, 결정 대기, 🔶🔷🔗 | `rules/adapt_tab.md` + `06_hitl.md` |
| 파이프라인, React Flow, 노드 엣지 | `rules/pipeline_view.md` + `03 § 6` |
| 기획서 분석, R1~R7 | `screens/spec_analysis.md` |
| Org Admin, 조직 관리 | `screens/org_admin.md` + `03 § 4.1` |
| 설정, 비용 관리, 인프라 상태 | `screens/settings.md` + `05_infra_mode.md` |

### 3.2 공통 규칙

| 요청 성격 | 추가 로드 |
|---|---|
| 디자인 / 스타일 / 색상 | `rules/design.md` (PW-001) |
| 위계별 UI 분기 | `rules/adapt_tab.md § 위계 필터` + `03 § 3.2` |
| 모드별 분기 (비용/배지) | `rules/session_badge.md` + `rules/cost_display.md` + `05_infra_mode.md` |
| 규칙 관계 그래프 | `rules/rule_graph.md` (PW-012, L3+ 전용) |

### 3.3 데이터 모델

Wiring 백엔드는 Supabase 기반. 스키마:

| 테이블 | 용도 | 파일 |
|---|---|---|
| `adapt_queue` | 적합화 큐 (HITL 카드) | `schemas/tables/adapt_queue.md` |
| `rules` | 확정 규칙 타임라인 | `schemas/tables/rules.md` |
| `items` | 칸반 아이템 | `schemas/tables/items.md` |
| `agents` | AI 에이전트 상태 | `schemas/tables/agents.md` |
| `audit_logs` | 감사 로그 (G-141) | `schemas/tables/audit_logs.md` |

전수 목록: `schemas/INDEX.md`.

---

## 4. Wiring 전용 절대 규칙

이 제품 내부에서 위반 시 Conflict 자동 발동:

1. **적합화 카드에 기술 결정을 L2에게 라우팅** — PW-007 위반, G-103 위반
2. **클라이언트 조건 분기로 위계별 UI 숨기기** — G-052 위반
3. **에이전트 모델 직접 변경 드롭다운 추가** — G-025 위반 (LucaPus 정합성 7)
4. **내부 용어 UI 노출** (LucaPus / 하네스 / IR / DevPlane) — G-004 위반
5. **PM이 결정 큐를 비운다는 카피** — G-005 원칙 1 위반
6. **카드 타입 4종 외 신규 추가** — G-102 위반

---

## 5. Wiring Zustand 스토어 구조

```typescript
stores/useAuthStore        // level + mode + stage (4축 저장)
stores/useOrgStore         // 조직 + 팀 + 조직 규칙
stores/useProjectStore     // 프로젝트 + 기술 스택
stores/useAdaptStore       // 적합화 리스트 + 확정 규칙 타임라인 ★
stores/useItemStore        // 칸반 아이템
stores/useAgentStore       // AI 에이전트 (모드별 세션)
stores/useLogStore         // 활동 로그
stores/useEdgeStore        // 파이프라인 엣지
stores/useIntegrationStore // 외부 도구 연동 상태
stores/useAuditStore       // 감사 로그
```

**`useAuthStore.mode` 변경 시 모든 UI 재렌더링** — 세션 배지/비용/서브노드 전부 분기.

---

## 6. Wiring 네비게이션 분기

Stage 기반 탭 노출:

| Stage 0 | `[적합화] [설정]` |
|---|---|
| Stage 1 | `[적합화] [칸반] [로그] [보고서] [설정]` |
| Stage 2 | `[적합화] [칸반] [파이프라인] [로그] [산출물] [보고서] [설정]` |
| Stage 3 | `[적합화] [칸반] [파이프라인] [로그] [산출물] [보고서] [운영] [설정]` |

**"적합화" 탭은 Stage 무관 항상 1번 위치.**

위계 기반 추가 탭:
- `[조직 관리]` — OA만 (F-011)

---

## 7. Wiring 외부 연동

| 도구 | 연동 방식 | 규칙 ID |
|---|---|---|
| Jira | REST + Webhook 양방향 | L-005 |
| Slack | Bot + 인라인 승인 | L-006 |
| GitHub/GitLab | PR 자동 생성 | L-007 |
| SSO | SAML/OIDC | G-046 |
| Jenkins/ArgoCD | Webhook 배포 트리거 | L-011 |
| SonarQube | API 품질 게이트 | L-012 |
| Confluence | API 산출물 게시 | L-013 |

상세: `integrations/lucapus-external.md`.

---

## 8. 제품 라우터 크기 제한 준수

이 파일 ≤ 200줄. 초과 시 `rules/` 또는 `screens/` 로 분할.

개별 규칙 본문은 여기에 적지 않음. ID와 파일 위치만.
