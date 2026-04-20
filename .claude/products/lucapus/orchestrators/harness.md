# LucaPus / Orchestrators / Harness — 규칙 본문

> PL-004 본문. 하네스 AI의 역할 / 모델 배정 알고리즘 / 재설계 흐름 / 감사.
> 02_architecture § 4 (G-023) 의 세부 구현.

---

## PL-004 — 하네스 AI (MUST)

### 역할 재확인

하네스 AI 는 **3 Orchestrator 위에 존재하는 총괄 레이어.** Plane 이 아닌 직교 개념.

- 에이전트별 모델 배정 결정
- 에이전트 간 작업 라우팅 조율
- 컨텍스트 윈도우 분할
- L3 의 재설계 요청 처리 (수락/거부)

---

## PL-004-01 — 모델 배정 알고리즘 (MUST)

### 입력

```typescript
interface HarnessInput {
  agent_id: string;                  // 'ssot-master', 'be-developer', ...
  mode: 'A' | 'B' | 'C';
  task_characteristics: {
    reasoning_depth: 'low' | 'medium' | 'high';
    context_length: number;          // 예상 토큰
    speed_priority: boolean;
    cost_sensitivity: boolean;
  };
  available_models: Model[];         // 모드별 가용 모델
}
```

### 배정 테이블 (기본값, G-083 정합)

| 에이전트 | Mode A | Mode B | Mode C | 이유 |
|---|---|---|---|---|
| 하네스 AI | Claude Max | vLLM Llama-3 | Claude Opus 4 | 총괄 추론 |
| SSOT Master | Claude Max | vLLM Llama-3 | Claude Sonnet 4 | 구조화 + 긴 컨텍스트 |
| Scrum Master | Claude Max | vLLM Llama-3 | Claude Sonnet 4 | 조율, 추론 중간 |
| Tech Leader | Claude Max | vLLM Llama-3 | **Claude Opus 4** | 깊은 기술 추론 |
| BE Developer | ChatGPT Pro | Ollama CodeLlama | GPT-4o | 속도 우선 |
| FE Developer | ChatGPT Pro | Ollama CodeLlama | GPT-4o | 속도 우선 |
| QA Verifier | Claude Max | vLLM Llama-3 | Claude Sonnet 4 | 검증 분석 |

### 배정 우선순위 룰 (G-032 정합)

```
1. reasoning_depth === 'high' → Opus / Max 계열
2. speed_priority === true   → GPT-4o / Sonnet 4
3. cost_sensitivity === true → Haiku / GPT-4o-mini / Solar
4. context_length > 100k     → Claude (200k 컨텍스트)
5. 한국어 특화 필요          → Solar Pro / Claude
```

### 내부 우선순위 비공개 (G-032-01)

파트너 / 고객에게는:
- "멀티 LLM 라우팅 지원" ✅
- 내부 배정 기준 상세 ❌

---

## PL-004-02 — 배정 이유 공개 (MUST, G-023-03)

각 에이전트에 특정 모델을 배정한 **이유**는 고객에게 공개:

```json
{
  "agent": "BE Developer",
  "assigned_model": "ChatGPT Pro",
  "reason": "코드 생성 속도, 추론 불필요",
  "alternatives_considered": ["Claude Sonnet 4", "Codestral"],
  "assigned_at": "2026-04-18T10:23:00Z",
  "assigned_by": "Harness AI v1.0"
}
```

### 이유 카테고리 (표준)

- `"긴 컨텍스트 (200k+)"` — Claude Opus/Max
- `"깊은 추론 필요"` — Opus / Sonnet
- `"코드 생성 속도"` — GPT-4o / Codestral
- `"비용 효율"` — Haiku / mini / Solar
- `"한국어 특화"` — Solar / Claude
- `"검증 분석"` — Sonnet
- `"온프레 호환"` — vLLM / Ollama

고객 UI (파이프라인 하네스 노드 클릭 → 배정표) 에 이 이유 표시.

---

