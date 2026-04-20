# LucaPus / Planes / Boundary — 규칙 본문

> PL-001 본문. 4-Plane의 경계 정의와 Plane 간 호출 규칙.
> 02_architecture § 1~4 (G-020~G-022) 의 세부 구현 규칙.

---

## PL-001 — 4-Plane 경계 (MUST)

### 구조 재확인

```
┌─────────────────────────────────────────┐
│  Ops Plane          — 운영/배포/모니터링  │  Executor
├─────────────────────────────────────────┤
│  Dev Plane          — 코드 생성/검증/리뷰 │  Executor
├─────────────────────────────────────────┤
│  Spec Plane         — 스펙 분석/문서화    │  Orchestrator (SSOT Master)
├─────────────────────────────────────────┤
│  Policy Plane       — 정책/규칙/우선순위  │  Orchestrator (Scrum / Tech Leader)
└─────────────────────────────────────────┘
```

### 각 Plane의 역할 재확인

| Plane | 입력 | 출력 | 책임 |
|---|---|---|---|
| Policy | 조직 / 팀 규칙 (spec-common.yaml), 기획서 | 우선순위, 스프린트 배정, 기술 결정 | Scrum Master / Tech Leader |
| Spec | Policy 출력 + 기획서 + 레퍼런스 | architecture.md, entities, API 스펙 | SSOT Master |
| Dev | Spec 출력 + 코드베이스 | 코드, 테스트, PR | BE/FE Developer + QA Verifier |
| Ops | Dev 출력 + 배포 스크립트 | 배포 결과, 모니터링, 롤백 | Executor (CI/CD 에이전트) |

---

## PL-001-01 — Plane 간 호출 경로 (MUST)

**반드시 Orchestrator 경유.** Plane 간 직접 호출 금지:

```
❌ 금지
Dev Plane의 BE Developer → 직접 Spec Plane 데이터 조회
❌ 금지  
Ops Plane → 직접 Policy Plane의 규칙 수정

✅ 허용
Dev Plane의 BE Developer → Tech Leader (Orchestrator) 요청 → Spec Plane 데이터
✅ 허용
Ops Plane 배포 실패 → Scrum Master → Policy Plane에 우선순위 재조정 요청
```

### Plane 경계 강제

Plane 식별:
```typescript
enum Plane {
  Policy = 'policy',
  Spec   = 'spec',
  Dev    = 'dev',
  Ops    = 'ops',
}

interface Agent {
  id: string;
  plane: Plane;
  role: 'orchestrator' | 'executor';
}
```

Plane 간 메시지 라우팅 시 소스/대상 Plane 검증:
```typescript
function routeMessage(from: Agent, to: Agent, msg: Message) {
  if (from.plane !== to.plane && from.role !== 'orchestrator') {
    throw new ConflictError(
      `Cross-plane call from ${from.plane} to ${to.plane} ` +
      `must go through an Orchestrator. Source: ${from.id}`
    );
  }
  // ...
}
```

---

## PL-001-02 — Plane별 데이터 저장 위치 (MUST)

각 Plane이 관리하는 파일 / DB 경로 분리:

### Policy Plane

```
project/
├── spec-common.yaml           # 적합화 규칙 원본
├── rules.md                   # 코딩 하드 게이트
└── .gridge/
    └── policy/
        ├── sprint-*.yml       # 스프린트 계획
        └── priorities.json    # 우선순위 매트릭스
```

### Spec Plane

```
project/
├── architecture.md            # 엔티티 / API 설계
├── feature-kits/              # 기능별 Feature Kit
└── .gridge/
    └── spec/
        ├── entities.json      # 엔티티 정의
        ├── api-contracts.yml  # OpenAPI 스펙
        └── diagrams/          # Mermaid / DOT 다이어그램
```

### Dev Plane

```
project/
├── src/                       # 소스 코드
├── tests/                     # 테스트
└── .gridge/
    └── dev/
        ├── generated/         # AI 생성 아티팩트 버퍼
        └── review-logs/       # 리뷰 결과 JSON
```

### Ops Plane

```
project/
└── .gridge/
    └── ops/
        ├── deploy-logs/       # 배포 이력 JSONL
        ├── incidents/         # 장애 기록
        └── rollback-history/  # 롤백 이력
```

### 크로스 참조 금지

```
❌ dev/generated/ 에서 policy/sprint-*.yml 직접 읽기
❌ ops/deploy-logs/ 에서 src/ 수정

✅ 읽기 전용 crosspath API 경유:
   getCrossPlaneData({ from: 'dev', to: 'policy', key: 'sprint-current' })
```

---

## PL-001-03 — Plane 경계 vs Stage (MUST)

Stage (04_stage.md) 와 Plane은 **직교 개념**:

| Stage | 활성 Plane |
|---|---|
| 0 | Policy (규칙만) |
| 1 | Policy + Spec (AI 제안) |
| 2 | Policy + Spec + Dev (AI 모듈별) |
| 3 | Policy + Spec + Dev + Ops (풀 파이프라인) |

