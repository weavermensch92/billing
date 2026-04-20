# Wiring / Schemas / harness_assignments — 테이블 본문

> 하네스 배정표. 어떤 agent → 어떤 model 조합이 현재 활성인지. 중앙 레지스트리 (G-131 정합).

---

## DDL

```sql
CREATE TABLE harness_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- 매핑 키
  agent_id        TEXT NOT NULL,        -- 'harness', 'ssot-master', etc
  mode            TEXT NOT NULL CHECK (mode IN ('A','B','C')),
  
  -- 할당된 모델
  vendor          TEXT NOT NULL,        -- 'anthropic', 'openai', 'local', 'google'
  model_id        TEXT NOT NULL,        -- 'claude-opus-4', 'llama-3-70b', 'gpt-4o'
  
  -- 설정
  max_tokens      INT DEFAULT 8000,
  temperature     NUMERIC(3,2) DEFAULT 0.7,
  
  -- API 엔드포인트 (Mode B 온프레미스 / Mode C 고객 API)
  api_endpoint    TEXT,
  api_key_vault_ref TEXT,
  
  -- 상태
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','deprecated','testing')),
  
  -- 변경 이력
  previous_model_id  TEXT,
  changed_at      TIMESTAMPTZ,
  changed_by      UUID REFERENCES users(id),
  change_reason   TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (org_id, agent_id, mode)
);

CREATE INDEX idx_harness_assignments_active ON harness_assignments(org_id, status)
  WHERE status = 'active';
```

## 기본 시드 (조직 생성 시 자동)

```sql
-- Mode A (Gridge 호스팅, Claude Max + ChatGPT Pro 기본)
INSERT INTO harness_assignments (org_id, agent_id, mode, vendor, model_id) VALUES
  ($org, 'harness', 'A', 'anthropic', 'claude-opus-4'),
  ($org, 'ssot-master', 'A', 'anthropic', 'claude-opus-4'),
  ($org, 'scrum-master', 'A', 'anthropic', 'claude-sonnet-4-5'),
  ($org, 'tech-leader', 'A', 'anthropic', 'claude-opus-4'),
  ($org, 'be-developer', 'A', 'openai', 'gpt-4o'),
  ($org, 'fe-developer', 'A', 'openai', 'gpt-4o'),
  ($org, 'qa-verifier', 'A', 'anthropic', 'claude-sonnet-4-5'),
  ($org, 'doc-writer', 'A', 'anthropic', 'claude-sonnet-4-5');
```

## 모델 변경 시

```sql
-- Claude 4 → Claude 5 업데이트
UPDATE harness_assignments
SET 
  previous_model_id = model_id,
  model_id = 'claude-opus-5',
  changed_at = now(),
  changed_by = $user,
  change_reason = 'Anthropic 신모델 출시, 전면 전환'
WHERE org_id = $org AND agent_id = 'harness' AND mode = 'A';

-- audit_logs
INSERT INTO audit_logs (action_type, visibility, ...)
VALUES ('harness_model_upgraded', 'both', ...);
```

## 참조

- `agents`: `tables/agents.md` (현재 모델 / 상태)
- `agent_sessions`: `tables/agent_sessions.md`
- 중앙 상수 (하드코딩 금지): `07_coding_standard.md § G-131`
- 세션 배지 UI: `screens/session_badges.md`
- Mode 격리: `05_infra_mode.md`
