# LucaPus / Schemas / ontology_edges — 테이블 본문

> 3계층 온톨로지의 노드 간 관계 (엣지).
> **글로벌 테이블** (크로스 고객사 공유).

---

## DDL

```sql
CREATE TABLE ontology_edges (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_layer   text NOT NULL CHECK (ontology_layer IN ('tech', 'domain', 'pattern')),

  -- 방향
  from_key         text NOT NULL,
  to_key           text NOT NULL,

  -- 관계 타입
  edge_type        text NOT NULL CHECK (edge_type IN (
    -- tech 온톨로지
    'requires',       -- A requires B
    'depends-on',     -- A depends on B (간접)
    'triggers',       -- A 확정 시 B 자동 추천
    'serves',         -- 인프라 규칙이 기능 규칙 지원
    'conflicts',      -- A 와 B 동시 불가

    -- domain 온톨로지
    'uses',
    'affects',
    'mutually-exclusive',

    -- pattern 온톨로지
    'co-selected'     -- 이 기술+도메인에서 함께 선택됨
  )),

  -- 메타
  metadata         jsonb,
  /* 예시:
     tech: { strength: 0.7 }
     pattern: { selection_ratio: 0.94, sample_size: 340 }
     domain: { note: "비즈니스 개념 간 관계" }
  */

  -- 품질
  confidence       text CHECK (confidence IN ('definite','probable')),
  user_feedback    jsonb DEFAULT '{"accepted": 0, "rejected": 0}'::jsonb,

  -- 업데이트
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (ontology_layer, from_key, to_key, edge_type)
);

-- 인덱스
CREATE INDEX idx_ontology_edges_from ON ontology_edges(ontology_layer, from_key, edge_type);
CREATE INDEX idx_ontology_edges_to ON ontology_edges(ontology_layer, to_key, edge_type);
CREATE INDEX idx_ontology_edges_type ON ontology_edges(ontology_layer, edge_type);

-- RLS (nodes 와 동일)
ALTER TABLE ontology_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ontology_edges_public_read" ON ontology_edges FOR SELECT USING (true);
CREATE POLICY "ontology_edges_system_write"
  ON ontology_edges FOR ALL
  USING ((auth.jwt() ->> 'role') = 'gridge_system');
```

---

## 필드 설명

### `edge_type` 카테고리

**tech 온톨로지 (5종)**:
- `requires` — A 가 작동하려면 B 필요 (예: `rule-rtr requires rule-jwt`)
- `depends-on` — A 가 B 에 간접 의존
- `triggers` — A 확정 시 B 자동 추천 (연쇄 추천)
- `serves` — 인프라 규칙이 기능 규칙 지원 (예: `rule-redis serves rule-jwt`)
- `conflicts` — A 와 B 동시 사용 불가

**domain 온톨로지 (3종)**:
- `uses` — 개념 A 가 B 를 사용
- `affects` — 개념 A 가 B 에 영향
- `mutually-exclusive` — 상호 배타

**pattern 온톨로지 (1종)**:
- `co-selected` — 이 기술+도메인에서 함께 선택된 조합 (네트워크 통계)

### `metadata`

관계 타입별 세부 정보:

```json
// tech: strength
{ "strength": 0.7 }

// pattern: 네트워크 통계
{
  "selection_ratio": 0.94,
  "sample_size": 340,
  "domain": "ecommerce",
  "tech_stack": ["Spring Boot", "PostgreSQL"]
}

// domain: 설명
{ "note": "쿠폰과 포인트는 중복 사용 규칙 필요" }
```

### `confidence`

- `definite`: 명시적 관계 (수동 검증됨)
- `probable`: 통계 기반 추정

거부율 > 50% 시 `probable` 강등.

### `user_feedback`

추천 수락/거부 집계:
```json
{ "accepted": 142, "rejected": 38 }
```

Wiring 적합화 탭 온톨로지 카드 응답 반영.

---

## 조회 패턴

### 특정 규칙 확정 → 연쇄 추천

```sql
-- rule-jwt 확정 시 triggers 엣지로 연결된 규칙 추천
SELECT n.node_key, n.node_name, e.metadata
FROM ontology_edges e
JOIN ontology_nodes n ON n.node_key = e.to_key AND n.ontology_layer = 'tech'
WHERE e.ontology_layer = 'tech'
  AND e.from_key = 'rule-jwt'
  AND e.edge_type = 'triggers';
```

### 네트워크 통계 조회

```sql
-- Spring Boot + 이커머스 조합에서 자주 함께 선택되는 규칙
SELECT to_key, metadata->>'selection_ratio' as ratio
FROM ontology_edges
WHERE ontology_layer = 'pattern'
  AND from_key = 'rule-jwt'
  AND edge_type = 'co-selected'
  AND (metadata->>'sample_size')::int >= 20
ORDER BY (metadata->>'selection_ratio')::numeric DESC;
```

---

## 품질 관리 (PL-007-09)

### 엣지 품질 평가

```sql
-- 거부율 높은 엣지 → confidence 강등
UPDATE ontology_edges
SET confidence = 'probable'
WHERE (user_feedback->>'rejected')::int > (user_feedback->>'accepted')::int
  AND confidence = 'definite';
```

### sample_size 임계

Pattern 엣지는 `sample_size >= 20` 일 때만 추천에 사용. 20 미만은 표시 X.

---

## 관계

- `ontology_edges.from_key` / `to_key` → `ontology_nodes.node_key`
- `edges` 는 `nodes` 의 `ontology_layer` 와 일치해야 함

---

## 참조

- 3계층 온톨로지: `products/lucapus/rules/ontology.md` (PL-007)
- 품질 관리: `products/lucapus/rules/ontology.md § PL-007-09`
- Wiring 규칙 그래프: `products/wiring/rules/rule_graph.md` (PW-012)
- 온톨로지 자동 적용 금지: `06_hitl.md § 4` (G-105)
