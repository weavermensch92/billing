# Wiring / Schemas / teams — 테이블 본문

> Wiring 조직 내 팀. 다대다 (사용자가 여러 팀 소속 가능).

---

## DDL

```sql
CREATE TABLE teams (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  
  -- 팀 리더 (TL, L3 이상)
  lead_user_id   UUID REFERENCES users(id),
  
  -- 담당 프로젝트
  default_project_id UUID REFERENCES projects(id),
  
  -- 적합화 영역 (이 팀이 소유하는 규칙 범위)
  ontology_domains TEXT[],   -- ['frontend', 'payments', 'observability']
  
  -- Jira 매핑 (선택)
  jira_component TEXT,
  jira_label     TEXT,
  
  -- 메타
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (org_id, name)
);

CREATE INDEX idx_teams_org ON teams(org_id);
CREATE INDEX idx_teams_lead ON teams(lead_user_id) WHERE lead_user_id IS NOT NULL;
```

## 팀 vs 프로젝트 구분

- **팀 (teams)**: 장기 조직 단위 (프론트엔드팀, 백엔드팀)
- **프로젝트 (projects)**: 시한 있는 작업 단위 (A 제품 v2.0 개발)

하나의 팀이 여러 프로젝트 담당 가능 / 한 프로젝트에 여러 팀 참여 가능.

## 온톨로지 도메인 소유권 (PW-006)

`ontology_domains` 에 해당하는 규칙은 이 팀이 적합화 의견 우선. 예:
- `payments` 도메인 관련 규칙 새로 등장 → 결제팀 TL 에게 HITL 카드 자동 배정

## RLS

```sql
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_org_member"
  ON teams FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM users WHERE auth_user_id = auth.uid())
  );
```

## 참조

- `user_teams` 다대다: `tables/user_teams.md`
- `projects`: `tables/projects.md`
- 적합화 규칙 온톨로지: `rules/adapt_tab.md` (PW-006)
