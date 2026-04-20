# Wiring / Pipeline View — 규칙 본문

> PW-002 ~ PW-005 본문. 파이프라인 탭의 구현 규칙.
> React Flow + n8n UX 패턴. 오케스트레이션/토폴로지 듀얼 뷰.

---

## PW-002 — 파이프라인 탭 구조 (MUST)

### 기술 스택

- React Flow (`@xyflow/react` / `xyflow@28k stars` 기반)
- n8n UX 패턴 차용 (노드 실행 상태, 데이터 흐름, 병목)
- Zustand: `useEdgeStore` + `useAgentStore`

### 듀얼 뷰

| 뷰 | 용도 | 위치 |
|---|---|---|
| **오케스트레이션 뷰** (기본) | 실행 상태 + HITL 병목 + 규칙 관계 | `/pipeline` |
| **토폴로지 뷰** | 에이전트 구조도 + 하네스 재설계 | `/settings/harness` |

---

## PW-002-01 — Stage 분기 (MUST)

`04_stage § 4` / G-063 정합:

| Stage | 파이프라인 표시 |
|---|---|
| 0, 1 | ❌ **미표시** (탭 자체 제거) |
| 2 | ✅ AI 모듈만 (agent 필드 있는 아이템 관련 노드만 활성) |
| 3 | ✅ 전체 (모든 AI + 모든 사람 + 하네스) |

Stage 2의 "AI 모듈만" 의미:
- 활성 노드: `item.agent` 필드가 있는 아이템의 담당 에이전트
- 비활성 노드: 회색 idle 상태로 표시 (제거 X — 구조 파악용)

---

## PW-003 — 3종 노드 (MUST)

### 사람 노드 (둥근)

```tsx
type HumanNode = {
  id: string;              // 'user-john'
  name: string;
  level: 'OA' | 'L1' | 'L2' | 'L3' | 'L4';
  pendingHitl: number;     // 대기 중인 HITL 건수
};

// 모양: border-radius: 16px
// 테두리: 1px subtle
// HITL 2건+ 시 glow 효과
```

**클릭 시:**
- ⚡ 결정 대기 최상단 표시
- [적합화에서 결정하기] 링크
- 최근 결정 이력 5건

### AI 노드 (각진)

```tsx
type AINode = {
  id: string;              // 'ssot-master' | 'tech-leader' | 'be-developer' | ...
  name: string;
  role: 'orchestrator' | 'executor';
  sessionType: string;     // 모드별 (G-083)
  status: 'active' | 'idle' | 'error' | 'hitl';
  assignedCount: number;
  tokensToday: number;     // Mode A
  costUsdToday?: number;   // Mode C
  resourceCpu?: number;    // Mode B
};

// 모양: border-radius: 4px
// 테두리: 2px default
```

**클릭 시:**
- 할당 업무 리스트 (상태별 분류)
- 비용 (모드별 분기, G-082)
- 서브노드 확장 (📊 🧠)
- **모델 직접 변경 드롭다운 절대 없음** (G-025, PW-005-01)

### 하네스 노드 (각진 + ★)

```tsx
type HarnessNode = {
  name: 'Harness AI' | '하네스 AI';
  status: 'active';
  currentWork: string;     // "아키텍처 설계 검토 중" 등
};

// 모양: border-radius: 4px
// 테두리: 2px #09090B 굵게
// 별(★) 아이콘 우측 상단
```

**클릭 시:**
- 배정표 (역할 / 세션 / 배정 이유)
- 최근 설계 히스토리
- **[재설계 요청]** 버튼 (L3 전용, G-023-02)

---

## PW-003-01 — 노드 상태 배지 (MUST)

n8n 패턴 차용. 우측 상단 8px 원형 배지:

| 상태 | 색상 | 애니메이션 |
|---|---|---|
| active | `--status-active` (초록) | 없음 |
| idle | `--status-idle` (회색 50% 불투명) | 없음 |
| error | `--status-error` (빨강) | `pulse` 1s 무한 |
| hitl | `--status-hitl` (주황) | glow 효과 + 엣지 굵기 증가 |

### 실시간 상태 전환

- WebSocket 이벤트로 `node-status-changed` 수신
- Zustand 액션: `updateNodeStatus(nodeId, newStatus)`
- Framer Motion `animate` 로 부드러운 전환

