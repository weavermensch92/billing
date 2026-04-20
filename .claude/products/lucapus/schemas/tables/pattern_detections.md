# LucaPus / Schemas / pattern_detections — 테이블 본문

> PL-009-03 코드 패턴 감지 결과. 3회+ 반복 감지 시 🔶 코드 패턴 HITL 카드 트리거.

---

## DDL

```sql
CREATE TABLE pattern_detections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 패턴 식별
  pattern_type      text NOT NULL,            -- 'builder', 'facade', 'repository', 'transactional-event', ...
  pattern_signature text NOT NULL,            -- AST hash 또는 구조 fingerprint
  
  -- 감지 정보
  occurrences       integer NOT NULL DEFAULT 0 CHECK (occurrences >= 1),
  file_paths        text[] NOT NULL,          -- 감지된 파일 경로 (최대 10)
  code_sample       text,                     -- 대표 코드 (200자 이내, PII 감지 필수)
  
  -- 제안
  proposed_rule_text text,                    -- AI 초안 규칙 문구
  proposed_severity text CHECK (proposed_severity IN ('MUST','SHOULD','MAY')),
  
  -- 상태
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- 3회+ 감지, HITL 카드 생성됨
    'promoted',     -- 규칙으로 승격 (rule_timeline 에 추가)
    'modified',     -- 수정 후 승격
    'rejected',     -- L3 기각
    'deferred'      -- 보류
  )),

  hitl_card_id      uuid,                     -- FK to hitl_cards (있을 때)
  promoted_rule_id  text,                     -- rule_timeline.rule_id (승격 시)
  
  -- 메타
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  resolved_by       uuid REFERENCES users(id),

  UNIQUE (project_id, pattern_signature)
);

-- 인덱스
CREATE INDEX idx_pattern_project_status ON pattern_detections(project_id, status);
CREATE INDEX idx_pattern_pending ON pattern_detections(project_id, occurrences DESC)
  WHERE status = 'pending';

-- RLS
ALTER TABLE pattern_detections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pattern_detections_org_isolation"
  ON pattern_detections FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "pattern_detections_l3_resolve"
  ON pattern_detections FOR UPDATE
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'level') IN ('L3','L2','L1','OA'));
```

---

## 필드 설명

### `pattern_signature`

같은 패턴 중복 감지 방지용 hash. AST 구조 기반:

```typescript
function computeSignature(ast: ASTNode): string {
  const normalized = normalizeAST(ast);  // 변수명 제거, 구조만
  return sha256(JSON.stringify(normalized));
}
```

동일 signature 재감지 시 `occurrences++` / `file_paths` 추가.

### `code_sample`

대표 코드 조각 (200자 이내). **PII / 시크릿 감지 필수** (G-150):
- 해시 / 토큰 / API 키 포함 → 마스킹
- 고객 도메인 식별 가능한 내용 → 익명화

### `occurrences` 임계

- 1~2회: 감지만 (HITL 카드 생성 X)
- **3회+**: 🔶 코드 패턴 HITL 카드 자동 생성 (D-051, G-110)
- 10회+: 우선순위 `high` 자동 승격

### `status` 전이

```
초기 감지 (1회)
  ↓ (재감지 2회)
  ↓ (3회째 재감지)
pending (HITL 카드 생성)
  ↓
[사용자 결정]
  ├── promoted → rule_timeline 에 규칙 추가
  ├── modified → 수정된 문구로 규칙 추가
  ├── rejected → 이후 동일 패턴 재감지 무시
  └── deferred → 추후 재검토 가능
```

---

## 조회 패턴

### 대기 중인 패턴 (Wiring 적합화 탭)

```sql
SELECT pd.*, COALESCE(array_length(pd.file_paths, 1), 0) as file_count
FROM pattern_detections pd
WHERE pd.project_id = $1 AND pd.status = 'pending'
ORDER BY pd.occurrences DESC
LIMIT 20;
```

### 승격 이력

```sql
SELECT pd.pattern_type, pd.occurrences, pd.promoted_rule_id, pd.resolved_at
FROM pattern_detections pd
WHERE pd.project_id = $1 AND pd.status = 'promoted'
ORDER BY pd.resolved_at DESC;
```

---

## 예시 데이터 (Wiring 연출 기준)

```json
{
  "pattern_type": "builder",
  "occurrences": 4,
  "file_paths": [
    "src/domain/point/User.java",
    "src/domain/order/Order.java",
    "src/domain/product/Product.java",
    "src/domain/coupon/Coupon.java"
  ],
  "proposed_rule_text": "모든 JPA 엔티티에 @Builder 적용 (MUST)",
  "proposed_severity": "MUST",
  "status": "pending"
}
```

→ 이 row 가 Wiring 적합화 탭의 `adapt-007` 카드를 생성.

---

## 관계

- `pattern_detections.hitl_card_id` → `hitl_cards.id`
- `pattern_detections.promoted_rule_id` → `rule_timeline.rule_id`
- `codebase_snapshots.detected_patterns` 요약 ← 이 테이블

---

## 참조

- 코드베이스 감지: `products/lucapus/rules/codebase.md § PL-009-03`
- 코드 패턴 HITL: `06_hitl.md § 6` (G-110)
- HITL 카드 생성: `products/lucapus/rules/spec_hitl.md` (D-051)
- 규칙 타임라인: `products/wiring/schemas/tables/rule_timeline.md`
- G-150 시크릿 감지: `08_security.md § 9`
