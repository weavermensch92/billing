# LucaPus / Schemas / ontology_nodes — 테이블 본문

> 3계층 온톨로지 (기술 / 도메인 / 패턴) 의 노드.
> **글로벌 테이블** (org_id 없음, 크로스 고객사 공유).

---

## DDL

```sql
CREATE TABLE ontology_nodes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 계층 구분
  ontology_layer   text NOT NULL CHECK (ontology_layer IN ('tech', 'domain', 'pattern')),

  -- 식별
  node_key         text NOT NULL,          -- 'rule-jwt', '포인트', 'pattern-auth-ecommerce', ...
  node_name        text NOT NULL,          -- 사람이 읽는 이름

  -- 공통 메타
  description      text,
  tags             text[] DEFAULT ARRAY[]::text[],

  -- 기술 온톨로지 전용
  spec_common_ref  text,                   -- 'D-025', 'D-091', ... (null이면 비-spec 규칙)
  category         text,                   -- 'auth', 'db', 'event', ...
  layer            text,                   -- "core.auth.jwt-basic"

  -- 도메인 온톨로지 전용
  domain           text,                   -- 'ecommerce', 'fintech', 'healthcare', ...
  extracted_from   text[],                 -- 기획서 페이지 / 소스 참조

  -- 패턴 온톨로지 전용
  tech_stack       text[],                 -- ['Spring Boot', 'PostgreSQL', 'Redis']
  usage_count      integer DEFAULT 0,      -- 네트워크 전체에서 몇 번 선택됨

  -- 메타
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (ontology_layer, node_key)
);

-- 인덱스
CREATE INDEX idx_ontology_nodes_layer ON ontology_nodes(ontology_layer, node_key);
CREATE INDEX idx_ontology_nodes_category ON ontology_nodes(ontology_layer, category);
CREATE INDEX idx_ontology_nodes_domain ON ontology_nodes(ontology_layer, domain);
CREATE INDEX idx_ontology_nodes_spec_ref ON ontology_nodes(spec_common_ref) WHERE spec_common_ref IS NOT NULL;

-- RLS: 글로벌 읽기, Gridge system 만 쓰기
ALTER TABLE ontology_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ontology_nodes_public_read"
  ON ontology_nodes FOR SELECT
  USING (true);  -- 모든 org 가 읽기 가능

CREATE POLICY "ontology_nodes_system_write"
  ON ontology_nodes FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'gridge_system');

CREATE POLICY "ontology_nodes_system_update"
  ON ontology_nodes FOR UPDATE
  USING ((auth.jwt() ->> 'role') = 'gridge_system');
```

---

## 필드 설명

### `ontology_layer`

3계층 중 하나:
- `tech`: 기술 온톨로지 (spec-common 기반)
- `domain`: 도메인 온톨로지 (R1~R3 Evidence Pack 기반)
- `pattern`: 패턴 온톨로지 (크로스 고객사 통계 기반)

### `node_key`

계층 내 unique. 예:
- tech: `rule-jwt`, `rule-bcrypt`
- domain: `포인트`, `쿠폰`, `주문`
- pattern: `pattern-auth-ecommerce-jwt-rtr`

### `usage_count` (패턴 전용)

전체 프로젝트 중 이 패턴 사용 프로젝트 수. 추천 시 네트워크 통계 ("340개 중 94%") 소스.

---

## 글로벌 테이블의 보안

### 조직 데이터 유출 금지

- `org_id` 컬럼 없음 = 특정 조직과 무관
- 노드 생성 시 조직별 규칙이 암묵적으로 노출되지 않도록 주의
- 예: 고객 A 의 "JWT 15분 만료" 결정 → 기술 온톨로지의 `rule-jwt` 의 통계에는 기여하되, 고객 A 정보는 익명화

### Mode B 고객 제외 (G-087-02)

Mode B 고객의 결정은 기본 통계 기여 X. opt-in 시에만:
- 고객 의식적 동의
- 조직명 / 프로젝트명 완전 제거

---

## 업데이트 주기

| 레이어 | 주기 |
|---|---|
| tech | 분기별 (수동 검증) |
| domain | 새 도메인 추가 시 |
| pattern | 주간 (자동 통계 배치) |

---

## 관계

- `ontology_edges.from_key` / `to_key` → `ontology_nodes.node_key` (layer 일치)
- `rule_timeline.spec_common_ref` → `ontology_nodes.spec_common_ref`

---

## 참조

- 3계층 온톨로지 규칙: `products/lucapus/rules/ontology.md` (PL-007)
- Mode B opt-in: `05_infra_mode.md § 7` (G-087)
- 엣지 테이블: `schemas/tables/ontology_edges.md`
- Wiring 규칙 그래프 UI: `products/wiring/rules/rule_graph.md` (PW-012)
