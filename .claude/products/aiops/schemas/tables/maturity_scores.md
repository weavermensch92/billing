# AiOPS / Schemas / maturity_scores — 테이블 본문

> AI 성숙도 주간 스냅샷. PA-010. 개인 · 팀 · 조직 3단 집계.

---

## DDL

```sql
CREATE TABLE maturity_scores (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- 스코프 (3단 중 하나)
  scope               TEXT NOT NULL CHECK (scope IN ('user','team','org')),
  user_id             UUID REFERENCES users(id),  -- scope='user' 일 때만
  team                TEXT,                        -- scope='team' 일 때만
  
  -- 시점
  snapshot_week       DATE NOT NULL,               -- 주 시작일 (월요일)
  
  -- 점수 (0~100)
  overall_score       NUMERIC(5,2) NOT NULL,
  
  -- 4개 축 (PA-010)
  axis_frequency      NUMERIC(5,2),  -- 활용 빈도
  axis_depth          NUMERIC(5,2),  -- 질문 깊이
  axis_variety        NUMERIC(5,2),  -- 도구 다양성
  axis_feedback       NUMERIC(5,2),  -- 피드백 루프
  
  -- 전주 대비
  prev_score          NUMERIC(5,2),
  delta               NUMERIC(5,2),  -- prev 대비 변화
  
  -- 원본 계산 참조
  usage_pattern_ids   UUID[],        -- usage_patterns 참조
  
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (org_id, scope, user_id, team, snapshot_week)
);

CREATE INDEX idx_maturity_user ON maturity_scores(user_id, snapshot_week DESC)
  WHERE scope = 'user';
CREATE INDEX idx_maturity_team ON maturity_scores(org_id, team, snapshot_week DESC)
  WHERE scope = 'team';
CREATE INDEX idx_maturity_org ON maturity_scores(org_id, snapshot_week DESC)
  WHERE scope = 'org';
```

## 4개 축 정의 (PA-010)

| 축 | 측정 | 만점 100 기준 |
|---|---|---|
| **frequency** | 주간 AI 호출 횟수 / 주간 근무시간 | 호출 50회 이상 = 100 |
| **depth** | 세션당 평균 후속 질문 수 | 4회 이상 = 100 |
| **variety** | 주간 사용 도구 종류 수 | 4개 이상 = 100 |
| **feedback** | 응답 후 좋아요/수정/재질문 비율 | 80%+ = 100 |

`overall_score = (frequency + depth + variety + feedback) / 4`

## 계산 배치 (매주 월요일 06:00)

```sql
-- 개인 점수
INSERT INTO maturity_scores (
  org_id, scope, user_id, snapshot_week,
  overall_score, axis_frequency, axis_depth, axis_variety, axis_feedback,
  prev_score, delta
)
SELECT
  u.org_id, 'user', u.id,
  date_trunc('week', CURRENT_DATE - 1)::date,
  calculated_overall, calc_freq, calc_depth, calc_variety, calc_feedback,
  prev.overall_score AS prev_score,
  calculated_overall - COALESCE(prev.overall_score, calculated_overall) AS delta
FROM users u
CROSS JOIN LATERAL (
  -- 4개 축 계산 서브쿼리 (복잡, 생략)
) stats
LEFT JOIN LATERAL (
  SELECT overall_score FROM maturity_scores
  WHERE user_id = u.id AND scope = 'user'
  ORDER BY snapshot_week DESC LIMIT 1
) prev ON TRUE
WHERE u.status = 'active';

-- 팀 점수 (동일 로직)
-- 조직 점수 (동일 로직)
```

## 회귀 감지 (PA-010-05)

`delta < -15%` 시 `alerts INSERT (alert_type='maturity_regression')` 자동 생성.

## RLS

```sql
ALTER TABLE maturity_scores ENABLE ROW LEVEL SECURITY;

-- 본인 점수: 본인
CREATE POLICY "maturity_self"
  ON maturity_scores FOR SELECT
  USING (
    scope = 'user' 
    AND user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- 팀 점수: admin_teams 본인 담당 팀 + super_admin
-- 조직 점수: super_admin
```

## 참조

- 규칙: `rules/maturity.md` (PA-010)
- `users`: `tables/users.md`
- `usage_patterns` (집계 원본): 추후 작성
- 코칭 카드 (회귀 대응): `rules/maturity.md § PA-010-07`