## PL-004-03 — 재설계 요청 처리 (MUST, G-023-02)

### 요청 주체

**L3 기술 리드만** 재설계 요청 가능.

### 흐름

```
L3: [재설계 요청] 버튼 클릭 (파이프라인 하네스 노드)
  ↓
자연어 입력: "BE Developer가 단순 코드만 생성하니 GPT-4o-mini로 교체해주세요"
  ↓
하네스 AI 검토:
  - 요청의 합당성 평가 (3 Orchestrator 자문 가능)
  - 모드 제약 확인 (Mode B 에서 vLLM 외 불가)
  - 비용 영향 예측
  ↓
응답:
  수락 → 배정 변경 + 이유 기록 + 감사 로그
  거부 → 이유 명시 + 대안 제안
```

### 수락 응답 예시

```json
{
  "decision": "accept",
  "before": { "agent": "BE Developer", "model": "GPT-4o" },
  "after":  { "agent": "BE Developer", "model": "GPT-4o-mini" },
  "impact": {
    "estimated_cost_reduction": "58%",
    "speed_change": "+15%",
    "quality_risk": "low (단순 작업만 담당 중)"
  },
  "effective_from": "2026-04-18T11:00:00Z"
}
```

### 거부 응답 예시

```json
{
  "decision": "reject",
  "reason": "Mode B 환경에서는 vLLM / Ollama 계열만 가능. GPT-4o-mini 불가.",
  "alternatives": [
    "Ollama CodeLlama-7B 로 교체 가능 (속도 유사, 품질 유지)",
    "현재 유지 (배정 이유: 온프레 호환성)"
  ]
}
```

---

## PL-004-04 — 감사 로그 (MUST, G-141)

하네스 행위는 모두 감사 로그:

| 행위 | action |
|---|---|
| 초기 배정 | `harness_initial_assignment` |
| 재설계 요청 수락 | `harness_redesign_accepted` |
| 재설계 요청 거부 | `harness_redesign_rejected` |
| 자동 배정 변경 (장애 대응) | `harness_auto_reassign` |
| 모델 교체 (비용 최적화) | `harness_cost_optimize` |

### 감사 로그 필드

```json
{
  "action": "harness_redesign_accepted",
  "actor_user": "이시니어 (L3)",
  "before_value": { "agent": "be-developer", "model": "GPT-4o" },
  "after_value": { "agent": "be-developer", "model": "GPT-4o-mini" },
  "reason": "사용자 제안 — 단순 작업만 담당 중",
  "harness_version": "1.0",
  "at": "..."
}
```

---

## PL-004-05 — 고객 모델 직접 변경 절대 금지 (MUST, G-025 정합)

정합성 7원칙 6번 위반:

```
❌ 고객 UI에 "에이전트 모델 선택" 드롭다운
❌ API 로 `PATCH /agents/:id/model` 노출
❌ 하네스 승인 없이 모델 변경 가능한 경로
```

모든 모델 변경은 **하네스 AI 승인 경유** (L3 요청 → 하네스 검토 → 결정).

### UI 분기 (PW-003 정합)

파이프라인 AI 노드 클릭 시:
- 서브노드 📊 (비용) / 🧠 (메모리) 표시
- **모델 드롭다운 존재 금지**
- 모델 변경 원하면 → 하네스 재설계 요청만 가능

---

## PL-004-06 — 자동 배정 변경 (SHOULD)

하네스는 **제한적 조건**에서 자동으로 배정 변경 가능:

| 조건 | 자동 대응 |
|---|---|
| 에이전트 모델 rate limit 연속 5회 | 같은 벤더 다른 모델로 전환 (GPT-4o → GPT-4o-mini) |
| 모델 응답 시간 3× 증가 (10분) | fallback 모델로 전환 |
| 모델 품질 저하 감지 (재생성 요청 급증) | 상위 모델로 승격 (Sonnet → Opus) |

### 자동 변경 전 알림

**고객에게 선통보.** 자동 변경 수락/거부 (30초 후 자동 수락).

