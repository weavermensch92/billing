# AiOPS / Data Model — 규칙 본문

> PA-001 본문. AiOPS의 핵심 데이터 모델 (logs / users / orgs) 스키마 정의.
> Sprint 1 로그 수집 인프라의 출발점.

---

## PA-001 — 3 테이블 핵심 스키마 (MUST)

Supabase (PostgreSQL) 기반. 모든 테이블에 `org_id` RLS 적용 (G-144).

### orgs — 고객 조직

```sql
CREATE TABLE orgs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  api_token   text UNIQUE NOT NULL,            -- 고객사 식별 토큰
  plan        text NOT NULL DEFAULT 'starter'
              CHECK (plan IN ('starter','growth','enterprise')),

  -- 운영 메타
  onboarded_at       timestamptz,
  active_channels    text[] DEFAULT ARRAY[]::text[],  -- ['anthropic','openai',...]

  -- 컴플라이언스 옵션 (G-146 연동)
  prompt_storage     text NOT NULL DEFAULT 'summary'
                     CHECK (prompt_storage IN ('full','summary','none')),
  retention_days     integer NOT NULL DEFAULT 90,

  -- Mode 분기 (G-080)
  infra_mode         text NOT NULL DEFAULT 'A'
                     CHECK (infra_mode IN ('A','B','C')),

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orgs_api_token ON orgs(api_token);
```

### users — AI 사용자

```sql
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,

  name        text NOT NULL,
  email       text NOT NULL,
  team        text,                             -- 팀 이름 (자유 텍스트)

  -- AiOPS 3단 권한 (PA-004)
  role        text NOT NULL DEFAULT 'member'
              CHECK (role IN ('super_admin','admin_teams','member')),
  admin_teams text[] DEFAULT ARRAY[]::text[],   -- admin_teams 역할일 때만 사용

  -- SSO 연동 (G-046)
  sso_external_id  text,                        -- Okta/Azure AD의 사용자 ID
  sso_provider     text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, email)
);

CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_users_team ON users(org_id, team);
```

### logs — 모든 AI 호출 기록 ★

```sql
CREATE TABLE logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,

  -- 세션 묶음 (대화방 단위)
  session_id      text NOT NULL,                -- 벤더별 다른 포맷 허용

  -- 채널 식별 (PA-005 범위)
  channel         text NOT NULL CHECK (channel IN (
    'anthropic_api',      -- 직접 API 호출 (Anthropic)
    'openai_api',         -- 직접 API 호출 (OpenAI)
    'gemini_api',         -- 직접 API 호출 (Google)
    'azure_openai',
    'aws_bedrock',
    'claude_code',        -- Claude Code CLI (ANTHROPIC_BASE_URL)
    'cursor',             -- Cursor 에디터
    'windsurf',           -- Windsurf 에디터
    'extension_web',      -- Chrome 익스텐션 (claude.ai/chatgpt.com/gemini.google.com)
    'chatgpt_crawler',    -- 공유 링크 크롤러
    'copilot_mitmproxy',  -- GitHub Copilot
    'notion_mitmproxy',   -- Notion AI
    'custom_sdk'          -- LangChain / LlamaIndex / 자체 SDK
  )),

  model           text NOT NULL,                -- 'claude-sonnet-4-6', 'gpt-4o', ...

  -- 프롬프트/응답 (G-146 저장 옵션에 따라 분기)
  prompt          text,                         -- orgs.prompt_storage 따라 저장 여부 결정
  response        text,
  prompt_summary  text,                         -- storage='summary'일 때 AI 생성 요약

  -- 토큰/비용
  input_tokens    integer NOT NULL DEFAULT 0,
  output_tokens   integer NOT NULL DEFAULT 0,
  cost_usd        numeric(12,6) NOT NULL DEFAULT 0,

  -- 성능
  latency_ms      integer NOT NULL DEFAULT 0,

  -- 감지 플래그 (PA-007, PA-009)
  flagged         boolean NOT NULL DEFAULT false,
  flag_reasons    text[] DEFAULT ARRAY[]::text[],  -- ['pii_detected','cost_spike',...]

  -- 에러
  error_type      text,                         -- 'rate_limit','timeout','api_error',...
  error_message   text,

  timestamp       timestamptz NOT NULL DEFAULT now()
);

-- 인덱스: 대시보드 쿼리 최적화
CREATE INDEX idx_logs_org_time ON logs(org_id, timestamp DESC);
CREATE INDEX idx_logs_user_time ON logs(user_id, timestamp DESC);
CREATE INDEX idx_logs_org_channel ON logs(org_id, channel, timestamp DESC);
CREATE INDEX idx_logs_org_model ON logs(org_id, model, timestamp DESC);
CREATE INDEX idx_logs_flagged ON logs(org_id, flagged, timestamp DESC)
  WHERE flagged = true;
CREATE INDEX idx_logs_session ON logs(session_id);

-- RLS (G-144)
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see only their org logs"
  ON logs FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
```

---

## PA-001-01 — 데이터 보유 정책 (MUST)

G-145 연동. 보유 기간 경과 시 자동 삭제:

```sql
-- 일일 배치로 실행 (pg_cron 또는 외부 스케줄러)
DELETE FROM logs
WHERE org_id = $1
  AND timestamp < now() - (SELECT retention_days FROM orgs WHERE id = $1) * INTERVAL '1 day';
```

### 보유 기간 예외

- `flagged = true` 로그: 1년 유지 (감사 목적)
- 사건 조사 중인 로그: 수동 보존 (OA가 보류 플래그 설정)

