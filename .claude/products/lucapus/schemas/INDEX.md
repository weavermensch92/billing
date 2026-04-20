# LucaPus / Schemas — INDEX

> LucaPus 엔진 관련 DB 테이블 카탈로그.
> F/S 체인의 탐색 단계(§ 2.2)가 참조.
> Wiring / AiOPS 의 schemas/INDEX.md 와 함께 전체 스키마 공간 형성.

---

## 전수 테이블 목록

### 온톨로지 (PL-007)

| 테이블 | 용도 | 본문 | 상태 |
|---|---|---|---|
| `ontology_nodes` | 3계층 온톨로지 노드 (tech/domain/pattern) | `tables/ontology_nodes.md` | P2 |
| `ontology_edges` | 노드 간 관계 (requires/depends-on/co-selected) | `tables/ontology_edges.md` | P2 |
| `org_ontology_snapshots` | 고객별 온톨로지 스냅샷 (시점 고정) | `tables/org_ontology_snapshots.md` | P3 |

### 코드베이스 (PL-009)

| 테이블 | 용도 | 본문 | 상태 |
|---|---|---|---|
| `codebase_snapshots` | 기술 스택 / 패턴 / 드리프트 감지 결과 | `tables/codebase_snapshots.md` | P2 |
| `pattern_detections` | 반복 패턴 감지 (3회+) | `tables/pattern_detections.md` | P2 |

### 적합화 점수 (PL-008)

| 테이블 | 용도 | 본문 | 상태 |
|---|---|---|---|
| `adapt_scores` | 5차원 점수 히스토리 | `tables/adapt_scores.md` | P2 |

### Gate (PL-005)

| 테이블 | 용도 | 본문 | 상태 |
|---|---|---|---|
| `gate_results` | 4-Tier Gate 실행 결과 | `tables/gate_results.md` | P1 ★ |

### 하네스 배정 (PL-004)

| 테이블 | 용도 | 본문 | 상태 |
|---|---|---|---|
| `harness_assignments` | 에이전트별 모델 배정 이력 | `tables/harness_assignments.md` | P1 |
| `harness_redesign_requests` | 재설계 요청 이력 (L3) | `tables/harness_redesign_requests.md` | P2 |

### 스펙 분석 (R1~R7)

| 테이블 | 용도 | 본문 | 상태 |
|---|---|---|---|
| `spec_analyses` | R1~R7 진행 상태 / Evidence Pack | `tables/spec_analyses.md` | P2 |
| `spec_entities` | R5 엔티티 추출 결과 | `tables/spec_entities.md` | P2 |

---

## ★ 핵심 테이블 인라인 DDL

세부 본문 파일 없이 이 요약만으로 탐색 가능하도록.

### gate_results (PL-005)

전체 DDL 은 `products/lucapus/rules/gate.md § PL-005-07` 참조.

### harness_assignments (PL-004)

```sql
CREATE TABLE harness_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES orgs(id),
  project_id     uuid NOT NULL REFERENCES projects(id),

  agent_id       text NOT NULL,
  model_id       text NOT NULL,
  mode           text NOT NULL CHECK (mode IN ('A','B','C')),

  assignment_reason text NOT NULL,     -- PL-004-02 이유 카테고리
  alternatives_considered text[] DEFAULT ARRAY[]::text[],

  assigned_by    text NOT NULL,        -- 'harness' | 'l3_request' | 'auto_optimize'
  assigned_at    timestamptz NOT NULL DEFAULT now(),

  retired_at     timestamptz,          -- 다른 배정으로 교체된 시점

  -- 재설계 요청 연결
  redesign_request_id uuid REFERENCES harness_redesign_requests(id)
);

CREATE INDEX idx_harness_current ON harness_assignments(project_id, agent_id)
  WHERE retired_at IS NULL;
```

### ontology_nodes / ontology_edges (PL-007)

전체 DDL 은 `products/lucapus/rules/ontology.md § PL-007-06` 참조.

### codebase_snapshots (PL-009)

전체 DDL 은 `products/lucapus/rules/codebase.md § PL-009-07` 참조.

### adapt_scores (PL-008)

전체 DDL 은 `products/lucapus/rules/adapt_score.md § PL-008-04` 참조.

---

## 테이블 간 관계

```
orgs ──┬── projects ──┬── items (Wiring)
       │              ├── hitl_cards (Wiring)
       │              ├── rule_timeline (Wiring)
       │              ├── gate_results (LucaPus)
       │              ├── harness_assignments (LucaPus)
       │              ├── codebase_snapshots (LucaPus)
       │              ├── adapt_scores (LucaPus)
       │              └── spec_analyses (LucaPus)
       │
       └── ontology_nodes (글로벌, org_id 없음)
           ontology_edges (글로벌, org_id 없음)
```

### 글로벌 vs 조직 스코프

- **글로벌** (org_id 없음): `ontology_nodes`, `ontology_edges`
  - Gridge 네트워크 전체 통계
  - 모든 고객이 참조 (Mode B 는 로컬 복사본)
- **조직 스코프** (org_id 필수): 나머지 전부
  - RLS 적용 (G-144)
  - 절대 크로스 고객사 노출 X

---

## 공통 RLS 원칙

- **SELECT**: `org_id = session.org_id` + 역할별 스코프
- **INSERT**: Orchestrator (system role) 또는 명시 권한
- **UPDATE**: `gate_results` / `harness_assignments` 는 immutable (삭제도 불가)
- **DELETE**: 불가 (G-141 감사 목적 유지)

### 글로벌 테이블 예외

`ontology_nodes` / `ontology_edges` 는 Gridge 내부 시스템만 쓰기 가능:
```sql
-- 내부 service role 만 write
CREATE POLICY "ontology_system_write"
  ON ontology_nodes FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'gridge_system');
```

---

## 스키마 마이그레이션

- Supabase 마이그레이션: `supabase/migrations/` (Wiring / AiOPS 공용)
- LucaPus 엔진은 자체 migration runner 보유 가능
- 버전 태깅: `lucapus-{YYYY-MM-DD}-{slug}.sql`

### backward compatibility

- 컬럼 추가: `NOT NULL` 금지 (기존 행 영향)
- 컬럼 삭제: 최소 1버전 Deprecation 후 삭제
- 인덱스 추가: `CONCURRENTLY` 사용 (서비스 중단 X)

---

## 참조

- Wiring schemas INDEX: `products/wiring/schemas/INDEX.md`
- AiOPS schemas INDEX: `products/aiops/schemas/INDEX.md`
- Gate 규칙: `products/lucapus/rules/gate.md` (PL-005)
- 온톨로지 규칙: `products/lucapus/rules/ontology.md` (PL-007)
- 하네스 규칙: `products/lucapus/orchestrators/harness.md` (PL-004)
- 코드베이스 규칙: `products/lucapus/rules/codebase.md` (PL-009)
- 점수 규칙: `products/lucapus/rules/adapt_score.md` (PL-008)
- RLS 원칙: `08_security.md § 5` (G-144)
- 감사 immutable: `08_security.md § 2` (G-141)
