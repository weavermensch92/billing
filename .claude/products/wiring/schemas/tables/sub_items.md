# Wiring / Schemas / sub_items — 테이블 본문

> 칸반 아이템의 하위 작업. B1~B6 레이어 (SSOT / Spec / Code / Test / Review / Deploy).

---

## DDL

```sql
CREATE TABLE sub_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- B1~B6 레이어 (순차 실행)
  layer           TEXT NOT NULL CHECK (layer IN ('B1','B2','B3','B4','B5','B6')),
  /* 
     B1: SSOT 확정 (ssot-master)
     B2: 스펙 작성 (scrum-master)  
     B3: 코드 생성 (be-developer / fe-developer)
     B4: 테스트 작성 + 실행 (qa-verifier)
     B5: 코드 리뷰 (tech-leader)
     B6: 문서 + 배포 (doc-writer)
  */
  
  -- 상태
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','in_progress','blocked_hitl','completed','failed','skipped')),
  
  -- 담당 에이전트
  assigned_agent_id UUID REFERENCES agents(id),
  agent_session_id  UUID REFERENCES agent_sessions(id),
  
  -- 실행
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  
  -- HITL
  requires_hitl   BOOLEAN DEFAULT TRUE,
  hitl_card_id    UUID REFERENCES hitl_cards(id),
  
  -- 결과
  output_summary  TEXT,
  error_message   TEXT,
  retry_count     INT DEFAULT 0,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (item_id, layer)
);

CREATE INDEX idx_sub_items_item ON sub_items(item_id, layer);
CREATE INDEX idx_sub_items_status ON sub_items(status, created_at)
  WHERE status IN ('pending','in_progress','blocked_hitl');
```

## B1~B6 실행 순서

```
[Item created]
     ↓
B1: SSOT 확정 → HITL (SE+) → 승인
     ↓
B2: 스펙 작성 (자동) 
     ↓
B3: 코드 생성 (자동) → HITL (TL) → 승인
     ↓
B4: 테스트 실행 (자동) → 실패 시 B3 재시도
     ↓
B5: 코드 리뷰 → HITL (TL) → 승인
     ↓
B6: 문서 + PR → HITL (PM+) → 승인 → 배포
     ↓
[Item completed]
```

## HITL 레벨 매핑

| Layer | 기본 HITL | 비고 |
|---|---|---|
| B1 | SE (L2+) | SSOT 정확성 검증 |
| B2 | (자동) | B1 승인 시 자동 진행 |
| B3 | TL (L3+) | 코드 변경 영향 검토 |
| B4 | (자동) | 테스트는 객관적 |
| B5 | TL (L3+) | 최종 리뷰 |
| B6 | PM (L4+) | 배포 결정 |

## 재시도 로직

```sql
-- B4 테스트 실패 시 B3 재시도
UPDATE sub_items
SET retry_count = retry_count + 1,
    status = 'pending',
    assigned_agent_id = NULL,
    agent_session_id = NULL
WHERE item_id = $1 AND layer = 'B3'
  AND EXISTS (
    SELECT 1 FROM sub_items
    WHERE item_id = $1 AND layer = 'B4' AND status = 'failed'
  );
```

retry_count ≥ 3 시 HITL 강제 에스컬레이션.

## 참조

- `items`: `tables/items.md`
- `agents`: `tables/agents.md`
- `agent_sessions`: `tables/agent_sessions.md`
- `hitl_cards`: `tables/hitl_cards.md`
- HITL 규칙: `06_hitl.md`
