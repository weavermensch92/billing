# AiOPS / Channels / Anthropic — 규칙 본문

> PA-005-01 본문. Anthropic API 프록시 구현.
> Sprint 1 우선 구축. 완전성 100%.

---

## 개요

### 연동 방식

```
기존: 고객 앱 → api.anthropic.com
변경: 고객 앱 → proxy.gridge.ai/anthropic → api.anthropic.com
```

### 고객 설정 (환경변수 1줄)

```bash
export ANTHROPIC_BASE_URL=https://proxy.gridge.ai/anthropic
export ANTHROPIC_AUTH_TOKEN=<고객사_org_token>  # X-Org-Token 헤더로 사용
```

---

## 구현 상세

### 라우팅

```typescript
// proxy/anthropic.ts
app.post('/anthropic/v1/messages', async (req, res) => {
  const orgToken = req.headers['x-org-token'] || extractAuthHeader(req);
  const org = await validateOrgToken(orgToken);
  if (!org) return res.status(401).json({ error: 'Invalid token' });

  // Upstream 호출
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,  // Gridge 관리 키 또는 고객 키
      'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(req.body),
  });

  const response = await upstream.json();

  // 응답 먼저 반환 (latency 영향 X, PA-003)
  res.status(upstream.status).json(response);

  // 비동기 로깅
  queueMicrotask(() => {
    logRequest({
      org_id: org.id,
      channel: 'anthropic_api',
      model: response.model,
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
      cost_usd: calcCost(response.model, response.usage),
      prompt_summary: summarize(req.body.messages),  // PA-007 PII 마스킹 적용
      latency_ms: Date.now() - startTime,
    });
  });
});
```

### 스트리밍 처리

```typescript
if (req.body.stream) {
  const upstream = await fetch(UPSTREAM_URL, { ... });
  
  let capturedText = '';
  let capturedUsage = null;

  // 스트림 파이프 + 로깅용 캡처
  const reader = upstream.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    res.write(value);  // 클라이언트에 전달
    
    // SSE 파싱 → 텍스트 누적
    parseSSE(value, (event) => {
      if (event.type === 'content_block_delta') capturedText += event.delta.text;
      if (event.type === 'message_stop') capturedUsage = event.usage;
    });
  }
  res.end();

  // 완료 후 로깅
  await logRequest({ ..., response_summary: capturedText.slice(0, 500), usage: capturedUsage });
}
```

### 에러 처리

- Upstream 에러 (4xx/5xx) → 원문 그대로 클라이언트에 전달
- 로깅 실패 → 에러 큐 보관, 재시도 3회 (PA-003)
- Rate limit (429) → `Retry-After` 헤더 전달

### 비용 계산

PA-001 단가표 기반:
```typescript
function calcCost(model: string, usage: Usage): number {
  const rate = PRICING_TABLE[model];  // USD/1M tokens
  if (!rate) return 0;
  return (usage.input_tokens * rate.input + usage.output_tokens * rate.output) / 1_000_000;
}
```

---

## Mode 별 동작

| Mode | Upstream | API 키 |
|---|---|---|
| A | api.anthropic.com | Gridge 관리 키 |
| B | 고객 내부 vLLM (또는 없음) | 고객 자체 |
| C | api.anthropic.com | **고객 API 키** (proxy 는 pass-through) |

Mode C 핵심: 고객 키는 Gridge 서버 저장 X, 매 요청 헤더로만 전달 (G-088).

---

## 자동 검증 체크리스트

- [ ] 로깅 실패가 응답을 차단?
- [ ] Mode C 에서 고객 API 키를 Gridge DB 저장?
- [ ] PII 감지 없이 프롬프트 원문 그대로 저장 (PA-007 위반)?
- [ ] 스트리밍 응답이 캡처 때문에 지연?
- [ ] Anthropic version 헤더 누락으로 400 에러?

---

## 참조

- PA-002 프록시 원칙 / PA-003 비동기 로깅: `products/aiops/rules/proxy.md`
- PA-001 비용 단가표: `products/aiops/rules/data_model.md`
- PA-007 PII 감지: `products/aiops/rules/governance.md`
- G-088 Mode C API 키 원칙: `05_infra_mode.md § 8`