---

## PW-004 — 4종 엣지 (MUST)

`design.md § PW-001-08` 정합:

| 방향 | 색상 | 굵기 | 스타일 | 라벨 |
|---|---|---|---|---|
| AI → 사람 | 주황 ⚡ | 1.5px | solid | "⚡ HITL N건" |
| 사람 → AI | 초록 ✓ | 1.5px | solid | "✓ 승인 N건" |
| AI → AI | 회색 | 1px | solid | 없음 |
| 하네스 → AI | 검정 | 1px | **dashed** | 없음 |

### 호버/클릭 동작

- **호버**: 툴팁 — "마지막 이관: N분 전 / 내용: ..." (간결히)
- **클릭**: 이관 이력 패널 펼침 (최근 10건 목록)

### 데이터 흐름 애니메이션

```tsx
// dashed 엣지에 이동 애니메이션
<motion.path
  d={edgePath}
  stroke={color}
  strokeDasharray="5,5"
  animate={{ strokeDashoffset: [0, -10] }}
  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
/>
```

---

## PW-005 — 서브노드 (📊 🧠) (MUST)

AI 노드 확장 시 표시. 하네스 / 사람 노드에는 없음.

### 📊 비용/자원 서브노드

모드별 내용 다름 (G-084 정합):

| Mode | 내용 |
|---|---|
| A | 세션 + 토큰 (오늘 / 주간 / 월간) |
| B | 모델명 + 자원률 (CPU% / GPU% / 메모리) |
| C | 모델명 + USD (에이전트별 breakdown) |

### 🧠 메모리 서브노드 (모드 무관)

```tsx
type MemoryBlock = {
  name: string;            // "개발 규칙 (spec-common)"
  items: number;           // 105
  sizeKb: number;          // 42
  updatedAt: string;
};
```

표시: 이름 / 건수 / 크기 / 갱신일

---

## PW-005-01 — 모델 변경 금지 (MUST, G-025 정합)

AI 노드의 서브노드 / 클릭 패널 **어디에도 모델 직접 변경 UI 없음**:

- ❌ 드롭다운
- ❌ 모델 이름 클릭 → 변경 모달
- ❌ 서브노드 내부 수정 버튼

### 허용된 변경 경로

**하네스 AI에 재설계 요청 → 하네스가 결정 → 배정 변경** (G-023-02)

```
L3: [재설계 요청] 클릭
 → 자연어 입력 ("BE Developer가 단순 생성만 하니 GPT-4o로 변경해주세요")
 → 하네스가 검토 → 수락/거부
 → 수락 시 배정 변경 + 감사 로그 (G-141)
 → 거부 시 이유 명시
```

---

## PW-005-02 — 오케스트레이션 뷰 스코프 (MUST)

`03_hierarchy § 5` / G-050 정합. 위계별로 보이는 범위 다름:

### OA / L1

- **조직 전체**: 팀별 적합화 / 프로젝트 현황 / 조직 규칙 적용 현황
- **팀 간 규칙 충돌 감지** (PW-005-04)
- 안 보이는 것: 개별 프로젝트 에이전트 상세

### L2 PM

- **프로젝트 실행 요약**: 에이전트 / 내 HITL 대기 / 규칙 개수 + 추이
- "기술 리드에게 위임됨" 표시 (기술 결정 내용 X)
- 안 보이는 것: 규칙 관계 그래프 상세, 기술 결정 상세

### L3 기술 리드

- 프로젝트 실행 상세 + **규칙 관계 그래프** (requires/depends-on/triggers)
- 상속 경로 (🔒조직 / 팀 / 프로젝트)
- 네트워크 통계 오버레이 ("유사 340개 중 94% 동일")
- 미설정 추천 연결

### L4 개발자

- 할당 작업 + 관련 규칙 + 내 패턴 기여
- 안 보이는 것: 프로젝트 전체 규칙 그래프

### 서버 응답 레벨 분기 (G-052)

UI 분기는 클라이언트 `if (level === 'L3')` **금지**. 서버 응답에 이미 필터링된 데이터.

```typescript
// ❌ 금지
const edges = allEdges.filter(e => level >= 'L3');

// ✅ 올바름
const edges = useEdgeStore((s) => s.edges);  // 서버가 이미 필터링
```

