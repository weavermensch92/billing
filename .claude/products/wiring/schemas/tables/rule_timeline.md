# Wiring / Schemas / rule_timeline — 테이블 본문

> `rule_timeline` 테이블 — 적합화 확정 규칙 이력.
> 적합화 탭의 "확정 규칙 타임라인" 섹션 데이터.
> 규칙 그래프의 소스.

---

## DDL

```sql
CREATE TABLE rule_timeline (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 규칙 식별
  rule_id         text NOT NULL,                  -- 'rule-jwt', 'rule-facade', ...
  rule_name       text NOT NULL,                  -- "JWT 인증 필수"

  -- 분류
  category        text NOT NULL,                  -- 'auth', 'db', 'event', ...
  layer           text,                           -- "core.auth.jwt-basic"
  severity        text NOT NULL CHECK (severity IN ('MUST','SHOULD','MAY')),

  -- 출처 (상속)
  scope           text NOT NULL CHECK (scope IN ('org','team','project')),
  source          text NOT NULL CHECK (source IN ('조직','팀','프로젝트')),
  inherited_from  text,                           -- 조직 규칙이면 'ORG', 팀 규칙이면 팀명

  -- 신뢰도
  confidence      text NOT NULL DEFAULT 'definite'
                  CHECK (confidence IN ('definite','probable')),

  -- 출처 카드 (hitl_cards → rule_timeline 연결)
  source_card_id  uuid REFERENCES hitl_cards(id),
  source_type     text CHECK (source_type IN (
    'hitl_resolved',       -- HITL 카드 결정 결과
    'manual_add',          -- OA/L3 수동 추가
    'imported',            -- 템플릿 / 네트워크 추천 일괄 수락
    'inherited'            -- 조직 규칙 상속
  )),

  -- 결정자
  resolved_by     uuid REFERENCES users(id),
  resolved_level  text CHECK (resolved_level IN ('OA','L1','L2','L3','L4')),

  -- 규칙 내용
  rule_body       text,                           -- 규칙 본문 요약
  rule_details    jsonb,                          -- 상세 (tradeoff, 관련 API 등)

  -- 관계 (규칙 그래프)
  requires        text[] DEFAULT ARRAY[]::text[], -- ['rule-x', 'rule-y']
  depends_on      text[] DEFAULT ARRAY[]::text[],
  triggers        text[] DEFAULT ARRAY[]::text[],
  serves          text[] DEFAULT ARRAY[]::text[],

  -- 외부 연동
  spec_common_ref text,                           -- 'D-025' (spec-common.yaml 해당 항목)

  -- 폐기 (soft delete)
  retired         boolean NOT NULL DEFAULT false,
  retired_by      uuid REFERENCES users(id),
  retired_at      timestamptz,
  retired_reason  text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (project_id, rule_id)
);

-- 인덱스
CREATE INDEX idx_rule_timeline_project ON rule_timeline(project_id, created_at DESC)
  WHERE retired = false;
CREATE INDEX idx_rule_timeline_org ON rule_timeline(org_id, scope, severity);
CREATE INDEX idx_rule_timeline_category ON rule_timeline(project_id, category);
CREATE INDEX idx_rule_timeline_resolved_by ON rule_timeline(resolved_by, created_at DESC);

-- RLS
ALTER TABLE rule_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rule_timeline_org_isolation"
  ON rule_timeline FOR ALL
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- 조직 MUST는 수정 제약 (G-042)
CREATE POLICY "rule_timeline_org_must_immutable"
  ON rule_timeline FOR UPDATE
  USING (
    CASE WHEN scope = 'org' AND severity = 'MUST' THEN
      (auth.jwt() ->> 'level') = 'OA'
    ELSE true END
  );
```

---

## 필드 설명

### `rule_id`

전역 unique 아님 (프로젝트 내 unique). 예:
- 프로젝트 A: `rule-jwt` (MUST, project scope)
- 프로젝트 B: `rule-jwt` (상속, org scope)

### `scope` vs `source`

- `scope`: 규칙의 영향 범위 (org/team/project)
- `source`: 실제 등록 위치 (한국어 표시용)

예: 조직 규칙이 프로젝트에 상속된 경우:
- `scope: 'org'`
- `source: '조직'`
- `inherited_from: 'ORG'`

### 관계 배열 (requires / depends_on / triggers / serves)

규칙 관계 그래프의 엣지 생성 소스.
값은 다른 `rule_timeline.rule_id` 참조.

```json
{
  "rule_id": "rule-rtr",
  "requires": ["rule-jwt"],
  "depends_on": ["rule-redis-cache"]
}
```

### `spec_common_ref`

LucaPus 의 spec-common.yaml 의 어떤 항목에서 파생됐는지.
예: `D-025` → 동시성 제어 결정.

### `retired` (폐기)

실제 삭제 대신 soft delete:
- 감사 로그 보존
- 과거 결정 맥락 유지
- 조직 MUST 폐기는 OA 만 (G-053)

---

## 상태 전이

```
[생성]
   ↓
[active] (retired = false)
   ↓
[retired] (retired = true, retired_reason 필수)
   ↓
[삭제 불가] (감사 목적)
```

---

## 트리거

### updated_at 자동 갱신

```sql
CREATE TRIGGER rule_timeline_updated_at
  BEFORE UPDATE ON rule_timeline
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
```

### 조직 규칙 추가 시 하위 프로젝트 자동 상속

```sql
CREATE OR REPLACE FUNCTION propagate_org_rule()
RETURNS trigger AS $$
BEGIN
  IF NEW.scope = 'org' AND NEW.severity = 'MUST' THEN
    INSERT INTO rule_timeline (
      org_id, project_id, rule_id, rule_name, category, layer,
      severity, scope, source, inherited_from, source_type,
      resolved_by, resolved_level
    )
    SELECT
      NEW.org_id, p.id, NEW.rule_id, NEW.rule_name, NEW.category, NEW.layer,
      NEW.severity, 'org', '조직', 'ORG', 'inherited',
      NEW.resolved_by, NEW.resolved_level
    FROM projects p
    WHERE p.org_id = NEW.org_id
    ON CONFLICT (project_id, rule_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 관계

- `rule_timeline.source_card_id` → `hitl_cards.id`
- `rule_timeline.resolved_by` → `users.id`
- 규칙 그래프 노드: `requires/depends_on/triggers/serves` 배열이 엣지

---

## 참조

- 규칙 상속: `03_hierarchy.md § 2` (G-042)
- 조직 MUST 권한: `03_hierarchy.md § 10` (G-053)
- 규칙 관계 그래프: `products/wiring/rules/rule_graph.md` (PW-015)
- HITL → 규칙 연결: `products/wiring/schemas/tables/hitl_cards.md`
- 적합화 탭 타임라인: `products/wiring/rules/adapt_tab.md`
- spec-common 카테고리: `products/lucapus/CLAUDE.md § 2`
