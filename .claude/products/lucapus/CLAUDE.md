# LucaPus — 제품 라우터

> LucaPus 엔진 작업 시 추가 로드되는 제품 라우터.
> **외부 노출 금지어.** 고객/파트너에게는 "AI Dev Platform" 또는 "그릿지 엔진"으로 표현 (G-004).
> 공통 규칙(rules/) + 이 라우터 + 필요 시 rules/ 하위 파일.
> 200줄 이내 유지.

---

## 0. 제품 개요

- **정체**: CLI에 설치된 기본 스킬을 고객 환경에 맞춰 적합화하고, AI가 스펙 분석 → 코드 작성 → 검증 → 배포를 수행하는 B2B AI Dev Platform 엔진
- **접점**: 주로 CLI(개발자 L3/L4), 일부 IDE 사이드바
- **기술 스택**: Node.js + TypeScript + Paperclip(오케스트레이션) + PostgreSQL + YAML 기반 규칙 파일
- **핵심 가치**: "적합화가 쌓일수록 AI가 정확해진다"
- **Wiring과의 관계**: Wiring이 LucaPus의 웹 가시화 레이어. LucaPus는 엔진, Wiring은 UI.
- **AiOPS와의 관계**: 에이전트 호출이 AiOPS 프록시를 경유하여 자동 로깅 (I-003).

---

## 1. LucaPus 작업 시 자동 로드 순서

```
ALWAYS_LOAD (이미 컨텍스트)
  ↓
rules/02_architecture.md (4-Plane, 3 Orchestrators, 정합성 7원칙) — MUST READ
rules/04_stage.md / 05_infra_mode.md
  ↓
[이 파일]
  ↓
작업 유형별 추가 로드 (§ 3)
```

**강조:** `02_architecture.md`는 LucaPus 작업의 **필수 전제.** 이 규칙을 이해하지 않고 코드 수정 금지.

---

## 2. LucaPus 핵심 영역 매핑

| 영역 | PL-ID | 파일 |
|---|---|---|
| 4-Plane 경계 상세 | PL-001 | `planes/boundary.md` |
| 3 Orchestrators 역할 (SSOT/Scrum/Tech) | PL-002, PL-003 | `orchestrators/roles.md` |
| 하네스 AI (모델 배정) | PL-004 | `orchestrators/harness.md` |
| SSOT Verifier + 4-Tier Gate | PL-005 | `rules/gate.md` |
| gridge CLI 명령어 스펙 | PL-006 | `rules/cli.md` |
| 3계층 온톨로지 엔진 | PL-007 | `rules/ontology.md` |
| 적합화 점수 계산 | PL-008 | `rules/adapt_score.md` |
| 코드베이스 분석 엔진 | PL-009 | `rules/codebase.md` |
| 데이터 내보내기 (YAML/ZIP) | PL-010 | `rules/export.md` |

### spec-common (D-001~D-105) 카테고리

기본 스킬 규칙. 고객에 따라 적합화되는 원본:

| 범위 | 카테고리 | 파일 |
|---|---|---|
| D-001~010 | 모듈 빌드 | `rules/spec_module_build.md` |
| D-011~018 | 디자인 패턴 (Facade, Repository 등) | `rules/spec_design_pattern.md` |
| D-019~031 | DB / 영속성 (트랜잭션, 락) | `rules/spec_db_persistence.md` |
| D-032~039 | API 규약 | `rules/spec_api.md` |
| D-040~050 | 보안 (JWT, RBAC, MFA) | `rules/spec_security.md` |
| D-051~052 | HITL 정의 | `rules/spec_hitl.md` |
| D-053~060 | 테스트 | `rules/spec_test.md` |
| D-061~071 | 인프라 (K8s, Docker) | `rules/spec_infra.md` |
| D-072~076 | 이벤트 (pub/sub) | `rules/spec_event.md` |
| D-077~090 | 코딩 스타일 | `rules/spec_coding.md` |
| D-091~105 | 기타 (소셜로그인, vendor 격리 등) | `rules/spec_misc.md` |

---

## 3. 작업 유형별 추가 로드

### 3.1 엔진 코어 (F/R 체인)

| 요청 키워드 | 추가 로드 |
|---|---|
| 4-Plane 수정, Orchestrator 추가/변경 | **금지** (G-025 위반). `02_architecture.md § 5` 확인 후 Conflict |
| 오케스트레이션 엔진, Paperclip 커스텀 | `02_architecture.md § 11` + `rules/02_architecture.md § 5~7` |
| R1~R7 순서, 스펙 분석 단계 | `02_architecture.md § 8` |
| E0~E5 순서, 개발 파이프라인 | `02_architecture.md § 9` |
| SSOT Verifier, 검증 게이트 | `rules/gate.md` (PL-005) |
| 4-Tier Gate, T1~T4 | `rules/gate.md § 4-Tier` |

### 3.2 CLI 개발 (F/I 체인)

| 요청 키워드 | 추가 로드 |
|---|---|
| gridge init, gridge adapt, gridge run | `rules/cli.md` (PL-006) |
| CLI 연결 토큰, 세션 시작 | `rules/cli.md § 세션` |
| CLI에서 HITL 처리 | `rules/cli.md § HITL` + `rules/06_hitl.md § 7` (G-108) |
| gridge export, 데이터 내보내기 | `rules/export.md` (PL-010) |

