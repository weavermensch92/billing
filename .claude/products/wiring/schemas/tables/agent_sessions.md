# Wiring / Schemas / agent_sessions — 테이블 본문

> 에이전트 실행 세션 상세. 각 agent 의 작업 단위 추적 + 토큰 사용량 + 모델 호출 이력.

---

## DDL

```sql
CREATE TABLE agent_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  agent_id          UUID NOT NULL REFERENCES agents(id),
  
  -- 세션 범위
  session_start     TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_end       TIMESTAMPTZ,
  duration_seconds  INT,
  
  -- 작업 대상
  item_id           UUID REFERENCES items(id),        -- 칸반 아이템
  hitl_card_id     UUID REFERENCES hitl_cards(id),    -- 적합화 카드
  project_id        UUID REFERENCES projects(id),
  
  -- 모델 실행
  model_used        TEXT NOT NULL,                    -- 'claude-opus-4', 'gpt-4o', 'llama-3-70b'
  vendor            TEXT NOT NULL,                    -- 'anthropic', 'openai', 'local'
  mode              TEXT NOT NULL CHECK (mode IN ('A','B','C')),
  
  -- 토큰 사용량
  input_tokens      INT DEFAULT 0,
  output_tokens     INT DEFAULT 0,
  estimated_cost_krw BIGINT DEFAULT 0,
  
  -- 세션 결과
  status            TEXT NOT NULL CHECK (status IN (
    'running','completed','failed','cancelled','blocked_hitl'
  )),
  error_message     TEXT,
  
  -- 상세 로그 참조
  handover_from_session_id UUID REFERENCES agent_sessions(id),
  handover_to_session_id   UUID REFERENCES agent_sessions(id),
  
  -- 감사
  initiated_by_user_id UUID REFERENCES users(id),
  
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_sessions_agent ON agent_sessions(agent_id, session_start DESC);
CREATE INDEX idx_agent_sessions_item ON agent_sessions(item_id) WHERE item_id IS NOT NULL;
CREATE INDEX idx_agent_sessions_running ON agent_sessions(agent_id, status)
  WHERE status = 'running';
```

## 세션 라이프사이클

```
[running] ─(완료)→ [completed]
     │                   │
     │                   └─(핸드오버)→ 다음 에이전트 세션 시작
     │
     ├─(HITL 대기)→ [blocked_hitl] ─(승인)→ [running] 재개
     │                                  └─(거부)→ [cancelled]
     │
     └─(오류)→ [failed]
```

## 토큰 비용 계산 (I-004 AiOPS 브릿지)

```sql
-- 월별 Wiring 에이전트 비용 집계 → Billing usage_snapshots 매핑
INSERT INTO billing.usage_snapshots (...)
SELECT
  o.billing_org_id,
  NULL AS account_id,          -- Wiring 계정은 VCN 없음 (Mode A 자체 해결)
  as_.model_used AS service_hint,
  as_.session_start::date AS snapshot_date,
  COUNT(*) AS api_calls,
  SUM(as_.input_tokens) AS input_tokens,
  SUM(as_.output_tokens) AS output_tokens,
  SUM(as_.estimated_cost_krw) AS estimated_cost_krw,
  'aiops_bridge'
FROM wiring.agent_sessions as_
JOIN wiring.orgs o ON o.id = as_.org_id
WHERE o.billing_org_id IS NOT NULL
  AND as_.session_start::date = CURRENT_DATE - 1
GROUP BY o.billing_org_id, as_.model_used, as_.session_start::date;
```

## 세션 연쇄 추적 (Handover Chain)

```sql
-- 특정 item 의 전체 처리 체인
WITH RECURSIVE chain AS (
  SELECT * FROM agent_sessions WHERE item_id = $1 AND handover_from_session_id IS NULL
  UNION ALL
  SELECT as_.* FROM agent_sessions as_
  JOIN chain c ON c.handover_to_session_id = as_.id
)
SELECT * FROM chain ORDER BY session_start;
```

## RLS

```sql
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_sessions_org_member"
  ON agent_sessions FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM users WHERE auth_user_id = auth.uid())
  );
```

## 참조

- `agents`: `tables/agents.md`
- `items`: `tables/items.md`
- I-004 브릿지: `integrations/billing-aiops.md`
- 세션 배지 UI: `screens/session_badges.md` (v0.26+)
- 토큰 비용 규칙: `rules/pricing.md` (PW-013)
