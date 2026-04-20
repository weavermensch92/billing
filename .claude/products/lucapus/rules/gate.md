# LucaPus / Rules / Gate — 규칙 본문

> PL-005 본문. SSOT Verifier + 4-Tier Gate의 구현 상세.
> 02_architecture § 6~7 (G-026, G-027) 의 세부 구현.

---

## PL-005 — SSOT Verifier + 4-Tier Gate (MUST)

### 공통 원칙

이 두 게이트는 **LucaPus 엔진의 품질 보증 레이어.** 우회 절대 금지 (G-025 정합성 원칙 4번).

---

## PL-005-01 — SSOT Verifier (G-026 정합)

### 목적

**"기획서 / 스펙 / 구현이 일관된가?"** 세 문서 간 정합성 검증.

### 검증 대상

| 비교 쌍 | 검증 내용 |
|---|---|
| 스펙 vs 생성 코드 | API 시그니처 일치 (엔드포인트 / 파라미터 / 응답 형태) |
| 엔티티 정의 vs DB 스키마 | 필드명 / 타입 / 제약 조건 |
| 기획서 정책 vs 비즈니스 로직 | MUST/SHOULD/MAY 준수 |
| 적합화 규칙 vs 코드 | 규칙 위반 감지 (조직 MUST) |

### 실행 시점

```
코드 생성 완료 (Executor 산출)
  ↓
SSOT Verifier 자동 실행
  ↓
일관성 검증 3패스:
  1. 타입 검사 (tsc / javac)
  2. 계약 검사 (OpenAPI ↔ 코드 서명)
  3. 정책 검사 (spec-common ↔ 코드 동작)
  ↓
결과:
  ✅ PASS → 다음 Tier (4-Tier Gate T2)
  ⚠️ WARN → 경고 + 계속 진행 (L3 검토 가능)
  ❌ FAIL → 재생성 요청 (최대 3회)
      └── 3회 실패 → L3 에스컬레이션 (Conflict)
```

### 구현 위치

```
.gridge/verifiers/
├── type-checker.ts
├── contract-checker.ts
├── policy-checker.ts
└── runner.ts        # 3패스 통합 실행
```

---

## PL-005-02 — SSOT Verifier 출력 포맷 (MUST)

```typescript
interface VerifierReport {
  verdict: 'pass' | 'warn' | 'fail';
  checks: {
    type_check: CheckResult;
    contract_check: CheckResult;
    policy_check: CheckResult;
  };
  issues: Issue[];
  suggestions: Suggestion[];       // 재생성 힌트
  duration_ms: number;
}

interface Issue {
  severity: 'error' | 'warning';
  category: 'type' | 'contract' | 'policy';
  file: string;
  line?: number;
  message: string;
  related_spec?: string;            // 스펙 문서 참조
  related_rule_id?: string;         // 위반한 규칙 ID
}
```

### 예시

```json
{
  "verdict": "fail",
  "issues": [
    {
      "severity": "error",
      "category": "contract",
      "file": "src/payment/controller.ts",
      "line": 42,
      "message": "API '/pay/refund' 응답 타입이 스펙과 다름. 스펙: RefundResponse, 코드: { success: boolean }",
      "related_spec": "architecture.md § 4.2 Refund API"
    },
    {
      "severity": "error",
      "category": "policy",
      "file": "src/auth/login.ts",
      "line": 15,
      "message": "비밀번호 BCrypt 해싱 누락 — 조직 MUST 위반",
      "related_rule_id": "rule-bcrypt"
    }
  ]
}
```

---

## PL-005-03 — 4-Tier Gate (G-027 정합)

### 4단계 게이트

| Tier | 게이트 | 실행 주체 | 실패 시 동작 |
|---|---|---|---|
| **T1** | 정적 분석 (lint, tsc, 타입) | Executor (자동) | 즉시 실패 반환 |
| **T2** | 테스트 통과 (단위 + 통합) | QA Verifier | 결함 재현 → D 체인 |
| **T3** | 적합화 규칙 준수 | SSOT Verifier | 규칙 위반 감지 → 수정 |
| **T4** | 보안 + 컴플라이언스 | SSOT Verifier | OA 에스컬레이션 |

### T1: 정적 분석 (MUST)

```bash
# 언어별 도구
TypeScript: tsc --noEmit + eslint
Python:     mypy + ruff
Java:       javac + checkstyle + pmd
Go:         go vet + golangci-lint
Rust:       cargo clippy --all-targets
```

### T2: 테스트 통과 (MUST)

- **커버리지 최소**: 조직 설정 값 따름 (기본 70%)
- **신규 코드**: 커버리지 80%+ 요구
- **변경 파일**: 테스트 전수 실행
- **전체 스위트**: main 머지 전 필수

### T3: 적합화 규칙 준수 (MUST)

SSOT Verifier 의 `policy_check` 단계.

조직 MUST 규칙 위반 감지 시:
```
❌ BCrypt 해싱 누락 (rule-bcrypt, 조직 MUST)
❌ JWT 만료 시간 < 15분 (rule-jwt-ttl, 조직 MUST)
❌ 감사 로그 UPDATE 쿼리 (rule-audit-immutable, 조직 MUST)
```

**자동 수정 불가** — Tech Leader 에게 에스컬레이션.

### T4: 보안 + 컴플라이언스 (MUST)

```bash
# 보안 스캔
gitleaks protect --staged           # 시크릿 감지 (G-150)
npm audit                            # 의존성 취약점
snyk test                            # 추가 스캔

# 컴플라이언스
# - PII 수집 패턴 감지 (G-140)
# - 감사 로그 의무 항목 누락 감지 (G-141)
# - GDPR / PIPA 체크리스트
```

