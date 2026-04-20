# Wiring / Schemas / hitl_cards — 테이블 본문

> `hitl_cards` 테이블 — 적합화 탭의 "결정 필요" 통합 리스트.
> PW-006 / PW-007 이 사용.

---

## DDL

```sql
CREATE TABLE hitl_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- HITL 노드 타입 (06_hitl § 2)
  type            text NOT NULL CHECK (type IN (
    'business',         -- 🔶 비즈니스 결정 (PM)
    'technical',        -- 🔷 기술 결정 (L3)
    'code_pattern',     -- 🔶 코드 패턴 승격 (L3)
    'ontology_recommend' -- 🔗 온톨로지 추천 (L3)
  )),

  -- 내용
  title           text NOT NULL,
  context         text NOT NULL,                 -- 배경 설명
  rule_ref        text,                          -- "기획서 p.42: 환불 시 포인트 복원 여부 (MUST)"

  -- 옵션들 (JSON 배열)
  options         jsonb NOT NULL,
  /* options 예시:
     [
       { "id": "restore", "label": "복원한다" },
       { "id": "no_restore", "label": "복원 안 한다" },
       { "id": "conditional", "label": "조건부 (직접 입력)" }
     ]
  */

  -- AI 추천 (technical / ontology_recommend 전용)
  ai_recommendation   text,                      -- 'A' or option_id
  ai_confidence       smallint CHECK (ai_confidence BETWEEN 0 AND 100),

  -- 온톨로지 추천 전용
  network_stat_pct    smallint,                  -- "92% 선택"
  network_stat_source text,                      -- "그릿지 네트워크 340개 프로젝트"
  related_rule_ids    text[] DEFAULT ARRAY[]::text[],

  -- 코드 패턴 전용
  pattern_occurrences integer,                   -- 몇 번 반복 감지됐나
  pattern_diff        text,                      -- AI 규칙 초안

  -- 라우팅
  assignee_level      text CHECK (assignee_level IN ('L2','L3','L4')),
  assignee_user       uuid REFERENCES users(id),

  -- 우선순위
  priority            text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),

  -- 상태
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',    -- 대기
    'assigned',   -- 특정 사용자에게 할당
    'resolved',   -- 결정 완료
    'rejected',   -- 기각 (코드 패턴만)
    'deferred'    -- 보류
  )),

  -- 결정 결과 (resolved 시)
  resolved_option_id  text,
  resolved_value      jsonb,                     -- 조건부일 경우 사용자 입력
  resolved_by         uuid REFERENCES users(id),
  resolved_at         timestamptz,

  -- 정합성 추적 (06_hitl § 8 G-109)
  aligned_with_ai     boolean,                   -- 기술 결정만 의미 있음
  resolution_duration_sec integer,              -- 결정까지 걸린 시간

  -- 외부 연동
  jira_comment_id     text,                      -- Slack/Jira에 전송한 메시지 ID
  slack_message_ts    text,

  -- 연관
  related_item_id     uuid REFERENCES items(id), -- 관련 칸반 아이템
  related_step_id     text,                       -- R4 / R5 (기획서 분석 단계)

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_hitl_project_status ON hitl_cards(project_id, status, priority, created_at DESC);
CREATE INDEX idx_hitl_assignee ON hitl_cards(assignee_user, status);
CREATE INDEX idx_hitl_type ON hitl_cards(project_id, type, status);
CREATE INDEX idx_hitl_related_item ON hitl_cards(related_item_id);

-- RLS
ALTER TABLE hitl_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hitl_cards_org_isolation"
  ON hitl_cards FOR ALL
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
```

---

## 필드 설명

### `type`

06_hitl.md § 2 의 4종 노드와 1:1 매핑:
- `business` → 🔶 비즈니스 결정 → L2 라우팅 (G-104)
- `technical` → 🔷 기술 결정 → L3 라우팅 (G-103)
- `code_pattern` → 🔶 코드 패턴 → L3 라우팅
- `ontology_recommend` → 🔗 온톨로지 추천 → L3 라우팅 (점선 표시)

### `options`

JSON 배열. 각 옵션은 `{ id, label }`.
"조건부 (직접 입력)" 옵션은 선택 시 `resolved_value` 에 사용자 입력 JSON 저장.

### `ai_recommendation`

AI가 제안하는 답변 (option_id 또는 자유 텍스트).
기술 결정 / 온톨로지 추천에만 의미. 비즈니스는 AI 추천 안 함.

### `network_stat_pct` (온톨로지 추천 전용)

"유사 프로젝트 340개 중 92%가 선택" 표시용.
Mode B 고객의 규칙은 이 통계에 포함 안 됨 (G-087-02).

### `pattern_occurrences` (코드 패턴 전용)

같은 패턴이 몇 번 반복 감지됐는지. 3+ 일 때만 카드 생성 (G-110).

### `aligned_with_ai` (감사 필드, G-109)

기술 결정에서 사용자 선택이 AI 추천과 일치하는가.
`true`: AI 신뢰도 높음, 유지 고려
`false`: AI가 틀렸거나 사용자가 다른 판단 — 학습 데이터

---

## 상태 전이

```
pending
  ├──> assigned (특정 사용자 배정)
  │      └──> resolved (사용자 결정 확정)
  │             └──> 코드에 반영 + 규칙 타임라인 추가
  ├──> rejected (코드 패턴만, L3가 기각)
  └──> deferred (보류, 24h 후 재평가)
```

### 전이 제약

- `pending` → `resolved` 직접 OK (간단 결정)
- `resolved` → `pending` **불가** (되돌리기 금지, G-042 정합)
- `rejected` 후 재개 불가 (새 카드로 생성)

---

## 트리거

### resolved 시 규칙 타임라인 자동 추가

```sql
CREATE OR REPLACE FUNCTION create_rule_on_resolve()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    INSERT INTO rule_timeline (
      org_id, project_id, card_id, option_id,
      resolved_by, resolved_at
    ) VALUES (
      NEW.org_id, NEW.project_id, NEW.id, NEW.resolved_option_id,
      NEW.resolved_by, NEW.resolved_at
    );

    -- 관련 아이템 hitl_count 감소는 items 테이블 트리거로 처리
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 참조

- HITL 4종 노드: `06_hitl.md § 2` (G-102)
- 위계 라우팅: `06_hitl.md § 3` (G-103, G-104)
- 온톨로지 추천 금지: `06_hitl.md § 4` (G-105)
- 코드 패턴 승격: `06_hitl.md § 6` (G-110)
- 감사 필드: `06_hitl.md § 8` (G-109)
- 적합화 탭 UI: `products/wiring/rules/adapt_tab.md`
- items 테이블: `products/wiring/schemas/tables/items.md`