### 3.3 적합화 엔진 (F 체인)

| 요청 키워드 | 추가 로드 |
|---|---|
| 코드베이스 분석, 패턴 감지, 6항목 분석 | `rules/codebase.md` (PL-009) |
| 적합화 점수, AI 코드 수정률 계산 | `rules/adapt_score.md` (PL-008) |
| 온톨로지 추천, 3계층 (기술/도메인/패턴) | `rules/ontology.md` (PL-007) |
| 크로스 고객사 통계, 익명 메타 | `rules/ontology.md § 크로스` + `05_infra_mode.md § 7` |

### 3.4 spec-common 작업 (S/R 체인)

| 요청 키워드 | 추가 로드 |
|---|---|
| D-025 (동시성), 낙관적/비관적 락 | `rules/spec_db_persistence.md` |
| D-072 (이벤트 발행), DomainEvent | `rules/spec_event.md` |
| D-091/092 (소셜 로그인) | `rules/spec_misc.md` |
| D-095 (vendor 격리) | `rules/spec_misc.md` |
| D-040~050 (보안) | `rules/spec_security.md` + `08_security.md` |

### 3.5 데이터 모델

LucaPus 엔진이 관리하는 파일 구조:

```
project/
├── spec-common.yaml          # 적합화 규칙 (D-001~105 출발점)
├── rules.md                  # 코딩 하드 게이트
├── architecture.md           # 엔티티 / API 설계
├── CLAUDE.md                 # AI 컨텍스트 (자동 생성)
├── feature-kits/             # 기능별 Feature Kit
├── core-baseset/             # 코드 예시
└── .gridge/
    ├── adapt_score.json      # 적합화 점수 히스토리
    ├── harness_config.json   # 하네스 배정
    └── audit_logs.jsonl      # 감사 로그 (append only)
```

---

## 4. LucaPus 전용 절대 규칙

이 엔진 내부에서 위반 시 Conflict 자동 발동 (정합성 7원칙 — G-025):

1. **Plane 순서 변경** (Policy ↔ Spec 뒤바꿈 등)
2. **신규 Orchestrator 추가** (4번째 오케스트레이터 금지)
3. **Executor에게 추론 명령** (BE Developer가 기술 결정)
4. **R1~R7 / E0~E5 순서 변경**
5. **SSOT Verifier / 4-Tier Gate 우회** (`--skip-gate` 플래그 존재 금지)
6. **사람을 실행자로 표현** (UI/CLI 출력에서 "PM이 쿠폰 로직 구현")
7. **고객이 에이전트 모델 직접 변경** (드롭다운 등)

상세: `02_architecture.md § 5`.

---

## 5. 외부 노출 금지어

LucaPus 작업 중 **고객/파트너/데모에 노출되는 문자열**에는 다음 금지:

- `LucaPus` / `루카퍼스`
- `4-Plane` (대신 "4-레이어 아키텍처")
- `DevPlane` / `SpecPlane` 등
- `voyage` (내부 개발 단위)
- `Paperclip` (대신 "오케스트레이션 엔진")
- `SSOT Verifier` (대신 "검증 에이전트")
- `4-Tier Gate` (대신 "4단계 품질 게이트")
- `spec-common` / `D-xxx` (대신 "개발 규칙")
- `IR` (Intermediate Representation)

검증: `marketing/`, `proposals/`, `demo/` 하위 파일에 위 단어 감지 시 **Conflict** (`91 § 1`).

---

## 6. 외부 연동 (L-001~L-015)

LucaPus 엔진이 외부 도구와 연결되는 방식:

| 도구 | 연동 | L-ID |
|---|---|---|
| Jira | REST + Webhook 양방향 | L-005 |
| Slack | Bot + 인라인 승인 | L-006 |
| GitHub / GitLab | PR 자동 생성 | L-007 |
| Jenkins / ArgoCD | Webhook 배포 트리거 | L-011 |
| SonarQube | API 품질 게이트 | L-012 |
| Confluence | API 산출물 게시 | L-013 |
| SSO (SAML/OIDC) | `03_hierarchy.md § 7` 경유 | (G-046) |

상세: `integrations/lucapus-external.md` (작성 예정).

---

## 7. AiOPS와의 연동 (I-003)

LucaPus의 **모든 AI 에이전트 호출이 AiOPS 프록시를 경유.**
- 자동 로깅 (프롬프트 / 응답 / 토큰 / 비용)
- org_id / project_id / agent_id 메타 태깅
- 감사 로그 동기화

**설정:** LucaPus 엔진의 `BASE_URL` 을 AiOPS 프록시 엔드포인트로 지정.

---

## 8. Wiring과의 동기화 (I-002)

LucaPus 파일 변경 (spec-common.yaml / rules.md) ↔ Wiring 웹 UI 양방향 동기화:
- CLI에서 규칙 확정 → 웹 "확정 규칙 타임라인"에 즉시 반영 (WebSocket)
- 웹에서 규칙 수정 → CLI 세션의 컨텍스트 갱신

충돌 시: **CLI 우선** (개발자가 작업 중일 가능성 높음). Wiring 측에 경고 표시.

---

## 9. 제품 라우터 크기 제한 준수

이 파일 ≤ 200줄. 초과 시 `rules/` 또는 `orchestrators/` 로 분할.

개별 규칙 본문은 여기에 적지 않음. ID와 파일 위치만.
