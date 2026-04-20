# Integrations / Harness API — 규칙 본문

> H-001~H-005 본문. 하네스 AI ↔ Wiring 웹 / 인프라 간 내부 API 계약.
> 07_PRD.md § 4 의 하네스 연동 5개 항목을 구현 규칙화.

---

## H-xxx — 하네스 AI API (MUST)

### 역할

하네스 AI (PL-004) 와 Wiring / 인프라 간 **강하게 결합된 양방향 API**.
Wiring UI 의 모든 에이전트 배정 / 재설계 / 세션 상태 표시가 이 API 기반.

---

## H-001 — 기획서 → 구체화 트리거 (MUST)

### 방향

**웹 → 하네스**

### 흐름

```
사용자 Wiring 기획서 분석 화면에서 [분석 시작]
  ↓
POST /harness/v1/trigger-spec-analysis
{
  "project_id": "...",
  "document": { type: "pdf", storage_key: "s3://..." },
  "requested_by": "user-id"
}
  ↓
하네스 AI:
  1. 에이전트 배정 (SSOT Master + 필요 시 병렬)
  2. R1~R7 파이프라인 킥오프
  3. 즉시 "accepted" 응답 반환
  ↓
응답: { status: 'accepted', estimated_duration: '~15min', job_id: '...' }
  ↓
이후 진행 상태는 H-002 로 스트리밍
```

### 응답 시간 목표

- `accepted` 응답: p99 < 1s
- R1 시작까지: p99 < 5s

---

## H-002 — 모델/역할 배정 결과 (MUST)

### 방향

**하네스 → 웹**

### 흐름

```
하네스 AI 배정 결정
  ↓
이벤트: { type: 'harness.assignment', ... }
  ↓
Wiring 파이프라인 노드 / 설정 > 하네스 설계 확인에 즉시 표시
```

### 이벤트 페이로드

```typescript
interface HarnessAssignmentEvent {
  type: 'harness.assignment';
  project_id: string;
  assignments: Array<{
    agent_id: string;           // 'ssot-master', 'be-developer', ...
    model_id: string;           // 'claude-sonnet-4-6', ...
    reason: string;             // 배정 이유 (PL-004-02 카테고리)
    mode: 'A' | 'B' | 'C';
    assigned_at: string;
  }>;
}
```

### UI 반영

- 파이프라인 AI 노드 세션 배지 업데이트 (PW-010)
- 설정 > 하네스 설계 확인 테이블 갱신

---

## H-003 — 재설계 요청 (MUST)

### 방향

**웹 → 하네스**

### 권한

- **L3 기술 리드 전용** (PW-005, PL-004-03)
- 서버에서 위계 검증 (G-052)

### 흐름

```
L3 가 파이프라인 하네스 노드 클릭 → [재설계 요청] 버튼
  ↓
자연어 입력: "BE Developer 를 GPT-4o-mini 로 교체해주세요"
  ↓
POST /harness/v1/redesign-request
{
  "project_id": "...",
  "agent_id": "be-developer",
  "request_text": "...",
  "requester_user_id": "...",
  "requester_level": "L3"
}
  ↓
하네스 검토 (Orchestrator 자문 가능)
  ↓
응답:
  수락 → { decision: 'accept', new_model: '...', impact: {...} }
  거부 → { decision: 'reject', reason: '...', alternatives: [...] }
  ↓
Wiring 에 감사 로그 기록 (G-141)
  ↓
수락 시 H-002 로 새 배정 이벤트 전송
```

---

## H-004 — 스킬 적합화 결과 (MUST)

### 방향

**하네스 → 웹**

### 흐름

```
Tech Leader / SSOT Master 가 HITL 결정 처리 완료
  ↓
하네스가 결과를 spec-common 에 반영
  ↓
이벤트: { type: 'harness.adaptation_result', ... }
  ↓
Wiring 적합화 탭:
  - 결정된 카드 sesolved 상태 반영
  - 확정 규칙 타임라인 업데이트
  - 온톨로지 연쇄 추천 카드 생성 (있으면)
```

### 이벤트 페이로드

```typescript
interface AdaptationResultEvent {
  type: 'harness.adaptation_result';
  project_id: string;
  hitl_card_id: string;
  resolution: {
    option_id: string;
    aligned_with_ai: boolean;
    ai_confidence: number;
  };
  
  // 파생 결과
  new_rules: RuleTimelineEntry[];       // 추가된 규칙
  triggered_recommendations: OntologyRecommendation[];
  architecture_changes?: ArchitectureChange[];  // 문서 재생성 필요 시
}
```

