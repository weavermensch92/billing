# AiOPS / Proxy — 규칙 본문

> PA-002, PA-003 본문. AI 벤더 API를 프록시하여 자동 로깅하는 서버.
> Sprint 1의 심장. 모든 채널 로깅의 공통 엔진.

---

## PA-002 — 벤더 호환 프록시 (MUST)

### 원칙

**"패스스루 + 비동기 로깅"**. 고객 앱 입장에서 프록시가 원본 API와 **투명하게 동일**해야 함.

```
기존: 고객 앱 → api.anthropic.com
변경: 고객 앱 → proxy.gridge.ai/anthropic → api.anthropic.com
      └── 비동기로 logs 테이블에 기록 ──┘
```

### 지원 벤더 (Sprint 1)

| 벤더 | 프록시 경로 | 원본 | 주요 모델 |
|---|---|---|---|
| Anthropic | `/anthropic/*` | `https://api.anthropic.com/*` | Claude Sonnet/Opus/Haiku |
| OpenAI | `/openai/*` | `https://api.openai.com/*` | GPT-4o, GPT-4o-mini |
| Google | `/gemini/*` | `https://generativelanguage.googleapis.com/*` | Gemini 2.0 Flash/Pro |

### 미지원 → Sprint 2+

Azure OpenAI, AWS Bedrock, Cohere, Mistral 등은 Sprint 2 이후. 동일 패턴 확장.

### 엔드포인트 스펙

- **포트**: 4000 (dev) / 443 (prod, Railway/Render 배포)
- **프로토콜**: HTTPS 필수 (TLS 1.3, G-143)
- **인증 헤더**: `x-org-token: <org.api_token>` (자체 식별)
- **벤더 인증**: 원본 API 키는 **고객이 자체 관리** (Mode C 원칙, G-088). 프록시는 Bearer 헤더를 그대로 패스.

---

## PA-002-01 — 공통 패스스루 핸들러 (MUST)

```typescript
// /proxy/server.ts
import express from 'express';
import fetch from 'node-fetch';

const VENDORS = {
  anthropic: 'https://api.anthropic.com',
  openai:    'https://api.openai.com',
  gemini:    'https://generativelanguage.googleapis.com',
} as const;

type Vendor = keyof typeof VENDORS;

async function handleProxy(
  vendor: Vendor,
  req: express.Request,
  res: express.Response,
) {
  const startTime = Date.now();
  const orgToken = req.headers['x-org-token'] as string;

  // 1. 인증
  if (!orgToken) {
    return res.status(401).json({ error: 'missing x-org-token header' });
  }
  const org = await getOrgByToken(orgToken);
  if (!org) {
    return res.status(403).json({ error: 'invalid org token' });
  }

  // 2. 패스스루 요청 구성 (host 헤더 제거)
  const { host, 'x-org-token': _, ...forwardHeaders } = req.headers;
  const targetPath = req.path.replace(`/${vendor}`, '');  // '/anthropic/v1/messages' → '/v1/messages'
  const targetUrl = VENDORS[vendor] + targetPath;

  try {
    const vendorResponse = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders as Record<string, string>,
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const responseData = await vendorResponse.json();

    // 3. 고객에게 응답 즉시 반환 (latency 영향 최소화)
    res.status(vendorResponse.status).json(responseData);

    // 4. 비동기 로깅 (응답 후 실행)
    const latency = Date.now() - startTime;
    queueLogSave({
      org_id: org.id,
      vendor,
      req,
      responseData,
      latency_ms: latency,
      status: vendorResponse.status,
    });

  } catch (err) {
    res.status(502).json({ error: 'upstream_error', message: String(err) });

    // 에러도 로깅 (flagged=true)
    queueLogSave({
      org_id: org.id,
      vendor,
      req,
      error: err,
      latency_ms: Date.now() - startTime,
      status: 502,
    });
  }
}

// 벤더별 라우트
app.all('/anthropic/*', (req, res) => handleProxy('anthropic', req, res));
app.all('/openai/*',    (req, res) => handleProxy('openai',    req, res));
app.all('/gemini/*',    (req, res) => handleProxy('gemini',    req, res));
```

### 중요 원칙

1. **고객 응답이 먼저** — `res.json(...)` 먼저, 로깅은 큐에 넣고 비동기
2. **호스트 헤더 제거** — `host: api.anthropic.com` 같은 값이 그대로 전달되면 원본 서버가 오인
3. **x-org-token은 내부 전용** — 원본 벤더로 전달하지 않음
4. **Bearer 헤더는 패스** — 원본 API 키는 그대로 통과 (프록시는 수정 X)

---

## PA-003 — 비동기 로깅 (MUST)

### 원칙

