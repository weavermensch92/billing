# LucaPus / Schemas / spec_analyses — 테이블 본문

> R1~R7 기획서 분석 파이프라인 진행 상태 + Evidence Pack 저장.
> SSOT Master 가 작성.

---

## DDL

```sql
CREATE TABLE spec_analyses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 입력 문서
  document_name  text NOT NULL,              -- '쇼핑몰_리뉴얼_기획서_v3.2.pdf'
  document_type  text CHECK (document_type IN ('pdf','docx','md','notion','url')),
  document_storage_key text,                  -- S3 key (Mode A/C) / 고객 경로 (Mode B)
  page_count     integer,
  upload_at      timestamptz NOT NULL,
  uploaded_by    uuid REFERENCES users(id),

  -- R1~R7 진행 상태
  current_stage  text NOT NULL DEFAULT 'R1' CHECK (current_stage IN (
    'R1','R2','R3','R4','R5','R6','R7','completed','failed'
  )),
  
  stage_states   jsonb NOT NULL DEFAULT '{
    "R1": { "status": "pending" },
    "R2": { "status": "pending" },
    "R3": { "status": "pending" },
    "R4": { "status": "pending" },
    "R5": { "status": "pending" },
    "R6": { "status": "pending" },
    "R7": { "status": "pending" }
  }'::jsonb,

  -- R1~R3 Evidence Pack (도메인 온톨로지 소스)
  r1_sources        jsonb,                   -- 근거 수집 결과 (플랫폼별 scraping)
  r2_feature_tree   jsonb,                   -- Feature → Sub-feature 계층
  r3_comparison     jsonb,                   -- 3+ 플랫폼 비교 테이블
  
  -- R4~R7 결과
  r4_scenarios      jsonb,                   -- BDD 시나리오 + HITL 카드 참조
  r5_entities       jsonb,                   -- 엔티티 카드 + 관계도
  r6_rules          jsonb,                   -- MUST/SHOULD/MAY 분류
  r7_documents      jsonb,                   -- 생성 문서 목록 (6~8개)

  -- 생성된 HITL 카드 참조
  generated_hitl_cards uuid[] DEFAULT ARRAY[]::uuid[],

  -- 메타
  started_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz,
  duration_ms    integer,
  
  error_message  text                         -- failed 상태일 때
);

-- 인덱스
CREATE INDEX idx_spec_analyses_project ON spec_analyses(project_id, started_at DESC);
CREATE INDEX idx_spec_analyses_active ON spec_analyses(project_id)
  WHERE current_stage NOT IN ('completed', 'failed');

-- RLS
ALTER TABLE spec_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spec_analyses_org_isolation"
  ON spec_analyses FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "spec_analyses_system_write"
  ON spec_analyses FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') IN ('gridge_lucapus','gridge_system'));
```

---

## 필드 설명

### `current_stage`

R1~R7 순차 진행. 역순 진행 절대 금지 (G-025 정합성 7원칙):

```
R1 (근거 수집)
  ↓
R2 (관리 범위 식별)
  ↓
R3 (비교 분석)
  ↓
R4 (시나리오 BDD) ← HITL 생성 (🔶 비즈니스)
  ↓
R5 (엔티티 설계) ← HITL 생성 (🔷 기술)
  ↓
R6 (규칙 정리 MUST/SHOULD/MAY)
  ↓
R7 (문서 생성)
  ↓
completed
```

### `stage_states`

각 단계의 세부 진행:
```json
{
  "R1": { "status": "done", "duration_ms": 14200, "sources_count": 3 },
  "R2": { "status": "done", "feature_count": 6 },
  "R3": { "status": "done", "platforms": ["cafe24","sixshop","makeshop"] },
  "R4": { "status": "processing", "progress": 65, "hitl_generated": 2 },
  "R5": { "status": "pending" },
  "R6": { "status": "pending" },
  "R7": { "status": "pending" }
}
```

### R1~R3 Evidence Pack

도메인 온톨로지 (PL-007) 의 원재료:

```json
// r3_comparison 예시
{
  "feature": "포인트 시스템",
  "platforms": [
    { "name": "cafe24", "refund_policy": "복원", "expiry": "180일" },
    { "name": "sixshop", "refund_policy": "미복원", "expiry": "90일" },
    { "name": "makeshop", "refund_policy": "미복원", "expiry": "365일" }
  ],
  "gridge_recommendation": "미복원 + 90일 (중간값)"
}
```

### `generated_hitl_cards`

이 분석이 생성한 HITL 카드 uuid 배열. 추적 목적:
- R4 가 생성한 🔶 비즈니스 카드들
- R5 가 생성한 🔷 기술 카드들

---

## R1~R7 순서 보장 (G-025 정합성 2번)

UPDATE 시 역순 진행 차단:
```sql
CREATE FUNCTION enforce_r_stage_forward() RETURNS trigger AS $$
DECLARE
  old_stage text := OLD.current_stage;
  new_stage text := NEW.current_stage;
  stages text[] := ARRAY['R1','R2','R3','R4','R5','R6','R7','completed'];
  old_idx int := array_position(stages, old_stage);
  new_idx int := array_position(stages, new_stage);
BEGIN
  IF new_stage = 'failed' THEN RETURN NEW; END IF;
  IF new_idx < old_idx THEN
    RAISE EXCEPTION 'R-stage 역순 진행 금지 (% → %)', old_stage, new_stage;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_r_stage_forward
  BEFORE UPDATE ON spec_analyses
  FOR EACH ROW EXECUTE FUNCTION enforce_r_stage_forward();
```

---

## 조회 패턴

### 현재 활성 분석 (Wiring 기획서 분석 화면)

```sql
SELECT * FROM spec_analyses
WHERE project_id = $1
  AND current_stage NOT IN ('completed', 'failed')
ORDER BY started_at DESC
LIMIT 1;
```

### 완료 이력

```sql
SELECT id, document_name, current_stage, duration_ms, completed_at
FROM spec_analyses
WHERE project_id = $1 AND current_stage = 'completed'
ORDER BY completed_at DESC
LIMIT 20;
```

---

## Wiring UI 연동 (PW-009)

R1~R7 노드 시각화. 각 노드 status 는 `stage_states.R{n}.status` 참조:
- `pending` → 회색
- `processing` → 파랑 + 진행률
- `done` → 초록 + 결과 요약 클릭
- `failed` → 빨강 + 에러 표시

---

## 관계

- `spec_analyses.project_id` → `projects`
- `spec_analyses.uploaded_by` → `users`
- `spec_analyses.generated_hitl_cards[]` → `hitl_cards.id`

---

## 참조

- R1~R7 규칙: `02_architecture.md § 8`
- R-stage 순서 금지: `02_architecture.md § 5` (G-025 정합성 7원칙 2번)
- SSOT Master 역할: `products/lucapus/orchestrators/roles.md § PL-002-01`
- 기획서 분석 UI: `products/wiring/screens/spec_analysis.md` (PW-009)
- HITL 자동 생성: `products/lucapus/rules/spec_hitl.md` (D-051)
- 도메인 온톨로지 소스: `products/lucapus/rules/ontology.md § PL-007-02`
