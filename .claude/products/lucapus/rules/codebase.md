# LucaPus / Rules / Codebase — 규칙 본문

> PL-009 본문. 온보딩 시 / 진행 중 코드베이스를 분석하여 온톨로지와 매칭하는 규칙.
> "불혹" 원칙 — 플랫폼이 전체 맥락을 이해한다.

---

## PL-009 — 코드베이스 분석 (SHOULD)

### 철학 (불혹)

**"유저가 말하지 않은 것에 속지 않는다."**

플랫폼이 코드베이스 / 스키마 / 정책 / 이력을 종합적으로 이해하여, 사용자 요청이 자동으로 적절한 범위의 결과를 내놓아야 함.

### 주요 분석 시점

| 시점 | 목적 |
|---|---|
| `gridge init` | 초기 기술 스택 감지 + 초기 규칙 추천 |
| 새 파일 추가 / 대량 수정 | 패턴 감지 (코드 패턴 승격) |
| 주기 스캔 (주간) | 아키텍처 드리프트 감지 |
| L3 "재분석" 요청 | 전체 재스캔 |

---

## PL-009-01 — 기술 스택 감지 (MUST)

### 감지 대상

| 레이어 | 감지 기준 |
|---|---|
| **언어** | 파일 확장자 + 최다 라인 수 (`.ts` / `.py` / `.java` / ...) |
| **프레임워크** | `package.json` / `pom.xml` / `requirements.txt` / `Cargo.toml` |
| **DB** | 환경 변수 / migration 파일 / connection 문자열 |
| **인프라** | `Dockerfile` / `docker-compose.yml` / IaC 파일 |
| **CI/CD** | `.github/workflows/` / `.gitlab-ci.yml` / `Jenkinsfile` |
| **테스트** | 테스트 파일 비율 + 프레임워크 (`jest` / `pytest` / `junit`) |

### 구현

```typescript
interface TechStack {
  languages: { [lang: string]: number };      // 비율
  frameworks: string[];                        // ['Next.js 14', 'Spring Boot 3', ...]
  databases: string[];                         // ['PostgreSQL', 'Redis']
  infrastructure: string[];                    // ['Docker', 'Kubernetes', 'AWS']
  ci_cd: string[];                             // ['GitHub Actions']
  test_frameworks: string[];
  test_coverage_estimate?: number;
}

async function detectTechStack(projectPath: string): Promise<TechStack> {
  // 1. package.json / pom.xml / etc. 파싱
  // 2. 파일 확장자 집계
  // 3. 환경 변수 파싱 (.env, .env.example)
  // 4. IaC / CI 설정 파일 스캔
  // ...
}
```

### 보안 고려 (MUST)

- 시크릿 / API 키 **읽지 않음** (`.env` 에서 키 이름만 추출)
- 고객 코드 **외부 전송 금지** (Mode B 특히)
- 감지 결과만 메타데이터로 저장

---

## PL-009-02 — 온톨로지 매칭 (MUST)

감지된 기술 스택을 온톨로지 (PL-007) 와 매칭:

```
감지: Spring Boot 3 + PostgreSQL + Redis
  ↓
기술 온톨로지 조회:
  - rule-jwt (Spring Security)
  - rule-bcrypt (비밀번호 해싱)
  - rule-redis-cache (인증 캐시)
  - rule-optimistic-lock (JPA 동시성)
  ...
  ↓
패턴 온톨로지 조회:
  - Spring Boot + PostgreSQL 조합 340개 중 94%가 rule-jwt 선택
  - 87%가 rule-rtr 선택
  ...
  ↓
초기 추천 카드 생성 (HITL, type='ontology_recommend')
```

---

## PL-009-03 — 코드 패턴 감지 (MUST)

### 반복 패턴 자동 감지 (3회+)

```typescript
interface PatternDetection {
  pattern_id: string;                // 내부 식별
  pattern_type: string;              // 'builder', 'facade', 'repository', ...
  occurrences: number;               // 감지된 횟수
  files: string[];                   // 감지된 파일
  code_sample: string;               // 대표 코드 예시
  proposed_rule: string;             // AI 초안 규칙 문구
}
```

### 감지 파이프라인

1. AST 분석 (언어별 파서: `@typescript-eslint/parser`, `tree-sitter` 등)
2. 동일 구조 3회 이상 감지 → 후보 등록
3. Tech Leader 에게 HITL 카드 생성 (type='code_pattern')

### 예시 감지

```
Pattern: @Builder 패턴이 모든 JPA 엔티티에 적용됨
  - User.java (line 12)
  - Order.java (line 8)
  - Product.java (line 15)
  - Coupon.java (line 20)
  → 4회 감지

AI 초안 규칙:
  "모든 JPA 엔티티에 @Builder 적용 (MUST)"

→ 🔶 코드 패턴 카드 생성
```

---

## PL-009-04 — 아키텍처 드리프트 감지 (SHOULD)

### 드리프트 정의

