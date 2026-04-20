# AiOPS / Schemas / usage_patterns — 테이블 본문

> 일간 사용 패턴 집계. maturity_scores 계산의 원본 데이터. PA-010.

---

## DDL

```sql
CREATE TABLE usage_patterns (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id              UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- 시점
  pattern_date         DATE NOT NULL,
  
  -- 빈도 지표 (frequency)
  total_calls          INT DEFAULT 0,
  total_sessions       INT DEFAULT 0,
  active_hours         NUMERIC(4,2),         -- 0.00 ~ 24.00
  
  -- 깊이 지표 (depth)
  avg_followup_per_session NUMERIC(4,2),
  max_followup_in_session  INT,
  avg_prompt_tokens    INT,
  
  -- 다양성 (variety)
  distinct_channels    INT,                   -- 당일 사용 채널 종류
  distinct_providers   INT,                   -- vendor 종류 (anthropic, openai ...)
  
  -- 피드백 루프 (feedback)
  retry_rate_pct       NUMERIC(5,2),         -- 재질문 / 수정 비율
  session_completion_rate NUMERIC(5,2),      -- 의미 있는 응답 후 종료 비율
  
  -- 재질문 / 수정 카운트
  retry_count          INT DEFAULT 0,
  edit_count           INT DEFAULT 0,
  like_count           INT DEFAULT 0,
  
  -- 민감 / 이상
  sensitive_count      INT DEFAULT 0,
  prompt_length_avg    INT,
  
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (org_id, user_id, pattern_date)
);

CREATE INDEX idx_usage_patterns_user ON usage_patterns(user_id, pattern_date DESC);
CREATE INDEX idx_usage_patterns_date ON usage_patterns(pattern_date DESC);
```

## 계산 배치 (매일 02:00)

전날 `logs` 집계:
```sql
INSERT INTO usage_patterns (
  org_id, user_id, pattern_date,
  total_calls, total_sessions, active_hours,
  avg_followup_per_session, max_followup_in_session,
  avg_prompt_tokens,
  distinct_channels, distinct_providers,
  retry_count, edit_count, like_count,
  sensitive_count, prompt_length_avg
)
SELECT
  org_id, user_id, (CURRENT_DATE - 1) AS pattern_date,
  COUNT(*) AS total_calls,
  COUNT(DISTINCT session_id) AS total_sessions,
  EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 3600 AS active_hours,
  COUNT(*)::NUMERIC / NULLIF(COUNT(DISTINCT session_id), 0) AS avg_followup,
  MAX(session_call_count) AS max_followup,
  AVG(input_tokens)::INT AS avg_prompt_tokens,
  COUNT(DISTINCT channel) AS distinct_channels,
  COUNT(DISTINCT provider) AS distinct_providers,
  COUNT(*) FILTER (WHERE anomaly_flags->>'retry' = 'true') AS retry_count,
  COUNT(*) FILTER (WHERE anomaly_flags->>'edit' = 'true') AS edit_count,
  COUNT(*) FILTER (WHERE anomaly_flags->>'like' = 'true') AS like_count,
  COUNT(*) FILTER (WHERE sensitive_detected) AS sensitive_count,
  AVG(LENGTH(prompt))::INT AS prompt_length_avg
FROM logs
WHERE created_at >= (CURRENT_DATE - 1)
  AND created_at < CURRENT_DATE
  AND user_id IS NOT NULL
GROUP BY org_id, user_id;
```

## maturity_scores 계산 입력

```sql
-- 주 단위 4축 점수 (usage_patterns 7일 평균)
WITH weekly AS (
  SELECT user_id,
    AVG(total_calls) AS avg_calls,
    AVG(avg_followup_per_session) AS avg_depth,
    AVG(distinct_channels) AS avg_variety,
    AVG(100 - retry_rate_pct) AS avg_feedback
  FROM usage_patterns
  WHERE pattern_date >= CURRENT_DATE - 7
  GROUP BY user_id
)
SELECT
  user_id,
  LEAST(100, avg_calls * 2) AS axis_frequency,     -- 50회 이상 = 100
  LEAST(100, avg_depth * 25) AS axis_depth,        -- 4회 이상 = 100
  LEAST(100, avg_variety * 25) AS axis_variety,    -- 4개 이상 = 100
  avg_feedback AS axis_feedback
FROM weekly;
```

## RLS

```sql
ALTER TABLE usage_patterns ENABLE ROW LEVEL SECURITY;

-- 본인
CREATE POLICY "usage_patterns_self"
  ON usage_patterns FOR SELECT
  USING (user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid()));

-- admin_teams: 담당 팀 멤버
-- super_admin: 조직 전체
```

## 참조

- `logs`: `tables/logs.md` (PA-001)
- `maturity_scores`: `tables/maturity_scores.md` (PA-010)
- 성숙도 규칙: `rules/maturity.md` (PA-010)