**로깅 실패가 고객 API 호출을 막으면 안 된다.** 로깅은 완전히 분리된 경로.

### 큐 기반 구조

```typescript
// In-memory 큐 (Sprint 1) — 추후 Redis / SQS 이관
const logQueue: LogEntry[] = [];

function queueLogSave(entry: LogEntry) {
  logQueue.push(entry);
}

// 워커: 100ms마다 배치 처리
setInterval(async () => {
  if (logQueue.length === 0) return;

  const batch = logQueue.splice(0, 50);  // 최대 50건씩
  try {
    await supabase.from('logs').insert(batch.map(toDbRow));
  } catch (err) {
    // 실패 건은 재시도 큐로
    logQueue.unshift(...batch);
    console.error('log batch insert failed:', err);
  }
}, 100);
```

### Sprint 1 용인 수준

- In-memory 큐: 서버 재시작 시 유실 (최대 100ms 치)
- Sprint 2 이관 후: Redis Streams or AWS SQS

---

## PA-003-01 — 로그 엔트리 변환 (MUST)

벤더별 응답 포맷이 다름. 통일된 `logs` 테이블 형태로 변환:

### Anthropic

```typescript
function extractAnthropicLog(req, res): Partial<Log> {
  const reqBody = req.body;
  const resBody = res;
  return {
    channel: detectChannel(req),  // 'anthropic_api' | 'claude_code' | ...
    model: reqBody.model,
    session_id: req.headers['x-session-id'] as string || genUuid(),
    prompt: reqBody.messages?.map(m => m.content).join('\n\n'),
    response: resBody.content?.[0]?.text,
    input_tokens: resBody.usage?.input_tokens ?? 0,
    output_tokens: resBody.usage?.output_tokens ?? 0,
    cost_usd: calculateCost(reqBody.model,
                            resBody.usage?.input_tokens ?? 0,
                            resBody.usage?.output_tokens ?? 0),
  };
}
```

### OpenAI

```typescript
function extractOpenAILog(req, res): Partial<Log> {
  const reqBody = req.body;
  const resBody = res;
  return {
    channel: detectChannel(req),
    model: reqBody.model,
    session_id: req.headers['x-session-id'] as string || genUuid(),
    prompt: reqBody.messages?.map(m => m.content).join('\n\n'),
    response: resBody.choices?.[0]?.message?.content,
    input_tokens: resBody.usage?.prompt_tokens ?? 0,
    output_tokens: resBody.usage?.completion_tokens ?? 0,
    cost_usd: calculateCost(reqBody.model,
                            resBody.usage?.prompt_tokens ?? 0,
                            resBody.usage?.completion_tokens ?? 0),
  };
}
```

### Gemini

```typescript
function extractGeminiLog(req, res): Partial<Log> {
  const reqBody = req.body;
  const resBody = res;
  // Gemini는 usageMetadata.promptTokenCount / candidatesTokenCount
  const inputTokens = resBody.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = resBody.usageMetadata?.candidatesTokenCount ?? 0;
  return {
    channel: detectChannel(req),
    model: extractModelFromPath(req.path),  // '/v1/models/gemini-2.0-flash:generateContent'
    session_id: req.headers['x-session-id'] as string || genUuid(),
    prompt: reqBody.contents?.flatMap(c => c.parts).map(p => p.text).join('\n\n'),
    response: resBody.candidates?.[0]?.content?.parts?.[0]?.text,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: calculateCost(extractModelFromPath(req.path), inputTokens, outputTokens),
  };
}
```

---

## PA-003-02 — 채널 식별 (MUST)

같은 벤더라도 호출 주체에 따라 `channel` 값 다름. User-Agent 또는 전용 헤더로 구분:

```typescript
function detectChannel(req): string {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const vendor = req.path.split('/')[1];  // 'anthropic' | 'openai' | 'gemini'

  // Claude Code 전용 User-Agent
  if (ua.includes('claude-code')) return 'claude_code';

  // Cursor: 자체 User-Agent
  if (ua.includes('cursor')) return 'cursor';

  // Windsurf
  if (ua.includes('windsurf')) return 'windsurf';

  // 커스텀 SDK는 x-gridge-channel 헤더로 선언
  const custom = req.headers['x-gridge-channel'];
  if (custom) return String(custom);

  // 기본: 벤더 직접 API 호출
  return `${vendor}_api`;
}
```

---

## PA-003-03 — 프롬프트 저장 옵션 적용 (MUST)

G-146 / PA-001-02 와 정합:

