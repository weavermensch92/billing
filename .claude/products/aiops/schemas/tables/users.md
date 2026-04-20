# AiOPS / Schemas / users — 테이블 본문

> AiOPS 사용자. 3단 권한 (super_admin / admin_teams / member).

---

## DDL

```sql
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  auth_user_id   UUID UNIQUE,                -- Supabase Auth 연결

  email          TEXT NOT NULL,
  name           TEXT NOT NULL,

  -- 3단 권한
  role           TEXT NOT NULL CHECK (role IN ('super_admin','admin_teams','member')),

  -- 팀 배정 (admin_teams 가 담당하는 팀)
  managed_team_ids TEXT[] DEFAULT ARRAY[]::text[],
  
  -- 개인 팀
  team           TEXT,

  -- 상태
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('invited','active','suspended','offboarded')),

  -- 옵션
  coaching_enabled BOOLEAN DEFAULT TRUE,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, email)
);

CREATE INDEX idx_users_org_role ON users(org_id, role, status);
CREATE INDEX idx_users_auth ON users(auth_user_id) WHERE auth_user_id IS NOT NULL;
```

## 3단 권한 매트릭스

| 액션 | super_admin | admin_teams | member |
|---|---|---|---|
| 조직 설정 변경 | ✅ | ❌ | ❌ |
| 전체 팀 로그 조회 | ✅ | ❌ | ❌ |
| 담당 팀 로그 조회 | ✅ | ✅ (managed_team_ids) | ❌ |
| 본인 로그 조회 | ✅ | ✅ | ✅ |
| 본인 코칭 카드 | ✅ | ✅ | ✅ |

## RLS

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 같은 org 조회 가능
CREATE POLICY "users_same_org_select"
  ON users FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE auth_user_id = auth.uid()
    )
  );
```

## 참조

- 권한 규칙: `rules/auth.md` (PA-004)
- 코칭 카드: `rules/maturity.md` (PA-010)
- 원본: `products/aiops/rules/data_model.md § users`
