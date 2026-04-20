# LucaPus / Orchestrators / Roles — 규칙 본문

> PL-002 (Orchestrator 정의) + PL-003 (Executor 추론 금지) 본문.
> 3 Orchestrator 의 구체 역할, 관할 Plane, 추론 격리 경계.

---

## PL-002 — 3 Orchestrators 정의 (MUST)

### 개요

| Orchestrator | 관할 Plane | 추론 종류 |
|---|---|---|
| **SSOT Master** | Spec | 스펙 구조화, HITL 카드 생성, 엔티티 설계 |
| **Scrum Master** | Policy | 스프린트 관리, 진행률 추적, 병목 감지 |
| **Tech Leader** | Policy (기술) | 기술 결정 HITL, 아키텍처 판단, 코드 패턴 승격 검토 |

---

## PL-002-01 — SSOT Master (MUST)

### 역할

**"기획서를 읽고 구조화된 스펙을 만드는 단 하나의 주체."**

- R1~R7 스펙 분석 파이프라인 총괄 (G-028)
- HITL 카드 생성 (PM/L3 결정 필요 감지)
- 엔티티 정의 / API 스펙 / 다이어그램 산출
- 기획서 vs 구현 일관성 검증 (SSOT Verifier 경유)

### 입출력

```typescript
interface SSOTMasterInput {
  spec_document: Document;           // 기획서 (PDF/Word/MD)
  reference_platforms?: string[];     // R3 비교 분석용
  existing_codebase?: string;         // 코드베이스 경로
  domain_context?: string;            // 도메인 배경
}

interface SSOTMasterOutput {
  architecture_md: string;             // 엔티티 + API 설계
  entities: EntityDef[];
  api_contracts: OpenAPISpec;
  diagrams: DiagramFile[];             // Mermaid/DOT
  hitl_cards: HitlCard[];              // 발견된 결정 필요 항목
  r_state: RStageState;                // R1~R7 진행 상태
}
```

### 모드별 모델 배정 (G-083)

| Mode | 모델 | 이유 |
|---|---|---|
| A | Claude Max | 스펙 구조화 + 긴 컨텍스트 필요 |
| B | vLLM Llama-3 | 고객 서버, 긴 컨텍스트 |
| C | Claude Sonnet 4 | 구조화 능력 + 비용 균형 |

### 추론 가능 범위

- ✅ 기획서 모호성 판단 → HITL 카드 생성
- ✅ 참고 플랫폼 비교 → 권장안 제시
- ✅ 엔티티 관계 추론
- ❌ 코드 직접 작성 (Executor 담당)
- ❌ 비용 / 우선순위 결정 (Scrum Master 담당)

---

## PL-002-02 — Scrum Master (MUST)

### 역할

**"스프린트와 병목을 조율하는 단 하나의 주체."**

- 스프린트 배정 / 진행률 갱신
- HITL 병목 감지 (G-106: 4h/24h 에스컬레이션)
- Kanban 상태 전이 검증 (PW-008)
- Orchestrator 간 작업 라우팅

### 입출력

```typescript
interface ScrumMasterInput {
  sprint_plan: SprintPlan;
  items: Item[];                 // 칸반 아이템
  agent_states: AgentState[];
  hitl_cards: HitlCard[];        // 대기 중
}

interface ScrumMasterOutput {
  reassignments: Reassignment[];
  bottleneck_alerts: Alert[];
  escalations: Escalation[];     // 24h 대기 → OA 에스컬레이션
  velocity_delta: number;        // 스프린트 진행 가속/감속
}
```

### 모드별 모델 배정

| Mode | 모델 |
|---|---|
| A | Claude Max |
| B | vLLM Llama-3 |
| C | Claude Sonnet 4 |

### 추론 가능 범위

- ✅ 병목 원인 분석
- ✅ 우선순위 재조정 제안
- ✅ 에이전트 작업 라우팅
- ❌ 기술적 트레이드오프 판단 (Tech Leader 담당)
- ❌ 기획서 해석 (SSOT Master 담당)

---

## PL-002-03 — Tech Leader (MUST)

### 역할

**"기술 결정과 코드 패턴 승격을 검토하는 단 하나의 주체."**

