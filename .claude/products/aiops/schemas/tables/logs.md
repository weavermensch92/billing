# AiOPS / Schemas / logs — 테이블 본문

> 모든 AI 호출 로그. 프록시 + 익스텐션 + 크롤러 수집 통합. PA-001 + PA-003 (비동기 로깅).

---

## DDL

```sql
CREATE TABLE logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id),

  -- 세션 추적
  session_id      TEXT,                     -- 연속 호출 그룹핑
  
  -- 채널 (PA-005)
  channel         TEXT NOT NULL CHECK (channel IN (
    'anthropic_api','openai_api','gemini_api',
    'claude_code','cursor','windsurf',
    'claude_web','chatgpt_web','chatgpt_mobile','gemini_web',
    'github_copilot','notion_ai'
  )),

  -- 벤더 / 모델
  provider        TEXT NOT NULL,             -- 'anthropic', 'openai', 'google'
  model           TEXT NOT NULL,             -- 'claude-sonnet-4-5', 'gpt-4o'

  -- 프롬프트 / 응답 (PA-007 prompt_storage 옵션에 따라 저장)
  prompt          TEXT,                     -- NULL if disabled
  response        TEXT,                     -- NULL if disabled
  
  -- 메타데이터
  input_tokens    INT,
  output_tokens   INT,
  estimated_cost_krw BIGINT,
  latency_ms      INT,

  -- 이상 감지 관련
  sensitive_detected BOOLEAN DEFAULT FALSE,
  anomaly_flags     JSONB,

  -- 타임스탬프
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 원본 요청 (디버그)
  raw_request     JSONB
);

-- 시간 기반 파티셔닝 검토 (Phase 2, 월 100만건+)
CREATE INDEX idx_logs_org_time ON logs(org_id, created_at DESC);
CREATE INDEX idx_logs_user_time ON logs(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_logs_session ON logs(session_id)
  WHERE session_id IS NOT NULL;
CREATE INDEX idx_logs_channel_time ON logs(channel, created_at DESC);
CREATE INDEX idx_logs_sensitive ON logs(org_id, sensitive_detected, created_at DESC)
  WHERE sensitive_detected = TRUE;
```

## prompt_storage 옵션 (PA-007)

```typescript
// 삽입 시 orgs.prompt_storage 체크
async function insertLog(log: LogInput) {
  const org = await getOrg(log.org_id);
  
  if (org.prompt_storage === 'disabled') {
    log.prompt = null;
    log.response = null;
    log.raw_request = null;
  }
  
  // required 는 저장 강제 (감사 요건)
  // optional 은 org 설정 존중
  
  await db.insert('logs', log);
}
```

## 파티셔닝 (Phase 2+)

월 100만 로그 초과 시:
```sql
-- 월별 파티션으로 분리
CREATE TABLE logs_2026_05 PARTITION OF logs
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
```

## 보존 기간

- 24개월 유지 (기본)
- `prompt_storage='required'` 고객: 감사 요건에 따라 더 길게
- 해지 시 D+30 완전 삭제

## Billing 연동 (I-004)

```sql
-- 교차 검증 월 집계
CREATE VIEW v_logs_monthly_by_org AS
SELECT
  org_id,
  provider,
  date_trunc('month', created_at) AS month,
  COUNT(*) AS api_calls,
  SUM(input_tokens) AS total_input,
  SUM(output_tokens) AS total_output,
  SUM(estimated_cost_krw) AS estimated_total_krw
FROM logs
GROUP BY org_id, provider, date_trunc('month', created_at);
```

## RLS

```sql
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- member: 본인 로그만
-- admin_teams: 담당 팀 멤버 로그
-- super_admin: 조직 전체
-- (상세: rules/auth.md PA-004)
```

## 참조

- 프록시 구현: `rules/proxy.md` (PA-002 / PA-003)
- 채널 수집: `rules/channels.md` (PA-005)
- 민감정보 감지: `rules/governance.md` (PA-007)
- Billing 교차 검증: `integrations/billing-aiops.md` (I-004)
- 원본: `products/aiops/rules/data_model.md § PA-001`