---

## PW-005-03 — 규칙 관계 그래프 연결 (L3 전용)

L3 기술 리드 오케스트레이션 뷰에 규칙 관계 그래프 패널이 붙는다.
상세 스펙은 **PW-012** 참조: `products/wiring/rules/rule_graph.md`.

요약:
- 4종 관계 시각화: requires / depends-on / triggers / serves
- 상속 출처 라벨: 🔒조직 / 팀 / 프로젝트
- 네트워크 통계 오버레이 ("유사 340개 중 94% 동일")
- 미설정 추천 → 온톨로지 추천 카드 연결

L2 이하에는 그래프 패널 자체가 노출되지 않는다 (서버 응답 레벨 필터, G-052).

---

## PW-005-04 — 조직 뷰 규칙 충돌 감지 (OA/L1 전용) (SHOULD)

같은 규칙에 팀 간 다른 severity 적용 시 경고:

```
⚠ 규칙 충돌 감지
  규칙: "API 재시도 정책"
  Backend팀: MUST (3회 재시도)
  Platform팀: SHOULD (재시도 안 함 허용)

  → [규칙 통합 제안]
```

OA/L1 대시보드에만 표시. L2 이하에게는 노출 금지.

---

## PW-005-05 — 노드 실행 상태 실시간 반영 (MUST)

WebSocket 기반:

```typescript
// 클라이언트
socket.on('pipeline:node-update', (event) => {
  const { nodeId, status, assignedCount, currentWork } = event;
  useAgentStore.getState().updateNode(nodeId, { status, assignedCount, currentWork });
});

// 서버
// 에이전트 상태 변경 시 broadcast
broadcastToOrg(org_id, 'pipeline:node-update', {
  nodeId: 'be-developer',
  status: 'active',
  assignedCount: 3,
  currentWork: 'PT-003 PointExpiryScheduler.java 구현 72%',
});
```

### 연결 끊김 대응

- WebSocket 재연결 시 전체 상태 refetch
- 3초 이상 끊김 시 UI에 "● 오프라인" 배지 표시

---

## PW-005-06 — 병목 시각화 (MUST)

### 사람 노드 병목

HITL 2건+ 대기 시:
- 노드 glow 효과 (box-shadow `0 0 16px var(--status-hitl)`)
- 해당 사람 → AI 엣지 굵기 2.5px
- "⚡ 2건 대기" 라벨 엣지 위에

### AI 노드 병목

할당 5건+ 시:
- 노드 `scale(1.1)` + `font-weight: bold`
- 가장 오래된 작업 시간 표시 (`"5분 전 시작"`)

### 전체 병목 알림

3+ 노드에 병목 감지 시 우측 상단 경고 배너:
```
⚠ 파이프라인 병목 감지
  김PM / 이시니어 + BE Developer
  [파이프라인 분석 →]
```

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] Stage 0/1에서 파이프라인 탭 접근 가능?
- [ ] AI 노드에 모델 변경 드롭다운 존재 (G-025 위반)?
- [ ] 엣지 4종 색상 중 누락?
- [ ] 하네스 노드가 각진 + ★ 아닌 다른 모양?
- [ ] OA 뷰에 개별 에이전트 상세 노출?
- [ ] L2 뷰에 기술 결정 내용 노출 (권한 경계 위반)?
- [ ] L4 뷰에 프로젝트 전체 규칙 그래프 노출?
- [ ] 클라이언트 `if (level === ...)` 분기 (G-052 위반)?
- [ ] WebSocket 끊김 후 stale 상태 유지?

---

## 참조

- Stage 분기: `04_stage.md § 4` (G-063)
- 위계 × 뷰: `03_hierarchy.md § 5` (G-050)
- Mode × 비용: `05_infra_mode.md § 2, 4` (G-082, G-084)
- 세션 배지: `products/wiring/rules/session_badge.md` (PW-010)
- 비용 표시 상세: `products/wiring/rules/cost_display.md` (PW-011)
- 규칙 관계 그래프 상세: `products/wiring/rules/rule_graph.md` (PW-012)
- 디자인 토큰: `products/wiring/rules/design.md` (PW-001)
- 모델 변경 금지: `02_architecture.md § 5` (G-025)
- React Flow 스킬: `skills/react-flow.md` (작성 예정)
