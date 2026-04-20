# Wiring / Schemas / items — 테이블 본문

> `items` 테이블 — 칸반 카드 / 파이프라인 업무.
> PW-008 (칸반) / PW-002 (파이프라인) 가 사용.

---

## DDL

```sql
CREATE TABLE items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 식별
  code            text NOT NULL,              -- 'PT-001', 'PT-002' (프로젝트 내 unique)
  title           text NOT NULL,
  description     text,

  -- 에픽 / 그룹
  epic            text,                       -- 'Auth', 'Payment', ...
  parent_item_id  uuid REFERENCES items(id),  -- 하위 작업인 경우

  -- 상태 (Stage별 컬럼 분기)
  status          text NOT NULL DEFAULT 'BACKLOG' CHECK (status IN (
    'BACKLOG', 'SPEC', 'DEV', 'HITL', 'REVIEW', 'DONE'
  )),

  -- 우선순위 / 크기
  priority        text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  story_points    integer,

  -- 담당
  assigned_user   uuid REFERENCES users(id),
  assigned_agent  text,                       -- 'be-developer', 'qa-verifier', ...
                                              -- NULL이면 수동 개발 (Stage 2 칸반 필터링 기준)

  -- 진행률
  progress_pct    integer NOT NULL DEFAULT 0
                  CHECK (progress_pct BETWEEN 0 AND 100),

  -- HITL 연계
  hitl_count      integer NOT NULL DEFAULT 0,  -- 관련 HITL 카드 수 (active)
  hitl_types      text[] DEFAULT ARRAY[]::text[],  -- ['business','technical',...]

  -- 비용 (Mode별 분기)
  tokens_used     integer NOT NULL DEFAULT 0,  -- Mode A
  cost_usd        numeric(10,4) NOT NULL DEFAULT 0,  -- Mode C
  resource_minutes integer NOT NULL DEFAULT 0, -- Mode B (CPU 분)

  -- 외부 연동
  jira_issue_id   text,                        -- 'PROJ-1234'
  github_pr_url   text,                        -- 완료 시

  -- 일정
  started_at      timestamptz,
  due_at          timestamptz,
  completed_at    timestamptz,

  -- 메타
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (project_id, code)
);

-- 인덱스
CREATE INDEX idx_items_project_status ON items(project_id, status, updated_at DESC);
CREATE INDEX idx_items_assigned_user ON items(assigned_user, status);
CREATE INDEX idx_items_assigned_agent ON items(assigned_agent, status);
CREATE INDEX idx_items_jira ON items(jira_issue_id);

-- RLS
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_org_isolation"
  ON items FOR ALL
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
```

---

## 필드 설명

### `status` (칸반 컬럼)

6컬럼 고정: `BACKLOG / SPEC / DEV / HITL / REVIEW / DONE`.

Stage별 분기:
- Stage 1: `BACKLOG / DEV / DONE` 3컬럼만 사용 (나머지 값은 저장 X)
- Stage 2: 6컬럼 + `assigned_agent` NOT NULL 인 아이템만 UI 표시 (G-062-01)
- Stage 3: 6컬럼 전체

### `assigned_agent`

NULL = 수동 개발 (사람이 전체 구현).
값 있음 = AI 에이전트가 담당.

Stage 2 칸반 필터링: `WHERE assigned_agent IS NOT NULL`.

### `hitl_count` / `hitl_types`

연관된 `hitl_cards` 테이블의 active 카드 수 / 타입 배열.
트리거로 자동 갱신 (아래).

### Mode별 비용 필드

3개 필드 동시 저장. UI에서 모드별로 하나만 표시 (G-082).

---

## 트리거

### HITL 카운트 자동 갱신

```sql
CREATE OR REPLACE FUNCTION update_item_hitl_count()
RETURNS trigger AS $$
BEGIN
  UPDATE items
  SET
    hitl_count = (
      SELECT count(*) FROM hitl_cards
      WHERE related_item_id = NEW.related_item_id
        AND status IN ('pending', 'assigned')
    ),
    hitl_types = (
      SELECT array_agg(DISTINCT type) FROM hitl_cards
      WHERE related_item_id = NEW.related_item_id
        AND status IN ('pending', 'assigned')
    ),
    updated_at = now()
  WHERE id = NEW.related_item_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hitl_cards_update_item
  AFTER INSERT OR UPDATE OR DELETE ON hitl_cards
  FOR EACH ROW
  EXECUTE FUNCTION update_item_hitl_count();
```

---

## 관계

- `items.project_id` → `projects.id`
- `items.assigned_user` → `users.id`
- `items.parent_item_id` → `items.id` (하위 작업)
- `hitl_cards.related_item_id` → `items.id` (역참조)
- `logs.related_item_id` → `items.id` (활동 로그 연결, optional)

---

## 참조

- 칸반 구현: `products/wiring/rules/kanban.md` (PW-008)
- 파이프라인 연동: `products/wiring/rules/pipeline_view.md`
- HITL 테이블: `products/wiring/schemas/tables/hitl_cards.md`
- 비용 표시 분기: `products/wiring/rules/cost_display.md`
