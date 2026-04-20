# Wiring / Schemas / agents — 테이블 본문

> AI 에이전트 상태. 각 agent_id (harness, ssot-master, be-developer 등) 별 세션 + 세션 배지 연결.

---

## DDL

```sql
CREATE TABLE agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id),
  
  -- 에이전트 식별
  agent_id        TEXT NOT NULL,
  /* 값:
     'harness',          -- 하네스 (라우터)
     'ssot-master',      -- SSOT 마스터
     'scrum-master',     -- 스크럼 마스터
     'tech-leader',      -- 테크 리더
     'be-developer',     -- 백엔드 개발자
     'fe-developer',     -- 프론트엔드 개발자
     'qa-verifier',      -- QA
     'doc-writer'        -- 문서 작성
  */
  
  -- 현재 세션 정보 (PW-013)
  current_model   TEXT,         -- 'Claude Max' (Mode A), 'vLLM Llama-3' (Mode B), 'Claude Sonnet 4' (Mode C)
  current_vendor  TEXT,         -- 'anthropic', 'openai', 'google', 'local'
  mode            TEXT CHECK (mode IN ('A','B','C')),
  
  -- 상태
  status          TEXT NOT NULL DEFAULT 'idle'
                  CHECK (status IN ('idle','running','blocked','error','maintenance')),
  
  -- 할당
  assigned_to_user_id UUID REFERENCES users(id),   -- 인간 파트너
  handover_chain  UUID[],                           -- 이전 담당자들
  
  -- 실행 메타
  current_item_id UUID REFERENCES items(id),        -- 현재 작업 중 아이템
  last_active_at  TIMESTAMPTZ,
  
  -- 통계
  total_runs      INT DEFAULT 0,
  total_runtime_minutes INT DEFAULT 0,
  success_rate    NUMERIC(5,2),
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (org_id, agent_id, project_id)
);

CREATE INDEX idx_agents_status ON agents(org_id, status, last_active_at DESC);
CREATE INDEX idx_agents_assigned ON agents(assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;
```

## 에이전트 ↔ 인간 매핑 (PW-013 세션 배지)

Mode 별로 다른 모델이 각 에이전트에 배정 (세션 매핑):

| agent_id | Mode A | Mode B | Mode C |
|---|---|---|---|
| `harness` | Claude Max | vLLM Llama-3 | Claude Opus 4 |
| `ssot-master` | Claude Max | vLLM Llama-3 | Claude Sonnet 4 |
| `scrum-master` | Claude Max | vLLM Llama-3 | Claude Sonnet 4 |
| `tech-leader` | Claude Max | vLLM Llama-3 | Claude Opus 4 |
| `be-developer` | ChatGPT Pro | Ollama CodeLlama | GPT-4o |
| `fe-developer` | ChatGPT Pro | Ollama CodeLlama | GPT-4o |
| `qa-verifier` | Claude Max | vLLM Llama-3 | Claude Sonnet 4 |
| `doc-writer` | Claude Max | vLLM Llama-3 | Claude Sonnet 4 |

**중앙 상수 관리 (G-131)**: `SESSION_MAPPING` 참조. 하드코딩 금지.

## 상태 전이

```
idle ─(작업 배정)→ running ─(완료)→ idle
                      │
                      ├─(HITL 대기)→ blocked ─(승인)→ running
                      │
                      └─(오류)→ error
```

## 핸드오버 체인

작업 연속성 유지:
```
harness → ssot-master → tech-leader → be-developer → qa-verifier → doc-writer → harness
```

각 단계에서 `handover_chain` append.

## RLS

```sql
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_org_member"
  ON agents FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM users WHERE auth_user_id = auth.uid())
  );
```

## 참조

- 세션 배지 규칙: `rules/session_badge.md` (PW-013)
- Mode 정의: `05_infra_mode.md` (G-080~090)
- `agent_sessions` 세부 세션 이력: `tables/agent_sessions.md` (v0.26+)
- 하네스 배정: `tables/harness_assignments.md` (v0.26+)
- 중앙 상수 관리: `07_coding_standard.md § G-131`