### Mode C 예외 (G-088-03)

Mode C 에서 고객 API rate limit 초과 시:
- **절대 그릿지 키로 fallback 하지 않음**
- 대기열에 넣거나 사용자 알림

---

## PL-004-07 — 컨텍스트 윈도우 분할 (SHOULD)

큰 작업을 여러 에이전트에 분할할 때 하네스가 결정:

```
SSOT Master에게 기획서 84페이지 전달
  ↓
하네스 검토: 컨텍스트 200k 초과 예상
  ↓
분할 전략:
  - 섹션별 병렬 처리 (4 SSOT Master 인스턴스)
  - 각 섹션 결과를 통합 SSOT Master 가 종합
```

### 분할 기준

- 토큰 ≤ 150k: 단일 처리
- 150k~500k: 섹션 단위 병렬
- 500k+: 문서 단위 병렬 + 요약 후 재분석

---

## PL-004-08 — 고객 UI 표시 (MUST)

설정 > 하네스 설계 확인 (PW-010 참조):

```
하네스 배정표:

에이전트       | 모델              | 이유                  | 배정 시각
--------------+-------------------+----------------------+----------------
하네스 AI      | Claude Max        | 총괄 추론             | 2026-04-18 09:00
SSOT Master   | Claude Max        | 구조화 + 긴 컨텍스트   | 2026-04-18 09:00
Scrum Master  | Claude Max        | 조율, 컨텍스트 윈도우  | 2026-04-18 09:00
Tech Leader   | Claude Max        | 기술 결정, 추론       | 2026-04-18 09:00
BE Developer  | ChatGPT Pro       | 코드 생성 속도        | 2026-04-18 09:00
QA Verifier   | Claude Max        | 검증 분석             | 2026-04-18 09:00

[재설계 요청] (L3 전용)

배정 히스토리 (최근 10건):
  - 2026-04-18 14:20 Tech Leader 배정 유지 (L3 요청 거부 - Mode B)
  - 2026-04-17 11:30 BE Developer → GPT-4o-mini (비용 최적화)
  ...
```

---

## PL-004-09 — 하네스 자체 장애 대응 (SHOULD)

하네스 AI 가 장애 시:

### 즉시 조치

- 현재 배정 **그대로 유지** (기본값 고정)
- 재설계 요청 UI 비활성 + "하네스 AI 일시 장애" 배지
- 3 Orchestrator 는 **정상 작동 계속**

### 복구

- 자동 재시작
- 복구 후 대기 중이던 재설계 요청 순차 처리

### 지속 장애 시

- 30분 이상 장애 → OA 알림
- 슈퍼 어드민에 에스컬레이션
- fallback 하네스 (간단 규칙 기반) 임시 활성 고려

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] 고객 UI 에 모델 변경 드롭다운 존재?
- [ ] 하네스 승인 없이 모델 교체?
- [ ] L3 외 사용자가 재설계 요청 가능?
- [ ] 배정 이유 공개 필드 누락?
- [ ] 하네스 행위 감사 로그 누락?
- [ ] Mode C 에서 그릿지 키로 fallback?
- [ ] Tech Leader 가 Mode C 에서 Opus 아닌 모델?
- [ ] 자동 배정 변경에 고객 선통보 누락?

---

## 참조

- 하네스 원칙: `02_architecture.md § 4` (G-023)
- 멀티 LLM 라우팅: `02_architecture.md § 12` (G-032)
- 세션 배지 표시: `products/wiring/rules/session_badge.md` (PW-010)
- 파이프라인 하네스 노드: `products/wiring/rules/pipeline_view.md § PW-003`
- 고객 UI 권한: `products/wiring/screens/org_admin.md` (PW-013)
- 감사 로그: `08_security.md § 2` (G-141)
- Mode C API 키 원칙: `05_infra_mode.md § 8` (G-088)
- 정합성 7원칙: `02_architecture.md § 5` (G-025)
- 외부 LLM 노출 금지: `01_product.md § 4` (G-004)
