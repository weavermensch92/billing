# LucaPus / Schemas / adapt_scores — 테이블 본문

> PL-008 적합화 점수 이력. 5차원 (범위/깊이/일관성/활용도/안정성) + 총점.

---

## DDL

```sql
CREATE TABLE adapt_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 총점 (가중합 결과)
  total           smallint NOT NULL CHECK (total BETWEEN 0 AND 100),

  -- 5차원 점수
  coverage        smallint NOT NULL CHECK (coverage BETWEEN 0 AND 100),
  depth           smallint NOT NULL CHECK (depth BETWEEN 0 AND 100),
  consistency    smallint NOT NULL CHECK (consistency BETWEEN 0 AND 100),
  usage          smallint NOT NULL CHECK (usage BETWEEN 0 AND 100),
  stability      smallint NOT NULL CHECK (stability BETWEEN 0 AND 100),

  -- 가중치 스냅샷 (조직 조정 가능, PL-008-07)
  weights         jsonb NOT NULL DEFAULT '{
    "coverage": 0.30,
    "depth": 0.20,
    "consistency": 0.20,
    "usage": 0.15,
    "stability": 0.15
  }'::jsonb,

  -- 계산 메타
  computed_by     text NOT NULL CHECK (computed_by IN (
    'realtime_hitl',       -- HITL 결정 직후
    'rule_change',         -- 규칙 추가/폐기
    'daily_batch',         -- 매일 00:00 배치
    'on_demand'            -- 사용자 요청
  )),
  input_stats     jsonb,                    -- 계산 입력값 (규칙 수 / 활용도 등)
  
  computed_at     timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_adapt_scores_project_time ON adapt_scores(project_id, computed_at DESC);
CREATE INDEX idx_adapt_scores_trend ON adapt_scores(project_id, computed_at)
  WHERE computed_by = 'daily_batch';

-- RLS
ALTER TABLE adapt_scores ENABLE ROW LEVEL SECURITY;

-- OA/L1 은 전 프로젝트, L2 는 담당 프로젝트, L3/L4 는 breakdown 접근 제한
CREATE POLICY "adapt_scores_read"
  ON adapt_scores FOR SELECT
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND CASE
      WHEN (auth.jwt() ->> 'level') IN ('OA','L1') THEN true
      WHEN (auth.jwt() ->> 'level') = 'L2' THEN project_id = ANY(my_projects())
      WHEN (auth.jwt() ->> 'level') IN ('L3','L4') THEN project_id = ANY(my_projects())
      ELSE false
    END
  );

CREATE POLICY "adapt_scores_system_write"
  ON adapt_scores FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'gridge_system');

-- UPDATE/DELETE 금지 (이력 보존)
CREATE RULE adapt_scores_no_update AS ON UPDATE TO adapt_scores DO INSTEAD NOTHING;
CREATE RULE adapt_scores_no_delete AS ON DELETE TO adapt_scores DO INSTEAD NOTHING;
```

---

## 필드 설명

### 5차원 계산 (PL-008-03)

- `coverage` (30%): 필요한 규칙 카테고리 중 결정된 비율
- `depth` (20%): 핵심 규칙에 구체 조건 명시된 비율
- `consistency` (20%): 조직 MUST 위반 없는 비율
- `usage` (15%): 최근 30일 HITL 결정 빈도
- `stability` (15%): 번복 / 재질문 비율 (낮을수록 좋음)

### `total` 계산

```typescript
total = coverage * weights.coverage
     + depth * weights.depth
     + consistency * weights.consistency
     + usage * weights.usage
     + stability * weights.stability;
```

가중치 스냅샷 저장 → 가중치 조정 시 과거 비교 가능.

### `input_stats` 예시

```json
{
  "required_categories": 12,
  "decided_categories": 10,
  "key_rules_total": 20,
  "key_rules_with_conditions": 15,
  "org_must_count": 4,
  "org_must_violations": 1,
  "hitl_resolved_30d": 18,
  "hitl_re_asked_ratio": 0.22,
  "hitl_overridden_ratio": 0.05
}
```

계산 검증 가능 + 디버깅.

---

## 보유 기간

- 최근 1년 유지
- 초과분 월간 요약으로 압축 (Wiring 트렌드 차트 용)

---

## MSP 업셀 신호 (PL-008-06)

주간 배치 시 신호 감지:
```sql
-- AI 도입 멈춤 감지
SELECT p.* FROM projects p
JOIN adapt_scores s ON s.project_id = p.id
WHERE s.computed_at = (SELECT MAX(computed_at) FROM adapt_scores WHERE project_id = p.id)
  AND s.total < 40
  AND s.usage < 30;
```

결과는 Gridge 내부 영업 대시보드에만 표시 (고객 직접 영업 멘트 X, G-089).

---

## 조회 패턴

### 현재 점수 (Wiring 적합화 탭 상단)

```sql
SELECT * FROM adapt_scores
WHERE project_id = $1
ORDER BY computed_at DESC
LIMIT 1;
```

### 30일 트렌드

```sql
SELECT computed_at, total
FROM adapt_scores
WHERE project_id = $1
  AND computed_by = 'daily_batch'
  AND computed_at > now() - interval '30 days'
ORDER BY computed_at;
```

---

## 참조

- 적합화 점수 규칙: `products/lucapus/rules/adapt_score.md` (PL-008)
- 가중치 조정: `products/lucapus/rules/adapt_score.md § PL-008-07`
- 위계별 노출: `products/lucapus/rules/adapt_score.md § PL-008-05`
- MSP 업셀: `products/aiops/rules/maturity.md` (PA-010) — 5차원 원리 연관
- 고객 데이터 소유 (영업 멘트 제한): `05_infra_mode.md § 9` (G-089)
