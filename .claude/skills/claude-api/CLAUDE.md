# Skills — Claude API (Anthropic)

> Anthropic Claude API + SDK + MCP 사용 가이드.
> 하네스 AI / LucaPus 에이전트 / AiOPS 프록시 모두 참조.

---

## 기본 엔드포인트

```
POST https://api.anthropic.com/v1/messages
```

헤더:
```
x-api-key: sk-ant-...
anthropic-version: 2023-06-01
content-type: application/json
```

---

## 모델 ID (2026 Q1 기준)

| 모델 | 용도 |
|---|---|
| `claude-opus-4-7` | 최상위 추론 (Gridge 현재 기본) |
| `claude-opus-4-6` | 깊은 추론 |
| `claude-sonnet-4-6` | 균형 |
| `claude-haiku-4-5-20251001` | 빠름 / 저비용 |

현재 Claude 는 `claude-opus-4-7` 자체. Gridge 하네스 기본 배정은 에이전트 타입별로 다름 (PL-004-01).

---

## SDK

### TypeScript

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: '...' }],
});
```

### Python

```python
from anthropic import Anthropic

client = Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "..."}],
)
```

---

## 스트리밍 (SSE)

```typescript
const stream = await client.messages.stream({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [...],
});

for await (const event of stream) {
  if (event.type === 'content_block_delta') {
    process.stdout.write(event.delta.text);
  }
}

const finalMessage = await stream.finalMessage();
```

### 이벤트 타입

- `message_start` — 시작
- `content_block_start` — 블록 시작 (text / tool_use)
- `content_block_delta` — 토큰 delta
- `content_block_stop` — 블록 종료
- `message_delta` — 메시지 delta (usage 포함)
- `message_stop` — 전체 종료

---

## Tool Use (Function Calling)

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  tools: [
    {
      name: 'get_weather',
      description: '주어진 위치의 날씨를 조회',
      input_schema: {
        type: 'object',
        properties: {
          location: { type: 'string', description: '도시명' },
        },
        required: ['location'],
      },
    },
  ],
  messages: [{ role: 'user', content: '서울 날씨 알려줘' }],
});

// 응답 stop_reason === 'tool_use' 체크
if (response.stop_reason === 'tool_use') {
  const toolUse = response.content.find(c => c.type === 'tool_use');
  const result = await executeToolLocally(toolUse.name, toolUse.input);
  
  // 결과 다시 보냄
  const final = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    tools: [...],
    messages: [
      { role: 'user', content: '서울 날씨 알려줘' },
      { role: 'assistant', content: response.content },
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) },
      ]},
    ],
  });
}
```

---

## MCP (Model Context Protocol)

Anthropic 의 외부 도구 / 데이터 소스 연결 표준. 
Claude Desktop / Claude Code / Gridge 하네스에서 공통 사용.

### 기본 구조

```
AI 클라이언트 ←→ MCP 서버 (도구 / 리소스 제공)
```

### 커스텀 MCP 서버 (Node.js)

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: 'gridge-internal-mcp', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'query_adapt_queue',
      description: '적합화 큐 현재 상태 조회',
      inputSchema: { type: 'object', properties: { project_id: { type: 'string' } } },
    },
  ],
}));

await server.connect(new StdioServerTransport());
```

Gridge 내부에서 Wiring / LucaPus / AiOPS 를 서로 연결할 때 MCP 서버 패턴 활용 가능.

---

## 비용 추적 (AiOPS 연동)

응답에서 `usage` 필수 확인:

```typescript
const response = await client.messages.create({...});
const cost = calculateCost(
  response.model,
  response.usage.input_tokens,
  response.usage.output_tokens,
);
// AiOPS logs 테이블에 기록 (PA-001)
```

모델별 단가는 `skills/multi-llm-routing/CLAUDE.md` 참조.

---

## 에러 처리

```typescript
try {
  const response = await client.messages.create({...});
} catch (error) {
  if (error instanceof Anthropic.APIError) {
    // 429 rate limit → Retry-After 헤더 + exponential backoff
    // 5xx → 재시도 (3회)
    // 400 → 즉시 실패 (입력 문제)
  }
}
```

---

## 보안 (G-150 정합)

- API key 환경변수만 (커밋 금지)
- `.env` / Secrets Manager 경유
- 로그에 key 노출 금지
- Mode C 에서 고객 API 키는 메모리 전달만 (DB 저장 X, G-088)

---

## 참조

- Anthropic 공식 docs: https://docs.claude.com (최신 정보 확인)
- AiOPS 프록시: `products/aiops/channels/anthropic.md`
- 하네스 모델 배정: `products/lucapus/orchestrators/harness.md` (PL-004)
- 멀티 LLM 라우팅: `skills/multi-llm-routing/CLAUDE.md`
- G-088 Mode C API 키: `05_infra_mode.md § 8`
- G-150 시크릿 노출 금지: `08_security.md § 9`
