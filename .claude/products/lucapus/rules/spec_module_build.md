# LucaPus / Rules / Spec — 모듈 / 빌드 구조 (D-001~D-010)

> spec-common 의 첫 카테고리. 기본 스킬 규칙 — 고객 프로젝트에 적합화되는 원본.
> 모드 무관 (A/B/C 공통). 조직 MUST 기본값으로 시작.

---

## 개요

### 카테고리 범위

| 범위 | 항목 수 | 스코프 |
|---|---|---|
| D-001 ~ D-010 | 10건 | core (전체) |

### 목적

**"프로젝트가 어떻게 모듈로 쪼개지고, 어떻게 빌드되는가?"** 의 공통 규칙 정의.

---

## D-001 — 모듈 분리 원칙

### 본문

프로젝트는 다음 4계층으로 분리:

```
┌──────────────────────────┐
│ presentation (API/UI)    │  ← domain 에 의존
├──────────────────────────┤
│ application (Use case)   │  ← domain 에 의존
├──────────────────────────┤
│ domain (Entity/Policy)   │  ← 독립
├──────────────────────────┤
│ infrastructure (DB/외부)  │  ← domain 계약 구현
└──────────────────────────┘
```

### 강제 수준

**MUST** (조직 레벨 기본).

### 적합화 HITL

`domain` 명명을 다르게 하는 팀이 일반적:
- 🔷 "core / domain / shared 로 바꿀까요?" → L3 결정

---

## D-002 — 모노레포 vs 멀티레포

### 본문

- 모노레포 (Nx / Turborepo / Gradle): 단일 저장소 다중 프로젝트
- 멀티레포: 프로젝트마다 저장소 분리

### 강제 수준

**SHOULD**. 팀 규모 / CI 정책에 따라.

### 적합화 HITL

🔷 기술 결정:
- 팀 ≤ 10명 → 모노레포 권장
- 팀 10~30명 + 제품 다수 → 모노레포 + 독립 파이프라인
- 30명+ → 멀티레포 + shared lib

---

## D-003 — 패키지 구조

### 본문

도메인 중심 패키지 구조 (package-by-feature):

```
src/
├── user/              # 도메인별 최상위
│   ├── controller.ts
│   ├── service.ts
│   ├── repository.ts
│   └── entity.ts
├── payment/
│   └── ...
└── shared/            # 공통
    └── util/
```

레이어 중심 구조 (package-by-layer) 지양:
```
❌
src/
├── controllers/
├── services/
├── repositories/
└── entities/
```

### 강제 수준

**MUST** (도메인 주도 설계 기반 프로젝트).

### 적합화 HITL

🔷 기술 결정:
- 기존 프로젝트가 package-by-layer → 마이그레이션 전략 결정

---

## D-004 — 빌드 도구 선택

### 본문

언어별 권장:

| 언어 | 빌드 도구 |
|---|---|
| Java/Kotlin | Gradle (빠름, 캐싱 우수) |
| TypeScript/JavaScript | pnpm + Turborepo (모노레포) / npm |
| Python | Poetry / uv |
| Go | go modules (내장) |
| Rust | Cargo |

### 강제 수준

**SHOULD**.

### 적합화 HITL

🔷 기술 결정: 기존 도구 유지 vs 전환

---

## D-005 — 의존성 버전 관리

### 본문

- 런타임 버전 고정: `.nvmrc` / `.python-version` / `.tool-versions`
- 패키지 매니저 lock 파일 커밋 (`package-lock.json`, `poetry.lock`, ...)
- SemVer 준수 (semantic-release 권장)

### 강제 수준

**MUST**. 빌드 재현성.

### 검증 (SSOT Verifier T1)

- lock 파일 커밋 여부
- 버전 범위 (`^1.2.3` vs 고정)

---

## D-006 — 개발 환경 격리

### 본문

로컬 개발 환경은 **Docker Compose 또는 devcontainer**로 격리:

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports: ["3000:3000"]
  db:
    image: postgres:15
  redis:
    image: redis:7
```

### 강제 수준

**SHOULD**.

### 적합화 HITL

🔷 기술 결정:
- 팀 모두 동일 환경 보장 필요 → Docker Compose 필수
- 개발 속도 우선 → 로컬 설치 허용

---

## D-007 — CI 파이프라인 기본 구조

### 본문

최소 4단계:

```yaml
# .github/workflows/ci.yml
jobs:
  1. install   # 의존성 설치 + 캐시
  2. lint      # ESLint / Ruff / Checkstyle
  3. test      # 단위 + 통합
  4. build     # 빌드 + 아티팩트 생성