---

## PA-001-02 — 프롬프트 저장 옵션 (MUST)

G-146 연동. `orgs.prompt_storage` 값에 따라 저장 필드 분기:

| 옵션 | `prompt` | `response` | `prompt_summary` |
|---|---|---|---|
| `full` | 원문 저장 | 원문 저장 | NULL |
| `summary` (기본) | NULL | NULL | AI 200자 요약 |
| `none` | NULL | NULL | NULL |

### 구현

```typescript
async function saveLog(org, req, res) {
  const org = await getOrg(org_id);
  const promptStorage = org.prompt_storage; // 'full' | 'summary' | 'none'

  const logEntry: Partial<Log> = {
    org_id,
    user_id,
    session_id,
    channel,
    model,
    input_tokens,
    output_tokens,
    cost_usd,
    latency_ms,
    timestamp: new Date(),
  };

  if (promptStorage === 'full') {
    logEntry.prompt = req.body.messages.map(m => m.content).join('\n');
    logEntry.response = res.content;
  } else if (promptStorage === 'summary') {
    logEntry.prompt_summary = await summarizeWithCheaperModel(req.body, 200);
  }
  // 'none' → 메타만

  await db.from('logs').insert(logEntry);
}
```

---

## PA-001-03 — 비용 계산 (MUST)

모델별 단가표는 코드 상수로 관리 (DB 테이블 X — 잦은 변경 아님):

```typescript
// 모델별 단가 (USD per token)
// 출처: 각 벤더 공식 가격표, 분기별 수동 업데이트
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-opus-4-7':    { input: 0.000015,  output: 0.000075 },
  'claude-opus-4-6':    { input: 0.000015,  output: 0.000075 },
  'claude-sonnet-4-6':  { input: 0.000003,  output: 0.000015 },
  'claude-haiku-4-5':   { input: 0.00000025, output: 0.00000125 },

  // OpenAI
  'gpt-4o':             { input: 0.000005,  output: 0.000015 },
  'gpt-4o-mini':        { input: 0.00000015, output: 0.0000006 },

  // Google
  'gemini-2.0-flash':   { input: 0.000000075, output: 0.0000003 },
  'gemini-2.0-pro':     { input: 0.00000125, output: 0.000005 },

  // Upstage (한국어)
  'solar-pro':          { input: 0.0000015,  output: 0.0000045 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;  // 모르는 모델은 0 (로그에 경고)
  return inputTokens * pricing.input + outputTokens * pricing.output;
}
```

### 알 수 없는 모델 대응

```typescript
if (!MODEL_PRICING[model]) {
  logger.warn({
    event: 'unknown_model_pricing',
    model,
    org_id,
    action: 'cost set to 0, review needed',
  });
  // cost_usd = 0 으로 저장 — 대시보드에 "비용 확인 필요" 경고
}
```

---

## PA-001-04 — RLS 및 격리 (MUST)

G-144 적용. 모든 테이블에 RLS 활성화:

```sql
-- orgs: 본인 조직만
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see their org"
  ON orgs FOR SELECT
  USING (id = (auth.jwt() ->> 'org_id')::uuid);

-- users: 본인 조직만
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see same org users"
  ON users FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- logs: 본인 조직 + 권한 분기
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- super_admin / admin_teams: 본인이 권한 있는 범위
CREATE POLICY "Admins see scoped logs"
  ON logs FOR SELECT
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND CASE
      WHEN (auth.jwt() ->> 'role') = 'super_admin' THEN true
      WHEN (auth.jwt() ->> 'role') = 'admin_teams' THEN
        user_id IN (
          SELECT id FROM users
          WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
            AND team = ANY((auth.jwt() ->> 'admin_teams')::text[])
        )
      ELSE user_id = (auth.jwt() ->> 'user_id')::uuid
    END
  );
```

---

## PA-001-05 — 마이그레이션 관리

- Supabase 마이그레이션 디렉토리: `supabase/migrations/`
- 명명 규칙: `YYYY-MM-DD-HH-MM_<slug>.sql`
- 전체 스키마 변경은 S 체인 진입 (`90_execution_chain § S`)
- `logs` 테이블 컬럼 추가 시: `ALTER TABLE ... ADD COLUMN ... NULL` (backward compatible)
- 컬럼 삭제 시: Deprecation 공지 → 1버전 유지 → 삭제

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] `logs` 테이블 쿼리에 `org_id` 필터 누락?
- [ ] `orgs.prompt_storage` 값과 실제 저장 데이터 불일치?
- [ ] 알 수 없는 모델을 `cost_usd` 없이 저장?
- [ ] RLS 없이 `logs` 테이블 SELECT?
- [ ] `api_token` 을 로그나 에러 메시지에 노출?
- [ ] 보유 기간 지난 데이터가 여전히 조회됨?
- [ ] `flag_reasons` 에 개인 식별 정보 포함?

---

## 참조

- 프록시 구현: `products/aiops/rules/proxy.md` (PA-002~003)
- 3단 권한: `products/aiops/rules/auth.md` (PA-004)
- 채널 목록: `products/aiops/rules/channels.md` (PA-005)
- 이상 감지: `products/aiops/rules/governance.md` (PA-007~008)
- 보안 / RLS / 데이터 보유: `08_security.md` (G-140~G-147)
- Mode 분기: `05_infra_mode.md`
- Wiring 연동: `integrations/aiops-wiring.md` (I-001, 작성 예정)