- Stage 0 고객도 Plane 구조는 동일. Dev/Ops Plane이 휴면 상태일 뿐.
- Stage 상승 시 해당 Plane 활성화 + Orchestrator 배정.

---

## PL-001-04 — Plane 내부 구조 (SHOULD)

각 Plane은 내부적으로 다음 모듈 구조:

```
Plane/
├── orchestrator.ts     # 해당 Plane의 Orchestrator (Policy/Spec만)
├── executors/           # Plane 내 실행 에이전트
│   ├── agent-1.ts
│   └── agent-2.ts
├── contracts/           # 타 Plane과의 인터페이스 정의
│   ├── input.schema.ts
│   └── output.schema.ts
└── state/              # Plane 내부 상태
```

Policy / Spec Plane은 Orchestrator 필수 (추론 격리, G-021).
Dev / Ops Plane은 Orchestrator 없음 — 상위 Plane의 Orchestrator가 지휘.

---

## PL-001-05 — Plane 경계 위반 감지 (MUST)

정적 분석 도구로 감지:

### 1. Import 경계

`eslint-plugin-boundaries` 등으로 Plane 간 import 제약:

```json
// .eslintrc.json
{
  "plugins": ["boundaries"],
  "settings": {
    "boundaries/elements": [
      { "type": "policy-plane", "pattern": "src/planes/policy/*" },
      { "type": "spec-plane",   "pattern": "src/planes/spec/*" },
      { "type": "dev-plane",    "pattern": "src/planes/dev/*" },
      { "type": "ops-plane",    "pattern": "src/planes/ops/*" }
    ]
  },
  "rules": {
    "boundaries/element-types": [2, {
      "default": "disallow",
      "rules": [
        { "from": "policy-plane", "allow": ["policy-plane"] },
        { "from": "spec-plane",   "allow": ["spec-plane", "policy-plane"] },
        { "from": "dev-plane",    "allow": ["dev-plane", "spec-plane"] },
        { "from": "ops-plane",    "allow": ["ops-plane", "dev-plane"] }
      ]
    }]
  }
}
```

상향 호출만 허용 (Dev → Spec → Policy).
하향 호출은 Orchestrator 이벤트 기반.

### 2. 런타임 경계

Orchestrator 가 타 Plane 에이전트 호출 시 감사 로그 (G-141):
```json
{
  "action": "cross_plane_call",
  "from": { "agent": "tech-leader", "plane": "policy" },
  "to":   { "agent": "be-developer", "plane": "dev" },
  "message_id": "...",
  "at": "..."
}
```

---

## PL-001-06 — Plane 확장 (MUST, G-020-01 정합)

### 금지

- 5번째 Plane 추가 (예: "Analytics Plane") 금지
- Plane 순서 변경 금지
- Plane 병합 금지 (Spec + Policy 통합 등)

### 허용

- 기존 Plane 내부에 Executor 추가 (4-Plane 구조 유지)
- Plane별 계약(contracts/) 확장
- Plane별 상태(state/) 필드 추가

### Plane 확장 감지

```
❌ Conflict 발동 조건:
- .claude/products/lucapus/planes/analytics/ 같은 새 디렉토리 생성
- enum Plane 에 새 값 추가
- orchestrators/ 에 4번째 Orchestrator 추가
```

---

## PL-001-07 — Plane 간 데이터 흐름 (MUST)

정방향 (순차 실행):
```
Policy → Spec → Dev → Ops
```

역방향 (제한적 피드백만):
```
Dev → Policy (코드 패턴 승격 제안, Tech Leader 경유)
Ops → Spec  (배포 실패 → 재설계 요청)
Ops → Policy (우선순위 재조정 필요)
```

역방향은 **제안**만. 상위 Plane이 수락/거부 결정.

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] Plane 간 직접 호출 (Orchestrator 경유 아님)?
- [ ] Executor 가 상위 Plane 결정 뒤집음?
- [ ] 5번째 Plane 추가 시도?
- [ ] Plane 데이터 디렉토리 간 import?
- [ ] Dev Plane 에이전트가 Policy Plane 파일 직접 수정?
- [ ] Plane 정보 없는 에이전트 정의 (plane 필드 누락)?
- [ ] crosspath API 없이 타 Plane 데이터 조회?

---

## 참조

- 4-Plane 원칙: `02_architecture.md § 1` (G-020)
- Orchestrator 추론 격리: `02_architecture.md § 2` (G-021)
- Executor 규칙: `02_architecture.md § 3` (G-022)
- 정합성 7원칙: `02_architecture.md § 5` (G-025)
- 하네스 AI: `products/lucapus/orchestrators/harness.md` (PL-004)
- 오케스트레이터 역할: `products/lucapus/orchestrators/roles.md` (PL-002~003)
- Stage × Plane 교차: `04_stage.md § 10` (G-070)
