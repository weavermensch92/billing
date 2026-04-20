# 93_Workflow — 개발 프로세스 규칙

> Claude Code가 코드를 쓸 때 **형상 관리와 협업 프로세스를 어떻게 지켜야 하는지** 정의.
> "언제 브랜치를 따는가, 언제 커밋하는가, 언제 PR을 올리는가, 누가 리뷰하는가, 언제 배포하는가."

---

## 1. 브랜치 전략

### G-200 — 브랜치 네이밍

체인 시작 시 **자동으로** 브랜치 생성:

| 체인 | 접두사 | 예 |
|---|---|---|
| F (Feature) | `feat/` | `feat/wiring-kanban-hitl-filter` |
| R (Refactoring) | `refactor/` | `refactor/aiops-proxy-extract-tenant` |
| S (Schema) | `chore/schema-` | `chore/schema-add-tenant-id` |
| D (Debug) | `fix/` | `fix/point-consume-race-condition` |
| V (Verification) | `verify/` | `verify/sam-file-layout` |
| M (Migration) | `migration/` | `migration/multi-tenant-split` |
| I (Integration) | `integ/` | `integ/aiops-wiring-log-pipeline` |

슬러그 규칙: kebab-case / 영문 / 최대 50자 / 제품명 → 도메인 → 행위 순.

### G-201 — main 브랜치 보호

- `main` 직접 커밋 **절대 금지**
- `main` 은 항상 프로덕션 배포 가능한 상태 유지
- 긴급 패치도 반드시 브랜치를 거침 (`fix/hotfix-<slug>`)

### G-202 — 브랜치 수명

- 체인 완료 + PR merge 후 **자동 삭제**
- 7일 이상 열린 PR → `/gz-feedback` 자동 생성하여 원인 기록
- 30일 이상 방치 → OA 알림 + 강제 닫기 제안

---

## 2. 커밋 규칙

### G-203 — 커밋 단위

**하나의 논리적 변경 = 하나의 커밋.** 물리적 파일 수 기준 아님.

- 타입 정의 + 해당 기능 구현 → **1 커밋** (논리적으로 한 단위)
- 기능 A + 기능 B → **2 커밋** (논리 다름)
- 대규모 리팩토링 → 의미 단위로 분할 (함수/모듈/패턴별)

체인 진행 중 **3~5 파일 수정마다** 커밋 기회 검토. 너무 큰 커밋 금지.

### G-204 — 커밋 메시지 포맷

```
<type>(<scope>): <summary>

<body (선택)>

Refs: <규칙 ID 쉼표 구분>
Chain: <체인 기호>
Decisions: <중요 결정 요약, 있으면>
```

| 필드 | 값 |
|---|---|
| `type` | feat / fix / refactor / chore / test / docs / style / perf |
| `scope` | 제품 또는 모듈명 (wiring, aiops-proxy, lucapus-cli 등) |
| `summary` | 50자 이내, 한글 또는 영문, 명령형 |
| `Refs` | 적용된 규칙 ID (G-xxx, D-xxx, PA/PL/PW-xxx) |
| `Chain` | F / R / S / D / V / M / I |
| `Decisions` | HITL로 결정된 항목 요약 (예: "낙관적 락 선택, D-025") |

### G-205 — 커밋 메시지 예시

```
feat(wiring): 칸반에 HITL 필터 추가

L2/L3 위계별 필터 노출 차이 구현. Stage 3에서만 활성화.
FilterBar는 기존 패턴 재사용.

Refs: PW-008, PW-007, G-044, G-062
Chain: F
Decisions: 필터 상태는 URL 쿼리스트링 기반 (공유 가능성 우선)
```

### G-206 — 커밋 금지 항목

- 시크릿 / API 키 / 토큰 (AES 암호화된 것도 금지 — 변경 이력 추적 가능성)
- 대용량 이진 파일 (`.mp4`, `.pdf` 10MB+) → Git LFS
- 개인 설정 파일 (`.env.local`, `.vscode/settings.json`) → `.gitignore`
- 생성 파일 (`dist/`, `build/`, `.next/`) → `.gitignore`
- `.claude/issue/conflicts-*.md`, `.claude/issue/knowledge-*.md` → `.gitignore` (민감 정보 포함 가능)

`.context/issue/` 는 **프로젝트 결정이므로 커밋 대상.** 단 민감 정보는 제거 후.

---

## 3. Pull Request 규칙

### G-207 — PR 생성 시점

체인 완료 시 Claude Code가 **자동으로** PR draft 생성:

- 체인이 완료(`90 § 산출물 6단계`)되었을 때
- 사용자가 세션 종료 신호를 보냈을 때(`92 § G-195`)
- 체크포인트 저장이 필요할 때 WIP 태그 부착

### G-208 — PR 제목 포맷

```
[<체인>] <요약>
```

