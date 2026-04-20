# LucaPus / Schemas / harness_assignments — 테이블 본문

> 하네스 AI 의 에이전트별 모델 배정 이력.
> PL-004 (하네스 AI) 가 작성 / 관리.

---

## DDL

```sql
CREATE TABLE harness_assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 배정 대상
  agent_id          text NOT NULL,         -- 'harness', 'ssot-master', 'be-developer', ...
  model_id          text NOT NULL,         -- 'claude-opus-4-7', 'gpt-4o', 'vllm-llama3-70b', ...
  mode              text NOT NULL CHECK (mode IN ('A','B','C')),

  -- 배정 근거
  assignment_reason text NOT NULL,         -- PL-004-02 카테고리 (예: "긴 컨텍스트 필요", "코드 생성 속도")
  alternatives_considered text[] DEFAULT ARRAY[]::text[],
  task_characteristics jsonb,              -- { reasoning_depth, context_length, speed_priority, ... }

  -- 배정 주체
  assigned_by       text NOT NULL CHECK (assigned_by IN (
    'harness_initial',       -- 프로젝트 초기 배정
    'harness_auto_reassign', -- 자동 배정 변경 (rate limit 등)
    'harness_cost_optimize', -- 비용 최적화
    'l3_redesign_accepted'   -- L3 재설계 요청 수락
  )),
  harness_version   text NOT NULL DEFAULT '1.0',
  assigned_at       timestamptz NOT NULL DEFAULT now(),

  -- 교체 추적
  retired_at        timestamptz,            -- 다른 배정으로 교체된 시점
  replaced_by_id    uuid REFERENCES harness_assignments(id),

  -- 재설계 연결
  redesign_request_id uuid REFERENCES harness_redesign_requests(id)
);

-- 인덱스
CREATE INDEX idx_harness_current ON harness_assignments(project_id, agent_id)
  WHERE retired_at IS NULL;                        -- 현재 활성 배정만
CREATE INDEX idx_harness_history ON harness_assignments(project_id, agent_id, assigned_at DESC);
CREATE INDEX idx_harness_redesign ON harness_assignments(redesign_request_id);

-- RLS
ALTER TABLE harness_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "harness_assignments_org_isolation"
  ON harness_assignments FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- INSERT: harness 서비스 role 만
CREATE POLICY "harness_assignments_system_write"
  ON harness_assignments FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'gridge_harness');
```

---

## 필드 설명

### `agent_id`

에이전트 식별자. 고정 카탈로그 (PL-002~003):
- `harness` (하네스 AI 자체)
- `ssot-master`, `scrum-master`, `tech-leader` (Orchestrator)
- `be-developer`, `fe-developer`, `qa-verifier`, `doc-writer` (Executor)

### `assignment_reason`

PL-004-02 의 7 카테고리 중 하나:
- `"긴 컨텍스트 (200k+)"`
- `"깊은 추론 필요"`
- `"코드 생성 속도"`
- `"비용 효율"`
- `"한국어 특화"`
- `"검증 분석"`
- `"온프레 호환"`

### `task_characteristics`

배정 당시 판단 근거:
```json
{
  "reasoning_depth": "high",
  "context_length_estimate": 150000,
  "speed_priority": false,
  "cost_sensitivity": false,
  "korean_priority": false
}
```

### `retired_at` / `replaced_by_id`

배정 히스토리 추적:
- 새 배정 생성 시 기존 활성 배정의 `retired_at` 설정
- `replaced_by_id` 로 교체 체인 조회 가능

---

## 조회 패턴

### 현재 활성 배정

```sql
SELECT * FROM harness_assignments
WHERE project_id = $1 AND retired_at IS NULL
ORDER BY agent_id;
```

### 에이전트별 배정 히스토리 (Wiring "배정 히스토리" UI)

```sql
SELECT * FROM harness_assignments
WHERE project_id = $1 AND agent_id = $2
ORDER BY assigned_at DESC
LIMIT 10;
```

---

## 감사 로그 연동 (G-141)

배정 변경 시 `audit_logs` 에도 기록:
- `action: 'harness_initial_assignment'` (최초)
- `action: 'harness_redesign_accepted'` (L3 요청 수락)
- `action: 'harness_auto_reassign'` (자동 변경, rate limit 등)

---

## 관계

- `harness_assignments.org_id/project_id` → `projects`
- `harness_assignments.redesign_request_id` → `harness_redesign_requests`
- `harness_assignments.replaced_by_id` → 자기 참조 (교체 체인)

---

## 참조

- 하네스 규칙: `products/lucapus/orchestrators/harness.md` (PL-004)
- 모델 변경 금지 (고객): `02_architecture.md § 5` (G-025)
- 재설계 요청 테이블: `schemas/tables/harness_redesign_requests.md` (별도, 향후)
- 감사 로그: `products/wiring/schemas/tables/audit_logs.md`
- H-001~H-005 하네스 API: `integrations/harness-api.md`