현재 코드베이스가 **확정된 규칙에서 벗어난 정도**.

### 주간 스캔

```typescript
interface DriftReport {
  project_id: string;
  scan_at: Date;

  violations: {
    rule_id: string;
    severity: 'MUST' | 'SHOULD' | 'MAY';
    file: string;
    line: number;
    message: string;
  }[];

  trend: {
    last_week: number;         // 위반 수
    this_week: number;
    delta: number;
  };
}
```

### 대응

- 🔴 MUST 위반 증가 → Tech Leader + OA 알림 (즉시)
- 🟡 SHOULD 위반 증가 → L3 리뷰 큐
- 🔵 MAY 위반 → 주간 보고서에 포함

---

## PL-009-05 — 파일 무결성 (MUST)

### Never Touch 영역

다음은 절대 LucaPus 가 자동 수정 안 함:

- `.gridge/` (LucaPus 자체 상태)
- `.git/`
- 환경 변수 파일 (`.env*`)
- 테스트 골든 파일 (`__snapshots__/` 등)
- 사용자 정의 `.gridgeignore` 에 명시된 경로

### 수정 범위 제한

| 에이전트 | 수정 가능 |
|---|---|
| SSOT Master | 산출물 (architecture.md, .gridge/spec/*) 만 |
| Tech Leader | 규칙 제안만, 코드 직접 수정 X |
| BE / FE Developer | src/ 코드 (PR 형태) |
| QA Verifier | tests/ 코드 (PR 형태) |

### 보호 메커니즘

```bash
# .gridgeignore 파일 지원
.env*
secrets/
prod-configs/
infrastructure/
```

---

## PL-009-06 — 스냅샷 vs 실시간 (SHOULD)

### 스냅샷 (주기적)

```
.gridge/codebase-snapshots/
├── 2026-04-18T09-00-00.json    # 주간 스냅샷
├── 2026-04-11T09-00-00.json
└── ...
```

- 주간 배치로 생성
- 드리프트 감지의 기준
- 90일 보관

### 실시간 (이벤트 기반)

- Git hook (pre-commit, post-merge) 으로 변경 감지
- 증분 분석만 (전체 재분석 X)
- 결과는 cache (`.gridge/codebase-cache/`)

---

## PL-009-07 — 분석 결과 저장 (MUST)

```sql
CREATE TABLE codebase_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id),
  project_id    uuid NOT NULL REFERENCES projects(id),

  tech_stack    jsonb NOT NULL,
  detected_patterns jsonb,
  drift_report  jsonb,

  file_count    integer,
  loc           integer,             -- Lines of code
  language_breakdown jsonb,

  scan_type     text CHECK (scan_type IN ('init','weekly','on-demand','pr-hook')),
  scanned_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_codebase_project_time ON codebase_snapshots(project_id, scanned_at DESC);
```

### 소스 코드 원문은 저장 X

`code_sample` 같은 필드는 짧은 대표 조각만. 전체 파일은 저장 안 함.

---

## PL-009-08 — Mode B 특수 처리 (MUST, G-087)

### 분석이 고객 인프라 내에서만

```
Mode B 고객:
  .gridge/ 스캐너 = 고객 서버에 배포된 에이전트
  분석 결과 = 고객 DB 에만 저장
  그릿지 서버로 전송 = 없음
```

### 온톨로지 매칭도 로컬에서

Mode B 는 온톨로지 **전체 스냅샷 사전 다운로드** (분기별 업데이트) 후 로컬 매칭.

---

## PL-009-09 — 외부 노출 (MUST, G-004)

### 사용자 보이는 UI 에서

허용:
- "기술 스택 자동 감지"
- "코드 패턴 3회 감지 → 규칙 승격 제안"
- "아키텍처 드리프트 경고"

금지:
- `tree-sitter` / `AST parser` 같은 기술 상세
- 내부 스냅샷 파일 경로
- 감지 알고리즘 임계값

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] `.env*` 파일 내용이 스냅샷에 저장?
- [ ] `.gridgeignore` 무시하고 스캔?
- [ ] 고객 소스 코드 원문이 그릿지 서버로 전송 (Mode B)?
- [ ] 코드 패턴 감지 2회 이하인데 카드 생성?
- [ ] LucaPus 가 `.gridge/` 외부 파일 자동 수정?
- [ ] 코드베이스 스냅샷에 secrets 유출?
- [ ] 드리프트 MUST 위반에 알림 누락?

---

## 참조

- 온톨로지 매칭: `products/lucapus/rules/ontology.md` (PL-007)
- 코드 패턴 HITL: `06_hitl.md § 6` (G-110)
- SSOT Verifier T3 (규칙 검증): `products/lucapus/rules/gate.md § PL-005-03`
- Tech Leader 역할: `products/lucapus/orchestrators/roles.md § PL-002-03`
- Mode B 원칙: `05_infra_mode.md § 7` (G-087)
- 시크릿 보호: `08_security.md § 9` (G-150)