예:
- `[F] Wiring 칸반 HITL 필터 추가`
- `[S] AiOPS logs 테이블에 tenant_id 추가`
- `[I] AiOPS → Wiring 로그 파이프라인 v2`

### G-209 — PR 본문 자동 생성

```markdown
## 요약
<한 줄>

## 4축
- 제품: Wiring / 모드: A / 위계 타깃: L2, L3 / Stage: 3

## 변경 내용
- <파일명>: <변경 요약>
- <파일명>: <변경 요약>

## 적용 규칙
- PW-008: 칸반 6컬럼 유지
- PW-007: 위계별 필터 노출
- G-044: 역할별 라우팅

## 분기 처리
- [ ] 위계 분기 (L2 / L3)
- [ ] 모드 분기 (해당 없음 — 모드 A 전용)
- [ ] Stage 분기 (Stage 3 전용)

## HITL 결정
- 필터 상태 저장 방식 → URL 쿼리스트링 (L3 이시니어 승인)

## 검증 체크리스트
- [ ] 코딩 표준 (G-120~125) 준수
- [ ] 제품 규칙 (PW-*) 준수
- [ ] 타입 에러 0건
- [ ] 기존 테스트 전량 통과
- [ ] 신규 테스트 추가
- [ ] 위계·모드·Stage 분기 누락 없음
- [ ] 감사 로그 대상 여부 확인 (G-141)
- [ ] 외부 노출 용어 금지 (G-004) — 있으면 UI 문구 확인

## 관련 이슈
- Closes #<이슈 번호>
- Knowledge: `.context/issue/knowledge-*_kanban-filter-pattern.md`

## Chain Log
- Chain: F
- 사전 로드: products/wiring/CLAUDE.md + PW-008 + 06_hitl.md
- 체인 전환 없음
- 자동 생성 Knowledge: 2건
```

### G-210 — WIP / Draft

세션 미완료 상태로 종료 시:
- 제목 앞에 `[WIP]` 붙이고 draft 유지
- 재개 가능한 `.claude/issue/resume-*.md` 링크를 PR 본문에 포함
- 완료되면 자동으로 `[WIP]` 제거 + ready for review

---

## 4. 리뷰 의무

### G-211 — 리뷰어 자동 지정

PR 생성 시 Claude Code가 변경 영역을 분석하여 리뷰어 자동 제안:

| 변경 영역 | 필수 리뷰어 | 추가 리뷰어 |
|---|---|---|
| Wiring UI | Wiring L3 1명 | — |
| AiOPS 프록시 | AiOPS L3 1명 | — |
| LucaPus 엔진 | LucaPus L3 1명 | — |
| 제품 간 연동 | 양쪽 제품 L3 **각 1명** (공동 승인) | — |
| 보안/컴플라이언스 | L3 + **OA 1명** | — |
| DB 스키마 변경 | L3 + L4 (DBA 역할) | — |
| 배포 스크립트 | L3 + OA | — |
| 룰북 자체 (`rules/`) | L3 + OA (98_governance § 8) | — |

### G-212 — 리뷰 체크리스트 (자동 코멘트)

Claude Code가 PR 생성과 동시에 **규칙 기반 자가 리뷰 코멘트** 작성:

```
🤖 AI 자가 리뷰 (사람 리뷰 전 참고용)

✅ G-120 TypeScript strict: 통과
✅ G-121 파일 500줄 이하: 통과 (최대 387줄)
⚠ G-124 비동기 병렬화: filter-action.ts L42 — 순차 호출 중, Promise.all로 변경 권장
✅ PW-007 위계 필터: L2/L3 분기 로직 확인
⚠ G-141 감사 로그: 필터 변경 이력 기록 누락 — 감사 대상인지 L3 확인 필요
```

### G-213 — 규칙 위반 의심 시

리뷰어가 MUST 규칙 위반을 발견하면:

1. PR 변경 요청 (Request changes)
2. 위반 규칙 ID 명시 + 본문 인용
3. 개발자(AI 또는 사람)가 수정 후 재요청
4. 수정 불가 시 → `/gz-conflict` 발동 + `92 § G-187` 예외 신청 절차

### G-214 — 리뷰 완료 기준

- 필수 리뷰어 **전원 승인** (공동 승인 경우 모두)
- CI 전량 통과 (타입/린트/테스트)
- 충돌 없음
- AI 자가 리뷰 ⚠ 항목 전부 해결 또는 사유 기록

조건 충족 시 → `main` merge 가능.

---

## 5. 테스트 규칙

### G-215 — 체인별 테스트 의무

| 체인 | 필수 테스트 |
|---|---|
| F (Feature) | 단위 테스트 + 통합 테스트 (새 공개 API마다) |
| R (Refactoring) | 기존 테스트 **전량 통과** (신규 추가 불필요) |
| S (Schema) | 마이그레이션 정·역방향 테스트 + 기존 쿼리 회귀 |
| D (Debug) | **결함 재현 테스트 먼저** → 수정 후 통과 |
| V (Verify) | 검증 자체가 테스트, 코드 테스트 불필요 |
| M (Migration) | 배치별 smoke test + 전체 회귀 |
| I (Integration) | 계약(contract) 기반 mock + 실 통합 테스트 |