- 🔷 기술 결정 HITL 카드 생성 및 권고안 제시
- 🔶 코드 패턴 승격 검토 (3회+ 반복 감지)
- 하네스 재설계 요청 처리
- 아키텍처 판단 (E0~E5 파이프라인 지휘, G-029)

### 입출력

```typescript
interface TechLeaderInput {
  spec: ArchitectureSpec;         // SSOT Master 출력
  codebase: CodebaseSnapshot;
  detected_patterns: PatternDetection[];  // 3회+ 반복
  ontology: OntologyGraph;        // 기술 온톨로지
}

interface TechLeaderOutput {
  technical_hitl_cards: HitlCard[];
  pattern_promotions: PatternPromotion[];
  architecture_decisions: ArchDecision[];
  harness_reconfig_response?: HarnessResponse;
}
```

### 모드별 모델 배정

| Mode | 모델 |
|---|---|
| A | Claude Max (Opus급) |
| B | vLLM Llama-3 |
| C | **Claude Opus 4** (깊은 추론 필요) |

Tech Leader 만 Mode C 에서 Opus 배정. 기술 결정의 정확도가 품질에 직결.

### 추론 가능 범위

- ✅ 기술 트레이드오프 판단 (락 전략, 캐시, 인증 등)
- ✅ 코드 패턴 규칙 초안 작성
- ✅ 아키텍처 권고 (경고 포함)
- ❌ 비즈니스 결정 (PM 담당, HITL 카드로 라우팅)
- ❌ 직접 코드 작성 (Executor 담당)

---

## PL-002-04 — 교차 협업 패턴 (MUST)

3 Orchestrator 는 서로 **대등**. 위계 없음. 협업 패턴:

### 패턴 A: 기획서 분석 (R1~R7)

```
SSOT Master → R4 시나리오 → HITL 발견 → SSOT가 카드 생성 (type: business)
                                     ↓
                              Scrum Master가 L2 PM에게 라우팅 (G-104)
```

### 패턴 B: 기술 결정

```
SSOT Master → R5 엔티티 설계 → 기술 결정 필요 감지
                              ↓
                       Tech Leader에게 에스컬레이션
                              ↓
                       Tech Leader → HITL 카드 생성 (type: technical)
                              ↓
                       Scrum Master → L3 기술 리드에게 라우팅 (G-103)
```

### 패턴 C: 스프린트 지연

```
Executor 작업 시간 초과 → Scrum Master 감지
                        ↓
                 배정 변경 제안 → 하네스 AI에 라우팅 (G-023-02)
                        ↓
                 하네스 수락 → Executor 교체
```

---

## PL-003 — Executor 추론 금지 (MUST)

### 원칙

"Executor 는 **지시받은 작업만** 수행한다."

- ❌ 판단 금지: "A와 B 중 어느 것?" 같은 상황에서 선택
- ❌ 분기 로직 금지: 여러 경로 중 하나 선택하는 조건문
- ❌ HITL 카드 생성 금지
- ✅ 명시된 작업 수행: 코드 생성, 파일 작성, 테스트 실행, 검증

### Executor 목록 (4-Plane 내)

| Executor | Plane | 담당 |
|---|---|---|
| BE Developer | Dev | 백엔드 코드 생성 |
| FE Developer | Dev | 프론트엔드 코드 생성 |
| QA Verifier | Dev | 테스트 생성, 검증, 결함 재현 |
| Doc Writer | Spec (실행 수준) | 문서 생성 |
| Deploy Executor | Ops | 배포 실행 |
| Rollback Executor | Ops | 롤백 실행 |

### 추론 필요 시 에스컬레이션

Executor 가 작업 중 "판단 필요" 상황 마주치면:

```typescript
async function executeTask(task: Task) {
  const ambiguity = detectAmbiguity(task);
  if (ambiguity) {
    // ❌ 금지: return decideMyself(ambiguity);
    // ✅ 올바름: Orchestrator에게 에스컬레이션
    return escalateTo(getOwningOrchestrator(task), {
      type: 'ambiguity',
      context: ambiguity,
    });
  }
  // ...
}
```

### 에스컬레이션 라우팅

| 모호성 유형 | 라우팅 |
|---|---|
| 기획 해석 문제 | SSOT Master |
| 기술 트레이드오프 | Tech Leader |
| 우선순위 문제 | Scrum Master |
| 스펙과 코드 불일치 | SSOT Master (SSOT Verifier 트리거) |

