# Wiring / Schemas / users — 테이블 본문

> Wiring 사용자. **6단 위계** (L1~L6) + 역할 + AI 에이전트 매핑.

---

## DDL

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  auth_user_id    UUID UNIQUE,
  
  email           TEXT NOT NULL,
  name            TEXT NOT NULL,
  
  -- 6단 위계 (G-040~G-053)
  level           TEXT NOT NULL CHECK (level IN ('L1','L2','L3','L4','L5','L6')),
  role            TEXT,                     -- 'CTO', 'PM', 'TL', 'SE', 'Jr. Dev', 'QA'
  
  -- 권한
  is_super_admin  BOOLEAN DEFAULT FALSE,     -- 조직 레벨 super (CTO 급)
  
  -- 상태
  status          TEXT NOT NULL DEFAULT 'invited'
                  CHECK (status IN ('invited','active','suspended','offboarded')),
  
  -- 설정
  hitl_preferences JSONB DEFAULT '{}'::jsonb,
  /* 예시:
     {"auto_approve_l1": true, "notify_on_l3_breach": true}
  */
  
  -- Slack / Jira 매핑
  slack_user_id   TEXT,
  jira_account_id TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (org_id, email)
);

CREATE INDEX idx_users_org_level ON users(org_id, level, status);
CREATE INDEX idx_users_auth ON users(auth_user_id) WHERE auth_user_id IS NOT NULL;
```

## 6단 위계 매트릭스 (G-040~G-053)

| 레벨 | 일반 역할 | HITL 책임 범위 | 결정 권한 |
|---|---|---|---|
| **L1** | Jr. Developer | 본인 작업 | 스스로 작성 가능한 범위 |
| **L2** | SE / Mid Dev | 본인 + L1 1~2명 | 규칙 내 실행 |
| **L3** | TL / Tech Lead | 팀 기술 결정 | 적합화 결정, 규칙 추가 제안 |
| **L4** | PM / Manager | 프로젝트 범위 | 일정·우선순위 결정 |
| **L5** | Director / VP | 기술 전략 | 아키텍처 결정 |
| **L6** | CTO | 조직 전체 | 최종 결정 |

## HITL 승인 흐름 (PW-002~004)

L1 에이전트 작업 → L1 사용자 승인 → L3 검증 → (필요 시 L4 이상 에스컬레이션)

`hitl_strictness` 에 따라 자동 승인 범위 조정.

## RLS

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 같은 org 조회
CREATE POLICY "users_same_org"
  ON users FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM users WHERE auth_user_id = auth.uid())
  );

-- L4 이상 은 전체 수정
CREATE POLICY "users_l4_plus_update"
  ON users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE auth_user_id = auth.uid() 
        AND level IN ('L4','L5','L6')
    )
  );
```

## 참조

- 위계 규칙: `03_hierarchy.md` (공통)
- HITL: `06_hitl.md`
- 적합화 HITL 카드: `products/wiring/schemas/tables/hitl_cards.md`
- 에이전트 매핑: `products/wiring/schemas/tables/agents.md`