```typescript
async function toDbRow(entry: LogEntry): Promise<Log> {
  const org = await getOrg(entry.org_id);
  const storage = org.prompt_storage;  // 'full' | 'summary' | 'none'

  const base = {
    ...entry,
    // timestamp는 DB DEFAULT now() 사용
  };

  if (storage === 'full') {
    return { ...base };
  }

  if (storage === 'summary') {
    const summary = await summarizeWithCheap(entry.prompt, 200);
    return { ...base, prompt: null, response: null, prompt_summary: summary };
  }

  // 'none'
  return { ...base, prompt: null, response: null, prompt_summary: null };
}
```

### 요약 모델

요약 자체도 비용 발생. 저렴한 모델 사용:
- Haiku / GPT-4o-mini / Gemini Flash
- 고객 조직의 `llm_routing.summary_model` 설정 따르기 (없으면 기본 Haiku)

---

## PA-003-04 — 에러 처리 (MUST)

벤더 API 에러는 고객에게 원본 그대로 전달. 로깅에는 `error_type` 추가:

```typescript
const ERROR_TYPE_MAP: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  429: 'rate_limit',
  500: 'vendor_server_error',
  502: 'upstream_error',
  503: 'vendor_unavailable',
  504: 'timeout',
};

function classifyError(status: number, body: any): string {
  return ERROR_TYPE_MAP[status] || `error_${status}`;
}
```

에러 로그는 `flagged: true` 로 저장하여 대시보드에서 별도 필터링 가능.

---

## PA-003-05 — 성능 요구사항 (SHOULD)

| 지표 | 목표 |
|---|---|
| 프록시 자체 오버헤드 (p50) | ≤ 30ms |
| 프록시 자체 오버헤드 (p99) | ≤ 200ms |
| 로그 큐 지연 (enqueue → DB 저장) | ≤ 5초 |
| 동시 연결 | ≥ 1,000 |

### 달성 전략

- Node.js cluster 모드 (CPU 코어 수만큼)
- Keep-alive 커넥션 (벤더 API 풀 재사용)
- DB 배치 삽입 (50건/100ms)
- 스트리밍 응답 (Anthropic/OpenAI의 SSE) — Sprint 2 이관

---

## PA-002-02 — 배포 (Sprint 1)

- 플랫폼: **Railway** 또는 **Render** (빠른 배포, HTTPS 자동)
- 도메인: `proxy.gridge.ai` (A/AAAA 레코드)
- HTTPS: 자동 (Let's Encrypt)
- 환경 변수:
  ```
  SUPABASE_URL=...
  SUPABASE_SERVICE_KEY=...  # RLS 우회 필요 (로그 insert)
  PORT=4000
  NODE_ENV=production
  ```

### 헬스체크

```typescript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', queue_depth: logQueue.length });
});
```

### 대시보드에서 상태 확인

- 고객 화면 "연동 설정" 탭에 각 벤더별 프록시 상태 표시
- 최근 5분간 호출 수 / 에러율 / 평균 latency

---

## PA-002-03 — 고객 연동 가이드 자동 생성

`/onboarding` 엔드포인트에서 고객사별 맞춤 가이드:

```
https://proxy.gridge.ai/onboarding?token=<org.api_token>

→ 고객사 대시보드에 표시:

# 연동 가이드

## Claude Code
export ANTHROPIC_BASE_URL=https://proxy.gridge.ai/anthropic
export ANTHROPIC_AUTH_TOKEN=<원본 API 키>
# 추가
export X_ORG_TOKEN=<고객사 토큰>

## Cursor
Settings > AI > Base URL:
  https://proxy.gridge.ai/openai

## OpenAI API (코드 내)
client = OpenAI(
  base_url="https://proxy.gridge.ai/openai/v1",
  api_key="sk-...",  # 원본 그대로
  default_headers={"x-org-token": "<고객사 토큰>"}
)
```

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] 프록시가 `host` 헤더를 벤더에게 전달?
- [ ] `x-org-token` 을 원본 벤더에게 전달?
- [ ] 로깅이 고객 응답 이전에 실행 (latency 영향)?
- [ ] 로깅 실패가 고객 API 에러로 전파?
- [ ] 원본 API 키가 로그에 기록?
- [ ] 에러 응답 포맷이 원본과 달라짐?
- [ ] `cost_usd` 계산 없이 0으로 저장?
- [ ] 알 수 없는 벤더 모델에 경고 없이 0 반환?

---

## 참조

- 데이터 모델: `products/aiops/rules/data_model.md` (PA-001)
- 인증 / 권한: `products/aiops/rules/auth.md` (PA-004)
- 채널별 가이드: `products/aiops/rules/channels.md` (PA-005)
- 이상 감지: `products/aiops/rules/governance.md` (PA-007~008)
- 보안 / 키 관리: `08_security.md` (G-142, G-150)
- Mode C 원칙 (고객 API 키): `05_infra_mode.md § 8` (G-088)
- 코드 표준: `07_coding_standard.md § G-123` (무음 실패 금지)