---

## PL-003-01 — Executor 추가 가능 (MUST)

신규 Executor 추가 OK:

```
✅ Security Scanner (Dev Plane Executor)
✅ Performance Analyzer (Dev Plane Executor)
✅ Translation Agent (Spec Plane Executor)
```

### 조건

- 4-Plane 구조 유지
- Orchestrator 없이는 독립 작동 금지 (지휘 받아야 함)
- 기존 Executor 역할 중복 금지 (Tech Leader 승인)

---

## PL-003-02 — Executor 위반 감지 (MUST)

정적 분석 / 코드 리뷰 시 감지:

- `if (scenario === 'A') ... else if (scenario === 'B')` 류 분기 로직
- `askHuman()` / `createHitlCard()` 호출 (Executor에서)
- LLM 프롬프트에 "판단하라 / 선택하라 / 결정하라" 지시어

### ESLint 커스텀 룰 (SHOULD)

```typescript
// .eslintrc 에 커스텀 룰
{
  "rules": {
    "@gridge/no-executor-reasoning": "error",
  }
}

// 감지 패턴:
// 1. Agent 파일 내에서 createHitlCard 호출
// 2. "executor" 태그 함수 내에서 if-else 분기 + 사용자 선택 대기
// 3. LLM 프롬프트에 "judge", "decide", "choose" 키워드
```

---

## PL-003-03 — Orchestrator 추가 절대 금지 (MUST, G-025 정합)

"4번째 Orchestrator" 는 정합성 7원칙 1번 위반:

### 금지 예시

- ❌ `Product Manager Orchestrator` (SSOT Master 역할 중복)
- ❌ `DevOps Orchestrator` (Ops Plane 에 Orchestrator 추가 — Ops는 Executor 만)
- ❌ `Security Orchestrator` (Tech Leader 가 담당 가능)

### 감지

```
❌ Conflict 발동 조건:
- .claude/products/lucapus/orchestrators/ 에 4번째 *.md 추가
- enum OrchestratorRole 에 새 값 추가
- 기존 Orchestrator 의 역할이 2개 파일로 분할
```

---

## PL-002-05 — Orchestrator 병렬 실행 (SHOULD)

3 Orchestrator 는 **병렬 실행 가능.**

- SSOT Master: 기획서 분석 중
- Scrum Master: 스프린트 진행 추적 중
- Tech Leader: 코드 패턴 감지 중

### 상태 동기화

- 공유 상태: `.gridge/shared-state/` (읽기 전용)
- 쓰기 시 lock (optimistic locking)
- 충돌 시 Scrum Master 가 조율

---

## PL-002-06 — Orchestrator 실패 대응 (SHOULD)

Orchestrator 가 장애 / 타임아웃 시:

### 즉시 대응

- 다른 Orchestrator 2개는 정상 작동 계속
- 장애 Orchestrator 의 대기 작업은 `.gridge/pending/` 에 보관
- 고객에게 "N Orchestrator 일시 장애" 표시

### 복구

- 자동 재시작 (3회까지)
- 실패 시 OA 알림 (G-160 보안 사건 대응과 별개)
- 복구 후 대기 작업 자동 재개

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] 4번째 Orchestrator 정의 파일 존재?
- [ ] Executor 에서 `createHitlCard()` / `askHuman()` 호출?
- [ ] SSOT Master 가 코드 직접 작성?
- [ ] Tech Leader 가 비즈니스 결정 HITL 생성?
- [ ] Scrum Master 가 기술 판단?
- [ ] Executor 에서 여러 경로 중 스스로 선택?
- [ ] Mode C 에서 Tech Leader 가 Opus 아닌 모델 배정?
- [ ] Orchestrator 역할 중복 또는 분할?

---

## 참조

- 4-Plane 원칙: `02_architecture.md § 1~4`
- 정합성 7원칙: `02_architecture.md § 5` (G-025)
- 하네스 AI 모델 배정: `products/lucapus/orchestrators/harness.md` (PL-004)
- 4-Tier Gate / SSOT Verifier: `products/lucapus/rules/gate.md` (PL-005)
- R1~R7 / E0~E5 순서: `02_architecture.md § 8~9`
- HITL 4종 노드: `06_hitl.md § 2` (G-102)
- Plane 경계: `products/lucapus/planes/boundary.md` (PL-001)
