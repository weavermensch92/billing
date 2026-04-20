# Wiring / Schemas / user_teams — 테이블 본문

> 사용자 ↔ 팀 다대다 조인. Wiring 에서는 한 사용자가 여러 팀 소속 가능 (크로스팀 협업).

---

## DDL

```sql
CREATE TABLE user_teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  
  -- 팀 내 역할 (팀 리더, 멤버, 옵저버)
  team_role   TEXT NOT NULL DEFAULT 'member'
              CHECK (team_role IN ('lead','member','observer')),
  
  -- 기간
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at     TIMESTAMPTZ,
  
  UNIQUE (user_id, team_id)
);

CREATE INDEX idx_user_teams_user ON user_teams(user_id) WHERE left_at IS NULL;
CREATE INDEX idx_user_teams_team ON user_teams(team_id) WHERE left_at IS NULL;
```

## team_role 구분

| 역할 | 권한 |
|---|---|
| `lead` | 팀 HITL 승인 권한 + 팀 설정 변경 |
| `member` | 팀 작업 수행 + 본인 HITL |
| `observer` | 팀 내용 조회만 (알림 수신) |

## 유틸리티 쿼리

```sql
-- 사용자 소속 팀 전체
SELECT t.*, ut.team_role, ut.joined_at
FROM user_teams ut
JOIN teams t ON t.id = ut.team_id
WHERE ut.user_id = $1 AND ut.left_at IS NULL;

-- 팀 멤버 전체
SELECT u.*, ut.team_role
FROM user_teams ut
JOIN users u ON u.id = ut.user_id
WHERE ut.team_id = $1 AND ut.left_at IS NULL
ORDER BY 
  CASE ut.team_role WHEN 'lead' THEN 1 WHEN 'member' THEN 2 ELSE 3 END,
  u.name;
```

## 참조

- `users`: `tables/users.md`
- `teams`: `tables/teams.md`