---

## H-005 — 세션 / 인프라 상태 (MUST)

### 방향

**인프라 → 웹**

### 용도

모드 A/B/C 에 따른 인프라 상태 실시간 노출.

### 이벤트

```typescript
type SessionInfraEvent =
  // Mode A: 그릿지 전용 컴퓨터 상태
  | { type: 'harness.session.mode_a'; machine_id: string; status: 'active'|'idle'|'offline'; uptime_sec: number; sessions: SessionInfo[] }
  
  // Mode B: 고객 서버 상태
  | { type: 'harness.session.mode_b'; endpoint: string; status: 'active'|'unreachable'; available_models: string[] }
  
  // Mode C: 고객 API 상태
  | { type: 'harness.session.mode_c'; api_key_status: 'active'|'expired'; rate_limit_usage: number };
```

### Wiring UI 반영

설정 > 인프라 상태 탭:
- Mode A: "전용 컴퓨터 M-042 / 상태: 활성 / 업타임 14일 / 세션 5개"
- Mode B: "엔드포인트 vllm.internal.acme.kr / 상태: 활성 / 모델 3개 사용 가능"
- Mode C: "API 키 활성 / 이번 달 사용량 67%"

---

## H-xxx 공통 원칙

### 인증 (MUST)

Wiring ↔ 하네스 AI 간 통신은 **내부 서비스 토큰**:
```
Authorization: Bearer <service-token>
X-Service: wiring-web
```

- 서비스 토큰은 주기 로테이션 (24h)
- 외부 네트워크 노출 금지

### Mode 별 배포 (MUST, G-087)

| Mode | Wiring 위치 | 하네스 AI 위치 |
|---|---|---|
| A | Gridge 클러스터 | Gridge 클러스터 (전용 컴퓨터) |
| B | 고객 클러스터 | 고객 클러스터 |
| C | Gridge 클러스터 | Gridge 클러스터 (고객 API 키로 호출) |

Mode B 에서 하네스가 Gridge 서버로 이벤트 전송 금지.

### 외부 노출 금지 (MUST, G-004)

`/harness/*` API 경로 / 이벤트 타입 내부 구조는 **공개 문서화 X**:
- Wiring / LucaPus 내부에서만 사용
- 고객 / 파트너 SDK 공개 금지
- 문서 / 블로그에 예시 노출 금지

### 성능 목표 (SHOULD)

| 작업 | p50 | p99 |
|---|---|---|
| H-001 기획서 분석 트리거 | 300ms | 1s |
| H-002 배정 결과 전파 | 100ms | 500ms |
| H-003 재설계 요청 검토 | 2s | 10s |
| H-004 적합화 결과 전파 | 200ms | 1s |
| H-005 세션 상태 업데이트 | 실시간 (WebSocket) | — |

### 실패 대응 (MUST)

- 각 API 호출 실패 시 3회 재시도
- 지속 실패 시 Wiring UI 에 "하네스 AI 일시 장애" 배너 (PL-004-09)
- 장애 중에도 Wiring 본 기능 (적합화 / 칸반) 은 정상 유지

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] L3 외 사용자가 H-003 재설계 요청 가능?
- [ ] H-002 배정 결과에 "모델 변경 버튼" 노출 (G-025 위반)?
- [ ] Mode B 에서 하네스 이벤트가 Gridge 서버 경유?
- [ ] 서비스 토큰이 평문 저장 또는 로그 노출?
- [ ] `/harness/*` API 가 외부 네트워크에 노출?
- [ ] H-005 에 고객 API 키 원문 포함?
- [ ] H-003 재설계 수락에 감사 로그 누락 (G-141 위반)?
- [ ] 하네스 장애 시 Wiring 본 기능도 중단?

---

## 참조

- 하네스 AI 규칙: `products/lucapus/orchestrators/harness.md` (PL-004)
- 모델 변경 금지: `02_architecture.md § 5` (G-025)
- 배정 이유 카테고리: `products/lucapus/orchestrators/harness.md § PL-004-02`
- 재설계 수락/거부: `products/lucapus/orchestrators/harness.md § PL-004-03`
- 세션 배지 UI: `products/wiring/rules/session_badge.md` (PW-010)
- 파이프라인 노드 UI: `products/wiring/rules/pipeline_view.md § PW-003`
- 감사 로그: `08_security.md § 2` (G-141)
- 위계 권한 검증: `03_hierarchy.md § 10` (G-052)
- Mode B 격리: `05_infra_mode.md § 7` (G-087)
- 외부 노출 금지: `01_product.md § 4` (G-004)