실패 시: **배포 차단 + OA 에스컬레이션** (G-160 보안 사건 대응과 별도).

---

## PL-005-04 — Gate 우회 절대 금지 (MUST, G-027-01)

### 금지 사항

```
❌ --skip-gate 플래그 존재
❌ --no-verify, --force 같은 우회 옵션
❌ 환경 변수로 게이트 비활성 (GRIDGE_SKIP_T4=true 등)
❌ 긴급 배포 시 일부 게이트 스킵
```

### 긴급 배포 모드 (예외적 단축, SHOULD)

긴급 배포 시에도 **T1 + T2 필수**. T3/T4 는 사후 검증 가능:

```typescript
// 긴급 배포 모드 (OA 승인 필요)
async function emergencyDeploy(prId: string, approvedBy: string) {
  assert(approvedBy includes OA, '긴급 배포는 OA 승인 필요');

  // T1 + T2 필수
  await runTier1(prId);
  await runTier2(prId);

  // T3 + T4 는 배포 후 24h 내 사후 검증
  scheduleDelayedGates(prId, '24h');

  await deploy(prId);

  // 감사 로그 (G-141)
  await logAudit({
    action: 'emergency_deploy',
    actor: approvedBy,
    pr_id: prId,
    skipped_gates: ['T3', 'T4'],
    scheduled_retroactive_check: '24h',
  });
}
```

### 긴급 배포 조건

- 🔴 프로덕션 다운 / 보안 사건 (G-160)
- OA 실시간 승인 + Tech Leader 동의
- 감사 로그 필수
- 사후 게이트 실패 시 즉시 롤백

---

## PL-005-05 — Gate 실패 대응 체인 (MUST)

```
T1 실패 (lint/type 에러)
  ↓
Executor 재생성 (최대 3회)
  ↓ 3회 실패
Tech Leader 에스컬레이션 → D 체인 진입

T2 실패 (테스트)
  ↓
결함 재현 → QA Verifier가 수정 제안
  ↓ 재생성
...

T3 실패 (규칙 위반)
  ↓
Tech Leader 검토:
  1. 규칙 위반이 정당한지 (조직 MUST는 불가능)
  2. 규칙 예외 필요한지 → OA 에스컬레이션
  3. 코드 수정 필요

T4 실패 (보안)
  ↓
즉시 배포 차단 + OA + Tech Leader 동시 알림
  ↓
보안 사건 대응 (G-160)
```

---

## PL-005-06 — Gate 실행 시간 (SHOULD)

| Tier | 목표 시간 (p50) | 최대 허용 (p99) |
|---|---|---|
| T1 | 30초 | 2분 |
| T2 | 3분 | 15분 |
| T3 | 1분 | 5분 |
| T4 | 2분 | 10분 |
| **전체** | **~7분** | **30분** |

p99 초과 시: 로그 + 최적화 제안 (증분 실행 / 캐시 활용).

---

## PL-005-07 — Gate 결과 저장 (MUST)

```sql
-- Wiring / AiOPS 공용 스키마
CREATE TABLE gate_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES orgs(id),
  project_id   uuid NOT NULL REFERENCES projects(id),
  pr_id        text NOT NULL,                  -- PR 식별자

  tier         smallint NOT NULL CHECK (tier BETWEEN 1 AND 4),
  verdict      text NOT NULL CHECK (verdict IN ('pass','warn','fail','skipped')),
  duration_ms  integer NOT NULL,

  issues       jsonb,                           -- Issue[] 배열
  skipped_reason text,                          -- skipped일 때만

  run_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gate_project_pr ON gate_results(project_id, pr_id, tier);
CREATE INDEX idx_gate_failed ON gate_results(project_id, verdict, run_at DESC)
  WHERE verdict = 'fail';
```

### 감사 로그 연동 (G-141)

`skipped` 또는 `emergency_deploy` 는 audit_logs 에도 기록.

---

## PL-005-08 — 외부 노출 금지 (MUST, G-004 정합)

고객 / 파트너 UI 에서 **사용하지 않을 용어**:

- `SSOT Verifier` → "검증 에이전트" / "품질 검증"
- `4-Tier Gate` → "4단계 품질 게이트"
- `T1, T2, T3, T4` → "정적 분석 / 테스트 / 규칙 검증 / 보안 검증"

허용:
- "이 PR은 4단계 품질 게이트를 통과했습니다"
- "검증 에이전트가 스펙 일관성을 확인합니다"

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] `--skip-gate`, `--no-verify`, `--force` 같은 우회 플래그 존재?
- [ ] 환경 변수로 게이트 스킵 가능?
- [ ] T1+T2 없이 배포 (긴급 모드도 T1+T2 필수)?
- [ ] T4 실패에도 배포 진행?
- [ ] SSOT Verifier 재생성 3회 초과에도 L3 에스컬레이션 없음?
- [ ] 외부 UI 에 "SSOT Verifier" / "T1~T4" 노출?
- [ ] Gate 결과가 `gate_results` 에 저장 안 됨?
- [ ] `skipped` 에 감사 로그 누락?

---

## 참조

- SSOT Verifier 원칙: `02_architecture.md § 6` (G-026)
- 4-Tier Gate 원칙: `02_architecture.md § 7` (G-027)
- 정합성 7원칙: `02_architecture.md § 5` (G-025)
- 감사 로그: `08_security.md § 2` (G-141)
- 보안 스캔 도구: `08_security.md § 9` (G-150)
- CVE 대응: `08_security.md § 10` (G-151)
- Executor 작업 흐름: `products/lucapus/orchestrators/roles.md § PL-003`
- 외부 노출 금지어: `01_product.md § 4` (G-004)