### G-216 — 커버리지 목표

| 제품 | 라인 커버리지 | 핵심 경로 커버리지 |
|---|---|---|
| AiOPS 프록시 | 80% | 100% (로그 유실 방지) |
| AiOPS 대시보드 | 60% | 80% |
| LucaPus 엔진 | 85% | 100% (정합성 게이트) |
| Wiring UI | 60% | 80% (위계 분기, HITL 흐름) |
| Wiring 백엔드 | 80% | 100% |

커버리지 목표 미달 → PR 경고, merge 가능 (단 OA에게 보고).

### G-217 — 테스트 데이터

- 실제 고객 데이터 테스트 사용 **절대 금지** (G-144)
- 합성 데이터 전용 픽스처 사용
- 고객 이름/회사명 등은 난수 생성기 사용 (cafe24 같은 실명 가능 — 공개 정보)

---

## 6. 배포 사이클

### G-218 — 배포 환경 계층

```
local → dev → staging → production
```

- local: 개발자 개인 환경
- dev: 통합 테스트 환경, 모든 PR이 자동 배포
- staging: 리허설 환경, main merge 시 자동 배포
- production: 수동 승인 배포만 가능

### G-219 — Mode별 배포 차이

| 모드 | 배포 주체 | 방식 |
|---|---|---|
| A 매니지드 | 그릿지 | staging → production 자동 승인 |
| B 온프레미스 | 고객 (그릿지 지원) | 설치 스크립트 + 마이그레이션 가이드 전달 |
| C 고객 API | 그릿지 | A와 동일, API 키만 다름 |

Mode B 는 PR merge ≠ 고객 배포. **별도 릴리즈 노트 + 마이그레이션 문서** 생성이 배포 전제.

### G-220 — 배포 승인

- staging → production 승인: **L3 기술 리드** 1명
- 보안/스키마/정합성 관련 변경 포함 시: L3 + OA 공동
- 롤백 계획이 PR 본문에 명시되어 있어야 승인 가능
- 배포 시간대: 업무 시간 내 권장 (장애 대응 가능성), 금요일 오후 배포 지양

---

## 7. 문서화 규칙

### G-221 — 자동 문서 갱신

코드 변경이 아래에 해당하면 문서 갱신이 PR에 포함되어야 함:

| 변경 | 자동 갱신 대상 |
|---|---|
| 공개 API 시그니처 | API 문서 |
| 규칙 신규/수정 | `00_index.md` + 해당 본문 파일 |
| 새 명령어 추가 | `commands/*.md` |
| 새 체인 추가 | `90_execution_chain.md` |
| 스키마 변경 | `schemas/<table>.md` |
| 제품 경계 변경 | `01_product.md` + `integrations/*.md` |

### G-222 — 자동 문서화 트리거

3회 이상 재등장한 결정/패턴 → `/gz-pattern` 자동 → Knowledge 생성 → 승격 검토.

---

## 8. 릴리즈 관리

### G-223 — 시맨틱 버전

| 변경 | 버전 증가 | 예 |
|---|---|---|
| 오타, 내부 구현 개선, 버그 수정 | patch | 1.2.3 → 1.2.4 |
| 기능 추가 (하위 호환) | minor | 1.2.3 → 1.3.0 |
| 호환성 깨짐, 규칙 네임스페이스 변경 | major | 1.2.3 → 2.0.0 |

### G-224 — 릴리즈 노트

모든 production 배포는 릴리즈 노트 동반:

```markdown
## v0.3.0 — 2026-04-25

### Added
- Wiring 칸반 HITL 필터 (PW-008)

### Changed
- AiOPS 프록시 응답 포맷 개선 (PA-002)

### Fixed
- 포인트 동시성 락 버그 (D-025)

### Breaking
- 없음

### Migration
- Mode B 고객: `migrations/2026-04-25_add_tenant_id.sql` 실행 필요

### Contributors
- L3: 이시니어, 박리드
- OA: 위버
- AI: Claude Code (chain: F×3, S×1, D×1)
```

---

## 9. 룰북 자체의 프로세스

룰북 파일(`rules/*.md`, `products/*/rules/*.md`)의 변경도 이 워크플로우를 따른다.

- 브랜치: `rules/<요약>`
- 리뷰: L3 기술 리드 + 대상에 따라 OA
- 테스트: 룰북 정합성 체크 스크립트 (예: ID 중복 / 파일 분량 상한 / 참조 깨짐)
- 배포: `npm version` → `npm publish` → 다음 install 시 전파

룰북 자체가 `@gridge-ai/aimsp-harness` npm 패키지라는 점을 잊지 않는다.
