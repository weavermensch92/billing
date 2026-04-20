# LucaPus / Screens — INDEX

> 고객이 LucaPus SaaS 플랫폼에 접속했을 때 사용하는 화면. Phase 0 Alpha 필수 4개 + 확장 예고.

---

## 구조

```
screens/
├── INDEX.md            (이 문서)
├── dashboard.md         Alpha 진입 후 메인 워크스페이스
├── spec_workbench.md    4-Plane 스펙 작성 공간
├── orchestrator_view.md 3 Orchestrator 실행 상황 모니터링
├── pipeline_runs.md     실행 이력 + 재시도 + 디버그
└── (확장 예고)
    ├── api_settings.md    고객 API 키 관리 (Mode C)
    ├── project_settings.md 프로젝트 설정
    └── history_ledger.md  파이프라인 감사 로그
```

## 제품 특성 (중요)

LucaPus 는 **B2B SaaS** 로, 고객이 직접 설치하여 사용하는 AI 개발 플랫폼.  
AiOPS / Wiring / Billing 처럼 Gridge 가 전담 운영하는 서비스와는 달리:
- **고객 관리 API 키** 가 기본 (Phase 0~1)
- **고객 셀프서비스** 중심 (AM 개입 최소화)
- **개발자 도구** 특성 (IDE 같은 워크플로)

따라서 화면 구성도 "관리자 승인 워크플로" 대신 "개발자 생산성" 중심.

## Phase 0 Sprint 우선순위

| Sprint | 화면 | 목적 |
|---|---|---|
| **Sprint 1** | dashboard | 워크스페이스 진입점 |
| **Sprint 1** | spec_workbench | 첫 스펙 작성 경험 |
| **Sprint 2** | orchestrator_view | 실행 투명성 |
| **Sprint 2** | pipeline_runs | 디버깅 + 재시도 |
| **Sprint 3+** | 확장 화면 | 세부 관리 기능 |

## 화면 공통 디자인

### 레이아웃
- **좌측 사이드바**: 프로젝트 네비 + 실행 상태 요약
- **상단 헤더**: 프로젝트 선택 + 세션 배지 (Mode A/B/C) + 사용자 메뉴
- **메인 영역**: 탭 or 단일 콘텐츠

### 테마
- **다크 모드 기본** (개발자 도구 특성)
- **Glassmorphism** 유지 (`backdrop-blur-xl`)
- **Pretendard + Geist Mono** (코드 표시 많음)
- 포인트 컬러: `#1722E8` (Gridge 브랜드 블루)

### 기술 스택
- Next.js 14 App Router
- Tailwind CSS + shadcn/ui
- Zustand (로컬 상태)
- React Flow (orchestrator 시각화)
- Monaco Editor (코드 뷰)

## 권한 모델 (LucaPus 고유)

LucaPus 는 조직 레벨에서 3단 권한:

| 역할 | 권한 |
|---|---|
| **Admin** | 조직 설정 + API 키 관리 + 모든 프로젝트 |
| **Developer** | 본인 프로젝트 생성 + 실행 + 팀 프로젝트 참여 |
| **Viewer** | 실행 이력 조회만 (감사용) |

Wiring 의 6단 위계와는 다른 단순한 3단 구조.

## Mode 전환 UX

각 화면 상단 세션 배지에서 Mode 전환 가능 (Admin 만):

```
[🔵 Mode A · Claude Opus 4 활성]  ↔  [🟣 Mode B · On-prem]  ↔  [🟠 Mode C · 고객 API]
```

Mode 변경 시 현재 실행 중 작업은 유지, 신규 작업만 새 Mode 적용.

## 참조

- 4-Plane 아키텍처: `planes/CLAUDE.md`
- 3 Orchestrator: `orchestrators/CLAUDE.md`
- LucaPus 규칙: `CLAUDE.md` (라우터)
- D-001~105 공통 spec: `rules/00_index.md`
