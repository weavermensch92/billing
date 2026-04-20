# Wiring / Schemas — INDEX

> Wiring 백엔드(Supabase) 테이블 카탈로그.
> F/S 체인의 탐색 단계(§ 2.2 "관련 스키마 탐색")가 최초 참조하는 파일.
> 전체 디렉토리 스캔 금지 — 이 INDEX가 시작점.

---

## 전수 테이블 목록

### 조직/사용자 (G-040~G-053 연동)

| 테이블 | 용도 | 본문 | 상태 |
|---|---|---|---|
| `orgs` | 고객 조직 정보 | `tables/orgs.md` | P1 |
| `teams` | 조직 내 팀 | `tables/teams.md` | P1 |
| `users` | 사용자 (Wiring 6단 위계) | `tables/users.md` | P1 |
| `user_teams` | 사용자 ↔ 팀 다대다 | `tables/user_teams.md` | P1 |
| `projects` | 프로젝트 | `tables/projects.md` | P1 |

### 적합화 (PW-006/007, G-100~G-111 연동)

| 테이블 | 용도 | 본문 | 상태 |
|---|---|---|---|
| `hitl_cards` | 적합화 HITL 4종 카드 (통합 리스트) | `tables/hitl_cards.md` | P1 ★ 완성 |
| `rule_timeline` | 확정 규칙 타임라인 + 관계 | `tables/rule_timeline.md` | P1 ★ 완성 |
| `ontology_recommendations` | 온톨로지 추천 이력 (별도) | `tables/ontology_recommendations.md` | P2 |
| `code_patterns` | 감지된 코드 패턴 | `tables/code_patterns.md` | P2 |

### 칸반/아이템 (PW-008 연동)

| 테이블 | 용도 | 본문 | 상태 |
|---|---|---|---|
| `items` | 칸반 아이템 | `tables/items.md` | P1 ★ 완성 |
| `sub_items` | 하위 작업 (B1~B6 레이어) | `tables/sub_items.md` | P2 |
| `item_artifacts` | 산출물 (스펙/코드/테스트) | `tables/item_artifacts.md` | P2 |

### AI 에이전트 (G-020~G-029 연동)

| 테이블 | 용도 | 본문 | 상태 |
|---|---|---|---|
| `agents` | AI 에이전트 상태 | `tables/agents.md` | P1 |
| `agent_sessions` | 에이전트 실행 세션 | `tables/agent_sessions.md` | P2 |
| `harness_assignments` | 하네스 배정표 | `tables/harness_assignments.md` | P2 |

### 감사/로그 (G-109, G-140~G-147 연동)

| 테이블 | 용도 | 본문 | 상태 |
|---|---|---|---|
| `audit_logs` | 감사 로그 (immutable) | `tables/audit_logs.md` | P1 ★ 완성 |
| `activity_logs` | 실시간 활동 로그 (6유형) | `tables/activity_logs.md` | P2 |

### 외부 연동 (I-001~I-015 연동)

| 테이블 | 용도 | 본문 | 상태 |
|---|---|---|---|
| `integrations` | Jira/Slack/GitHub 연결 상태 | `tables/integrations.md` | P2 |
| `jira_item_mapping` | 아이템 ↔ Jira 이슈 매핑 | `tables/jira_item_mapping.md` | P3 |

### 비용/사용량 (G-082, AiOPS 연동)

| 테이블 | 용도 | 본문 | 상태 |
|---|---|---|---|
| `token_usage` | 토큰 사용량 (Mode A/C) | `tables/token_usage.md` | P2 |
| `cost_budgets` | 예산 + 경고 임계치 | `tables/cost_budgets.md` | P2 |

---

## ★ 핵심 테이블 — 인라인 DDL (P1)

본문 파일 미존재 시 이 요약으로 대체 가능.

### adapt_queue (PW-006 결정 대기 큐)

