# Skills — Multi-LLM Routing

> 하네스 AI (PL-004) 의 모델 배정 + AiOPS 프록시 벤더 라우팅.
> Claude / GPT / Gemini / Solar / Ollama / vLLM.

---

## 벤더 / 모델 카탈로그 (2026 Q1)

### Anthropic

| 모델 | 용도 | Input / Output USD/1M |
|---|---|---|
| claude-opus-4-7 | 최상위 추론 | $15 / $75 |
| claude-opus-4-6 | 깊은 추론 | $15 / $75 |
| claude-sonnet-4-6 | 균형 | $3 / $15 |
| claude-haiku-4-5 | 빠름, 저비용 | $0.25 / $1.25 |

### OpenAI

| 모델 | 용도 | Input / Output USD/1M |
|---|---|---|
| gpt-4o | 범용, 빠름 | $2.50 / $10 |
| gpt-4o-mini | 저비용 | $0.15 / $0.60 |
| o1 / o3 | 추론 특화 | 높음 |

### Google

| 모델 | 용도 | Input / Output USD/1M |
|---|---|---|
| gemini-1.5-pro | 긴 컨텍스트 2M | $1.25 / $5 |
| gemini-1.5-flash | 저비용 | $0.075 / $0.30 |
| gemini-2.0-flash-exp | 실험 중 | 무료 |

### Upstage (한국어)

| 모델 | 용도 |
|---|---|
| solar-pro | 한국어 특화 |
| solar-mini | 저비용 한국어 |

### Local (Mode B)

| 도구 | 모델 예시 |
|---|---|
| vLLM | Llama-3-70B, Qwen-2.5-72B |
| Ollama | Llama-3, CodeLlama |

---

## 배정 기준 (PL-004-01)

```typescript
interface TaskCharacteristics {
  reasoning_depth: 'low' | 'medium' | 'high';
  context_length: number;   // 예상 토큰
  speed_priority: boolean;
  cost_sensitivity: boolean;
  korean_priority?: boolean;
}

function selectModel(task: TaskCharacteristics, mode: 'A'|'B'|'C'): string {
  if (mode === 'B') return selectLocalModel(task);
  
  // 규칙 우선순위
  if (task.reasoning_depth === 'high') return 'claude-opus-4-7';
  if (task.speed_priority && task.cost_sensitivity) return 'gpt-4o-mini';
  if (task.context_length > 500_000) return 'gemini-1.5-pro';
  if (task.korean_priority) return 'solar-pro';
  if (task.speed_priority) return 'gpt-4o';
  return 'claude-sonnet-4-6';  // 기본
}
```

---

## 라우팅 레이어

### Gridge 내부 라우터 (Mode A/C)

```typescript
// hubs/llm-hub.ts
export async function invokeLLM(request: LLMRequest): Promise<LLMResponse> {
  const model = resolveModel(request);   // 하네스 배정
  const vendor = detectVendor(model);    // 'anthropic' | 'openai' | 'google' | ...
  
  return vendorClients[vendor].invoke(model, request);
}
```

### SDK 추상화

```typescript
interface LLMClient {
  invoke(model: string, req: LLMRequest): Promise<LLMResponse>;
  stream(model: string, req: LLMRequest): AsyncIterable<LLMChunk>;
}

const vendorClients = {
  anthropic: new AnthropicClient(),
  openai: new OpenAIClient(),
  google: new GeminiClient(),
  upstage: new SolarClient(),
  local: new VLLMClient(),
};
```

---

## 응답 정규화

각 벤더 응답 차이 흡수:

```typescript
interface UnifiedResponse {
  content: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  model: string;
  finish_reason: 'stop' | 'length' | 'tool_use' | 'error';
}

// Anthropic → Unified
function normalizeAnthropic(raw): UnifiedResponse {
  return {
    content: raw.content[0].text,
    usage: {
      input_tokens: raw.usage.input_tokens,
      output_tokens: raw.usage.output_tokens,
    },
    model: raw.model,
    finish_reason: raw.stop_reason === 'end_turn' ? 'stop' : raw.stop_reason,
  };
}

// OpenAI → Unified
function normalizeOpenAI(raw): UnifiedResponse {
  return {
    content: raw.choices[0].message.content,
    usage: {
      input_tokens: raw.usage.prompt_tokens,
      output_tokens: raw.usage.completion_tokens,
    },
    model: raw.model,
    finish_reason: raw.choices[0].finish_reason,
  };
}
```

---

## Fallback 전략

### 벤더 장애 시 (SHOULD)

```
Anthropic Rate Limit / 500
  ↓
같은 급 OpenAI 로 fallback (Sonnet ↔ GPT-4o)
  ↓
고객 알림 + 감사 로그
```

### Mode C 예외 (G-088-03)

Mode C 에서 고객 API rate limit 초과 시 **Gridge 키로 fallback 금지**:
- 대기열 또는 사용자 알림만

---

## 내부 우선순위 비공개 (G-032-01)

이 문서는 **내부 레퍼런스**. 고객 / 파트너에게:
- ✅ "멀티 LLM 라우팅 지원"
- ❌ 구체 배정 기준 / 단가 테이블

---

## 참조

- 하네스 배정: `products/lucapus/orchestrators/harness.md` (PL-004)
- 모델 변경 금지 (고객): `02_architecture.md § 5` (G-025)
- G-032 멀티 LLM 원칙: `02_architecture.md § 12`
- Mode C API 키: `05_infra_mode.md § 8` (G-088)
- 세션 배지: `products/wiring/rules/session_badge.md` (PW-010)
- AiOPS 벤더별 채널: `products/aiops/channels/*.md`
