# AiOPS / Channels / Gemini — 규칙 본문

> PA-005-03 본문. Google Gemini API 프록시.

---

## 연동

```bash
export GOOGLE_API_ENDPOINT=https://proxy.gridge.ai/gemini
export GEMINI_API_KEY=<고객사_org_token>
```

Google SDK 기본 endpoint 는 `generativelanguage.googleapis.com` — 프록시로 대체 가능.

---

## 지원 엔드포인트

| 엔드포인트 | 용도 |
|---|---|
| `/v1/models/{model}:generateContent` | 일반 생성 |
| `/v1/models/{model}:streamGenerateContent` | 스트리밍 |
| `/v1/models/{model}:countTokens` | 토큰 카운트 |

---

## 구현

```typescript
app.post('/gemini/v1/models/:model\\:generateContent', async (req, res) => {
  const orgToken = req.query.key || req.headers['x-goog-api-key'];
  const org = await validateOrgToken(orgToken);
  if (!org) return res.status(401).json(...);

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${req.params.model}:generateContent?key=${getUpstreamKey(org)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body),
    }
  );

  const response = await upstream.json();
  res.status(upstream.status).json(response);

  queueMicrotask(() => logRequest({
    org_id: org.id,
    channel: 'gemini_api',
    model: req.params.model,
    input_tokens: response.usageMetadata?.promptTokenCount,      // ⚠ Gemini 는 camelCase
    output_tokens: response.usageMetadata?.candidatesTokenCount,
    cost_usd: calcCost(req.params.model, response.usageMetadata),
    prompt_summary: summarize(req.body.contents),
  }));
});
```

### Gemini 특수 사항

- 인증: API key **query parameter** (`?key=`) 또는 `x-goog-api-key` 헤더
- 사용량 필드: `usageMetadata.promptTokenCount` / `candidatesTokenCount` / `totalTokenCount`
- 멀티모달 입력: `contents[].parts[].inlineData` (이미지 Base64) — 로깅 시 **메타만** (크기/MIME만)

---

## 비용 단가 (참고)

| 모델 | Input $/1M | Output $/1M |
|---|---|---|
| gemini-1.5-pro | $1.25 | $5.00 |
| gemini-1.5-flash | $0.075 | $0.30 |
| gemini-2.0-flash-exp | (실험 중 무료) | — |

PA-001 단가표에 등록.

---

## Vertex AI (별도 채널 고려)

구글 엔터프라이즈는 Vertex AI (`{region}-aiplatform.googleapis.com`) 사용. 인증은 OAuth2 / GCP 서비스 계정.
프록시 구현 난이도 ↑ → Sprint 3 이후 별도 채널 (`vertex_ai`) 로 분리.

---

## 자동 검증 체크리스트

- [ ] API key 를 query string 으로 upstream 전달 시 로그 URL 에 key 노출 (G-150 위반)?
- [ ] Gemini 이미지/비디오 입력 원문을 Gridge DB 저장?
- [ ] `usageMetadata` camelCase → snake_case 정규화 누락?

---

## 참조

- 공통: `products/aiops/rules/proxy.md` (PA-002/003)
- 시크릿 로그 노출 금지: `08_security.md § 9` (G-150)