```sql
CREATE TABLE adapt_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id),
  item_id       uuid REFERENCES items(id),  -- 칸반 아이템 연관

  -- G-102 노드 타입 4종
  type          text NOT NULL CHECK (type IN (
    'policy_confirm',       -- 🔶 비즈니스 결정
    'tech_decision',        -- 🔷 기술 결정
    'code_pattern',         -- 🔶 코드 패턴 승격
    'ontology_recommend'    -- 🔗 온톨로지 추천
  )),

  title         text NOT NULL,
  context       text,           -- 근거 설명
  options       jsonb NOT NULL, -- 선택지 배열
  rule_ref      text,           -- spec-common D-xxx 또는 기획서 p.N
  ai_recommend  text,           -- AI 권장안
  ai_confidence smallint,       -- 0~100 신뢰도

  -- G-103/104 라우팅
  assignee_level text NOT NULL CHECK (assignee_level IN ('L2','L3','L4')),
  assignee_user  uuid REFERENCES users(id),

  priority      text DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  status        text DEFAULT 'pending' CHECK (status IN ('pending','resolved','rejected','deferred')),

  -- 코드 패턴 특수 필드
  pattern_occurrences  integer,  -- 감지 횟수 (3+ 시 패턴 배지)
  pattern_source_items uuid[],   -- 감지된 아이템들

  -- 온톨로지 특수 필드
  ontology_source       text,          -- "그릿지 네트워크 340개 프로젝트"
  ontology_adoption_pct smallint,      -- 92

  created_at    timestamptz DEFAULT now(),
  resolved_at   timestamptz,
  resolved_by   uuid REFERENCES users(id),
  resolved_option text,          -- 선택된 옵션

  -- G-109 감사 연동
  audit_log_id  uuid REFERENCES audit_logs(id)
);

-- 인덱스
CREATE INDEX idx_adapt_queue_project_status ON adapt_queue(project_id, status);
CREATE INDEX idx_adapt_queue_assignee ON adapt_queue(assignee_level, status)
  WHERE status = 'pending';

-- RLS (G-052 서버 필터링)
ALTER TABLE adapt_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see only their level's cards"
  ON adapt_queue FOR SELECT
  USING (
    project_id IN (SELECT project_id FROM user_projects WHERE user_id = auth.uid())
    AND type = ANY(allowed_types_for_level(auth.jwt() ->> 'level'))
  );
```

### rules (확정 규칙 타임라인)

```sql
CREATE TABLE rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id),

  name          text NOT NULL,
  description   text,
  category      text CHECK (category IN (
    'design','db','api','security','hitl','testing','performance'
  )),

  severity      text NOT NULL CHECK (severity IN ('MUST','SHOULD','MAY')),

  -- G-042 상속
  scope         text NOT NULL CHECK (scope IN ('org','team','project')),
  inherit_from  uuid REFERENCES rules(id),  -- 상속 출처
  locked        boolean DEFAULT false,  -- 조직 MUST는 true

  -- 출처 추적
  source        text NOT NULL CHECK (source IN (
    'detected',          -- 코드베이스 감지
    'manual',            -- 수동 추가
    'hitl_resolved',     -- HITL 결정으로 확정
    'pattern_promoted',  -- 코드 패턴 승격
    'ontology_accepted', -- 온톨로지 추천 수락
    'template'           -- 템플릿에서 추가
  )),
  source_queue_id uuid REFERENCES adapt_queue(id),  -- HITL 결정 시 연결

  created_at    timestamptz DEFAULT now(),
  created_by    uuid REFERENCES users(id),
  updated_at    timestamptz DEFAULT now(),

  -- 정합성 (G-101 6단계)
  audit_log_id  uuid REFERENCES audit_logs(id) NOT NULL
);

CREATE INDEX idx_rules_project_severity ON rules(project_id, severity);
CREATE INDEX idx_rules_scope_locked ON rules(scope, locked);
```

### items (칸반 아이템)

