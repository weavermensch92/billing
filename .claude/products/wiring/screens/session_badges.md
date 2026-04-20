# Wiring / Screens / session_badges — 세션 배지 UI 규칙

> PW-013 세션 배지. 전역 UI 컴포넌트로 모든 AI 에이전트 상태 표시. 헤더 / 아이템 상세 / 적합화 카드 공통.

---

## 목적

사용자가 "지금 어떤 AI 모델이 내 조직에서 돌고 있는지" 실시간 파악. Mode A/B/C 전환 투명성.

## 컴포넌트 구조

```tsx
<SessionBadge 
  agentId="be-developer"
  mode="A"
  status="running"
  model="gpt-4o"
  vendor="openai"
/>
```

## 3가지 표시 변형

### 1. 컴팩트 (헤더, 리스트 뷰)

```
[🤖 be-dev · GPT-4o · 🟢]
```

단일 라인, 아이콘 + 모델명 + 상태 점.

### 2. 표준 (아이템 상세)

```
┌────────────────────────────────────────┐
│ 🤖 be-developer                         │
│ Model: GPT-4o (OpenAI)                  │
│ Mode: A (Gridge-hosted)                 │
│ Status: 🟢 Running                      │
│ Session: 2h 15m active                  │
│ Tokens: 45k in / 12k out · ₩18,500      │
└────────────────────────────────────────┘
```

### 3. 전체 (설정 / 하네스 배정 페이지)

```
┌──────────────────────────────────────────────┐
│ 🤖 Backend Developer                          │
│                                                │
│ Mode A 활성                                   │
│ ├ Model: GPT-4o                               │
│ ├ Vendor: OpenAI                              │
│ ├ Endpoint: api.openai.com (Gridge 관리)      │
│ └ 월 예상 비용: ₩3.2M (토큰 기반)            │
│                                                │
│ Mode B (온프레미스) 대기                      │
│ ├ Model: Ollama CodeLlama                     │
│ └ Endpoint: http://llm.internal (고객 관리)   │
│                                                │
│ Mode C (고객 API) 대기                        │
│ └ Model: GPT-4o (고객 API 키)                 │
│                                                │
│ 현재 세션: 5개 활성                            │
│ 총 실행: 127회 / 이번 달                      │
│ 성공률: 94% · 평균 응답: 12초                 │
└──────────────────────────────────────────────┘
```

## 상태 컬러 매핑

| 상태 | 색상 | 점 아이콘 |
|---|---|---|
| `idle` | 회색 | ⚪ |
| `running` | 초록 | 🟢 + pulsing |
| `blocked` | 노랑 | 🟡 |
| `error` | 빨강 | 🔴 |
| `maintenance` | 파랑 | 🔵 |

## Mode 색상 매핑

| Mode | 뱃지 스타일 |
|---|---|
| A (Gridge) | 파란 `bg-primary-100 text-primary-700` |
| B (On-prem) | 보라 `bg-purple-100 text-purple-700` |
| C (Customer API) | 오렌지 `bg-orange-100 text-orange-700` |

## 벤더 아이콘

| 벤더 | 아이콘 | 로고 색 |
|---|---|---|
| `anthropic` | 🟠 | #D97757 |
| `openai` | ⚫ | #000 |
| `google` | 🔵 | #4285F4 |
| `local` | 🟣 | #8B5CF6 |
| `meta` | 🔵 | #1877F2 |

## 데이터 소스

```sql
-- 실시간 구독
SELECT 
  a.agent_id, a.mode, a.status, a.current_model AS model,
  a.current_vendor AS vendor,
  a.last_active_at,
  (SELECT EXTRACT(EPOCH FROM (now() - session_start))::int
    FROM agent_sessions 
    WHERE agent_id = a.id AND status = 'running'
    ORDER BY session_start DESC LIMIT 1) AS active_session_seconds,
  (SELECT SUM(estimated_cost_krw) FROM agent_sessions
    WHERE agent_id = a.id 
      AND session_start >= date_trunc('month', now())) AS mtd_cost_krw
FROM agents a
WHERE a.org_id = $1;
```

## 실시간 갱신

```typescript
// 전역 Zustand store
const agentStatusStore = create((set) => ({
  agents: {},
  updateStatus: (agentId, patch) => set(state => ({
    agents: { ...state.agents, [agentId]: { ...state.agents[agentId], ...patch } }
  }))
}));

// Supabase subscribe (앱 전역 한 번만)
supabase.channel('agent_states')
  .on('postgres_changes', 
    { event: 'UPDATE', schema: 'wiring', table: 'agents' },
    (payload) => {
      agentStatusStore.getState().updateStatus(payload.new.id, payload.new);
    })
  .subscribe();
```

## 배치 위치 (전역)

### 앱 헤더 (우상단)
```
┌─────────────────────────────────────────┐
│ [로고] [네비]              [🤖🟢 5] [👤]│
└─────────────────────────────────────────┘
```
숫자 `5` = 현재 running 상태 에이전트 수. 클릭 → 전체 상태 팝오버.

### 아이템 카드
```
┌──────────────────────────────────┐
│ Item #12 - 로그인 폼 구현          │
│ [🤖 be-dev 🟢]  [🤖 qa 🟡]       │
└──────────────────────────────────┘
```

### 적합화 HITL 카드
```
┌──────────────────────────────────┐
│ [🤖 tech-leader · Claude Opus 🟢]│
│ 분석: Zod 검증 규칙 추가 제안     │
└──────────────────────────────────┘
```

## 시각적 피드백 (Status 전이)

```tsx
// Framer Motion
<motion.div
  animate={{ 
    scale: status === 'running' ? [1, 1.1, 1] : 1,
    opacity: status === 'idle' ? 0.6 : 1
  }}
  transition={{ 
    scale: { repeat: Infinity, duration: 1.5 }
  }}
>
  <StatusDot status={status} />
</motion.div>
```

## 클릭 액션

### 컴팩트 배지 클릭
→ 툴팁: 모델명, Mode, 현재 세션 활동 요약, 이번 달 비용

### 표준 배지 클릭
→ `/app/settings/agents/[agentId]` 이동 (전체 상세)

### 헤더 배지 클릭
→ 팝오버: 전체 8 에이전트 상태 그리드 뷰

## 접근성 (a11y)

```tsx
<button
  aria-label={`${agentId} agent running ${model} in ${mode} mode`}
  role="status"
  aria-live="polite"
>
  ...
</button>
```

## 구현 위치

- 컴포넌트: `components/session-badge.tsx`
- Zustand store: `stores/agent-status.ts`
- Supabase subscription: `lib/supabase/agent-subscription.ts` (앱 전역 1회)

## 참조

- `agents`: `schemas/tables/agents.md`
- `agent_sessions`: `schemas/tables/agent_sessions.md`
- `harness_assignments`: `schemas/tables/harness_assignments.md`
- 세션 배지 규칙: `rules/session_badge.md` (PW-013)
- Mode 정의: `05_infra_mode.md`
- 중앙 상수 (하드코딩 금지): `07_coding_standard.md § G-131`
