# Wiring / Schemas / projects — 테이블 본문

> 프로젝트. 개발 작업 컨텍스트 단위. 여러 팀이 참여할 수 있음.

---

## DDL

```sql
CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  
  -- 상태
  status          TEXT NOT NULL DEFAULT 'planning'
                  CHECK (status IN ('planning','active','paused','completed','cancelled')),
  
  -- 기간
  started_at      TIMESTAMPTZ,
  target_date     DATE,
  completed_at    TIMESTAMPTZ,
  
  -- Stage (PW-002~004 파이프라인)
  current_stage   TEXT DEFAULT 'Stage 0'
                  CHECK (current_stage IN ('Stage 0','Stage 1','Stage 2','Stage 3','Stage 4')),
  
  -- LucaPus 연동 (I-002)
  lucapus_project_id UUID,
  
  -- 관리자
  owner_user_id   UUID REFERENCES users(id),
  
  -- 외부 연동
  jira_project_key TEXT,
  github_repo      TEXT,      -- 'org/repo'
  
  -- 설정
  hitl_override   JSONB,       -- 프로젝트별 HITL 기본값 override
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (org_id, name)
);

CREATE INDEX idx_projects_org ON projects(org_id, status);
CREATE INDEX idx_projects_owner ON projects(owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX idx_projects_stage ON projects(current_stage, status) WHERE status = 'active';
```

## Stage 4단계 (PW-002~004)

```
Stage 0: 기획 (스펙 초안)
   ↓ PW-002 Pipeline View 첫 HITL 카드
Stage 1: 스펙 확정 (SSOT master)
   ↓ 스펙 → 태스크 분해
Stage 2: 구현 (칸반 활성)
   ↓ PW-003 파이프라인 실행
Stage 3: QA + 릴리스 준비
   ↓ 자동 검증 완료
Stage 4: 운영 (유지 보수)
```

## LucaPus 연동 (I-002)

`lucapus_project_id` 가 있으면 Wiring 프로젝트 = LucaPus 엔진 프로젝트 매핑.
- Wiring HITL 카드 승인 → LucaPus 작업 자동 큐에 삽입
- LucaPus 작업 완료 → Wiring 알림

## RLS

```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- 프로젝트 관련자만
CREATE POLICY "projects_via_team_membership"
  ON projects FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM users WHERE auth_user_id = auth.uid())
  );
```

## 주요 쿼리

```sql
-- 활성 프로젝트 현황
SELECT p.*, 
  (SELECT COUNT(*) FROM items i WHERE i.project_id = p.id AND i.status = 'in_progress') AS active_items,
  (SELECT COUNT(*) FROM hitl_cards h 
    WHERE h.project_id = p.id AND h.status = 'pending') AS pending_hitl
FROM projects p
WHERE p.org_id = $1 AND p.status = 'active'
ORDER BY p.current_stage, p.target_date;
```

## 참조

- `items` 칸반: `tables/items.md`
- `hitl_cards`: `tables/hitl_cards.md`
- `teams`: `tables/teams.md`
- LucaPus I-002: `integrations/wiring-lucapus.md`