```sql
CREATE TABLE items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id),

  title         text NOT NULL,
  description   text,
  epic          text,

  -- PW-008 6컬럼
  status        text NOT NULL DEFAULT 'BACKLOG' CHECK (status IN (
    'BACKLOG','SPEC','DEV','HITL','REVIEW','DONE'
  )),
  progress_pct  smallint DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),

  priority      text DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),

  -- AI 에이전트 할당
  agent_id      uuid REFERENCES agents(id),
  agent_session_id uuid REFERENCES agent_sessions(id),

  -- 사람 담당자
  assignee_user uuid REFERENCES users(id),

  -- HITL 연결 (현재 대기 중인 카드가 있는 경우)
  hitl_queue_id uuid REFERENCES adapt_queue(id),

  -- 외부 연동
  jira_issue_key text,

  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  completed_at  timestamptz
);

CREATE INDEX idx_items_project_status ON items(project_id, status);
CREATE INDEX idx_items_agent ON items(agent_id) WHERE status = 'DEV';
CREATE INDEX idx_items_hitl ON items(hitl_queue_id) WHERE status = 'HITL';
```

### audit_logs (immutable)

```sql
CREATE TABLE audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id),

  action        text NOT NULL,  -- '적합화 결정', '규칙 변경', '위계 변경' 등
  actor_user    uuid NOT NULL REFERENCES users(id),
  actor_level   text NOT NULL,  -- 당시 위계 (나중에 강등돼도 기록 보존)

  target_type   text,  -- 'rule', 'item', 'user', 'team' 등
  target_id     uuid,

  before_value  jsonb,
  after_value   jsonb,

  -- G-109 HITL 특수 필드
  hitl_node_type  text,          -- policy_confirm 등
  ai_recommend    text,
  aligned_with_ai boolean,       -- 사람 선택이 AI 권장과 일치
  duration_sec    integer,       -- 카드 노출부터 결정까지
  conditional_input text,        -- "조건부" 자연어 원문

  at            timestamptz NOT NULL DEFAULT now()
);

-- G-141 immutable: UPDATE/DELETE 금지
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

CREATE INDEX idx_audit_logs_project_at ON audit_logs(project_id, at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_user, at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, at DESC);
```

---

## 스키마 변경 프로토콜 (G-070~G-072, S 체인)

스키마 수정 요청 시:

1. **S 체인** 진입 (`90_execution_chain.md § S`)
2. 해당 테이블 본문(`tables/*.md`)에서 현재 상태 확인
3. 마이그레이션 파일 생성: `supabase/migrations/YYYY-MM-DD_<slug>.sql`
4. RLS 영향 검토
5. 기존 쿼리 회귀 테스트
6. 본문 파일 업데이트 (필드 변경 이력 포함)

---

## 공통 RLS 원칙 (G-052 서버 필터링)

모든 테이블에 RLS 활성화. 기본 정책:

- **SELECT**: 사용자가 속한 project_id만 + 위계별 추가 필터
- **INSERT**: 해당 위계가 권한 있을 때만 (G-045 매트릭스)
- **UPDATE**: 본인 또는 상위 위계가 작성한 것만
- **DELETE**: 대부분 불가 (soft delete 선호), `audit_logs`는 절대 불가

---

## 본문 파일 작성 시 표준 포맷

```markdown
# <테이블명> — <한 줄 설명>

## DDL
[CREATE TABLE 전문]

## 필드 상세
[각 컬럼별 의미/제약/예시]

## 인덱스
[생성 인덱스 목록 + 이유]

## RLS 정책
[정책 전문]

## 쿼리 패턴
[자주 쓰는 SELECT 예시]

## 변경 이력
[필드 추가/수정 이력 날짜순]

## 참조
[연관 규칙 ID + 다른 테이블]
```

---

## 참조

- DB 코드 표준: `07_coding_standard.md § G-127` (환경 변수)
- 보안 / PII: `08_security.md` (작성 예정)
- RLS 원칙: `03_hierarchy.md § 9` (서버 필터링 우선)
- 감사 로그 G-141: `08_security.md`
- Supabase 스킬: `skills/supabase/SKILL.md` (작성 예정)