```

### 강제 수준

**MUST**. 4-Tier Gate T1/T2 과 연결 (PL-005-03).

### 검증

SSOT Verifier T2 실행 시 CI 결과 확인.

---

## D-008 — Git Flow / Trunk-Based

### 본문

| 방식 | 특징 | 권장 대상 |
|---|---|---|
| Git Flow (main + develop + feature) | 릴리스 관리 체계적 | 엔터프라이즈, 릴리스 주기 느림 |
| Trunk-Based (main + short feature) | 지속 배포 친화 | 스타트업, 배포 주기 빠름 |

### 강제 수준

**SHOULD**.

### 적합화 HITL

🔶 비즈니스 결정 (PM) + 🔷 기술 결정 (L3) 양쪽 연관:
- 릴리스 정책에 따라 다름

---

## D-009 — 환경별 분리 (dev / stg / prod)

### 본문

최소 3환경:
- `dev` — 개발
- `staging` — 프로덕션 유사 테스트
- `prod` — 실 서비스

환경 변수는 `.env.{env}` 로 분리, 절대 커밋 X (G-150).

### 강제 수준

**MUST**.

### 검증

- `.env` 커밋 감지 (gitleaks)
- 환경별 설정 파일 존재 확인

---

## D-010 — 빌드 아티팩트 저장

### 본문

- Docker 이미지: 프라이빗 레지스트리 (ECR / GCR / Harbor)
- 패키지: 프라이빗 npm / Nexus / Artifactory
- 태그 전략: `{version}-{git_sha}` (재현성)

### 강제 수준

**SHOULD** (Enterprise).

---

## 카테고리 요약 (MUST/SHOULD 매트릭스)

| ID | 제목 | 강제 | 적합화 HITL 가능 |
|---|---|---|---|
| D-001 | 모듈 분리 원칙 | MUST | 🔷 |
| D-002 | 모노레포 vs 멀티레포 | SHOULD | 🔷 |
| D-003 | 패키지 구조 (feature vs layer) | MUST | 🔷 |
| D-004 | 빌드 도구 선택 | SHOULD | 🔷 |
| D-005 | 의존성 버전 관리 | MUST | — |
| D-006 | 개발 환경 격리 | SHOULD | 🔷 |
| D-007 | CI 파이프라인 기본 | MUST | — |
| D-008 | Git Flow / Trunk-Based | SHOULD | 🔶 + 🔷 |
| D-009 | 환경별 분리 | MUST | — |
| D-010 | 빌드 아티팩트 저장 | SHOULD | 🔷 |

---

## 적합화 프로세스

### 초기 온보딩

1. 기술 스택 감지 (PL-009) → 빌드 도구 / 패키지 구조 자동 파악
2. 기존 모노레포 / 멀티레포 판별
3. 10개 항목 중 미확정 항목 → HITL 카드 생성

### 진행 중

- D-005 lock 파일 누락 감지 → 자동 수정 제안
- D-007 CI 없음 → HITL 카드 생성
- D-009 `.env` 커밋 감지 → 즉시 Conflict (G-150)

---

## 자동 검증 체크리스트

SSOT Verifier T3 대상:

- [ ] package-by-layer 구조 사용 (D-003)?
- [ ] lock 파일 미커밋 (D-005)?
- [ ] CI 4단계 미구성 (D-007)?
- [ ] `.env` 파일 저장소 커밋 (D-009)?
- [ ] dev 전용 코드가 prod 빌드에 포함?
- [ ] 외부 노출 금지어 포함?

---

## 참조

- LucaPus 엔진 원칙: `02_architecture.md § 1~4`
- 코드베이스 감지: `products/lucapus/rules/codebase.md` (PL-009)
- 4-Tier Gate T1/T2: `products/lucapus/rules/gate.md § PL-005-03`
- 시크릿 감지: `08_security.md § 9` (G-150)
- 빌드 도구 선택 기준: (기술 온톨로지) `products/lucapus/rules/ontology.md`
- 관련 카테고리:
  - `spec_infra.md` (D-061~071): 인프라 / K8s / Docker 상세
  - `spec_coding.md` (D-077~090): 코딩 스타일
