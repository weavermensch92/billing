# AiOPS / Channels / OpenAI — 규칙 본문

> PA-005-02 본문. OpenAI API 프록시. 호환 API (Azure OpenAI 등) 도 커버.

---

## 연동

```bash
export OPENAI_BASE_URL=https://proxy.gridge.ai/openai
export OPENAI_API_KEY=<고객사_org_token>  # Authorization: Bearer 헤더
```

Azure OpenAI:
```bash
export AZURE_OPENAI_ENDPOINT=https://proxy.gridge.ai/azure-openai
export AZURE_OPENAI_API_KEY=<고객사_org_token>
```

---

## 지원 엔드포인트

| 엔드포인트 | 용도 | 로깅 |
|---|---|---|
| `/v1/chat/completions` | 메인 대화 | ✅ |
| `/v1/completions` | 레거시 | ✅ |
| `/v1/embeddings` | 임베딩 | ✅ (input 텍스트만 요약) |
| `/v1/images/generations` | DALL-E | ✅ (prompt 만) |
| `/v1/audio/transcriptions` | Whisper | ✅ (메타만) |

---

## 구현

```typescript
app.post('/openai/v1/chat/completions', async (req, res) => {
  const orgToken = extractBearer(req.headers.authorization);
  const org = await validateOrgToken(orgToken);
  if (!org) return res.status(401).json(...);

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${getUpstreamKey(org)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(req.body),
  });

  const response = await upstream.json();
  res.status(upstream.status).json(response);

  queueMicrotask(() => logRequest({
    org_id: org.id,
    channel: 'openai_api',
    model: response.model,
    input_tokens: response.usage?.prompt_tokens,      // ⚠ OpenAI 는 prompt_tokens
    output_tokens: response.usage?.completion_tokens, // ⚠ completion_tokens
    cost_usd: calcCost(response.model, response.usage),
    prompt_summary: summarize(req.body.messages),
  }));
});
```

### OpenAI vs Anthropic 필드 차이

- Anthropic `usage.input_tokens` / `output_tokens`
- OpenAI `usage.prompt_tokens` / `completion_tokens` (`total_tokens` 도 있음)

로깅 레이어에서 통일:
```typescript
const normalized = {
  input_tokens: u.input_tokens ?? u.prompt_tokens,
  output_tokens: u.output_tokens ?? u.completion_tokens,
};
```

---

## Azure OpenAI 특수 처리

Azure 는 배포 이름 기반 URL:
```
https://{resource}.openai.azure.com/openai/deployments/{deployment-id}/chat/completions?api-version=2024-02-01
```

프록시가 `?api-version=` query 유지 필요.

---

## 스트리밍

SSE 방식. 마지막 chunk 의 `data: [DONE]` 후 `usage` 를 별도 chunk 로 보냄 (stream_options.include_usage=true 설정 시).

로깅은 스트림 완료 후 `usage` 캡처 필요:
```typescript
parseSSE(chunk, (event) => {
  if (event.choices) capturedText += event.choices[0]?.delta?.content || '';
  if (event.usage) capturedUsage = event.usage;  // 마지막 chunk
});
```

---

## 이미지 생성 (DALL-E)

```typescript
app.post('/openai/v1/images/generations', async (req, res) => {
  // prompt / n / size 로깅
  // 응답 이미지 URL 은 저장 X (URL TTL 있음)
});
```

비용: DALL-E 3 standard `$0.040 / 이미지`, HD `$0.080 / 이미지`.

---

## 자동 검증 체크리스트

- [ ] `prompt_tokens` / `completion_tokens` → 정규화 필드로 통일?
- [ ] Azure api-version query 누락으로 400?
- [ ] 이미지 / 오디오 응답을 그릿지 DB 저장 (크기 문제)?
- [ ] `stream_options.include_usage` 없이 스트리밍 로깅 (usage 누락)?

---

## 참조

- 공통: `products/aiops/rules/proxy.md` (PA-002/003)
- Anthropic 프록시: `channels/anthropic.md`
- 비용 단가표: `products/aiops/rules/data_model.md`
