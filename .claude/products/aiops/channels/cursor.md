# AiOPS / Channels / Cursor — 규칙 본문

> PA-005-05 본문. Cursor AI 코드 에디터 로깅. BASE_URL 설정 기반.

---

## 연동

Cursor 는 Settings UI 에서 OpenAI-호환 endpoint 설정 가능:

```
Cursor Settings → Models → OpenAI API
  OpenAI Base URL: https://proxy.gridge.ai/openai
  API Key: <고객사_org_token>
  Override OpenAI Base URL: ✅
  Use your own API Key: ✅
```

### 한계

- Cursor 의 내장 (Anysphere 자체 모델 / Composer) 는 **프록시 불가**
- BASE_URL 을 바꿔도 Cursor 내장 기능은 Anysphere 서버 직접 호출
- 고객이 "Use your own API Key" 체크한 대화 / 코드 완성만 로깅 가능

### 완전성: ⚠️ 90% (OpenAI 모드 사용자만)

---

## 로깅되는 요청

Cursor 가 `OPENAI_BASE_URL` 로 보내는 요청:
- Chat (Cmd+K / Cmd+L)
- Composer (멀티 파일 편집)
- Apply suggestion (Ghost Text)

엔드포인트: `/v1/chat/completions` (OpenAI 호환)

### User-Agent 판별

```typescript
function detectChannel(req): Channel {
  const ua = req.headers['user-agent'] || '';
  if (ua.includes('Cursor')) return 'cursor';
  return 'openai_api';
}
```

Cursor 버전별 UA 포맷 다름 → `/cursor|anysphere/i` 정규식 추천.

---

## 추가 메타 (Cursor 특수)

- 작업 파일 경로 (`meta.file_path` 필드 — Cursor 가 보내면)
- 선택 영역 (`meta.selection`)
- 프로젝트 루트

대부분 system 프롬프트 안에 포함됨 → 파싱으로 추출.

---

## Windsurf / Continue 등

동일 패턴 (BASE_URL 변경). channel 구분만 UA 로:
- Windsurf: `Codeium/Windsurf`
- Continue: `continue-dev` 또는 VS Code extension id

채널 추가는 단순 추가 (이 파일 확장):
```typescript
const CURSOR_COMPATIBLE_CHANNELS = {
  'Cursor': 'cursor',
  'Windsurf': 'windsurf',
  'continue-dev': 'continue',
};
```

---

## 자동 검증 체크리스트

- [ ] Cursor 내장 모드 (Composer) 사용량이 대시보드에 0 으로 표시 (고객 혼동)?
- [ ] 로깅된 파일 경로가 PII/시크릿 감지 없이 저장?
- [ ] User-Agent 변경에 대응 안 되는 하드코딩된 패턴?

---

## 참조

- OpenAI 프록시: `channels/openai.md`
- PA-005 채널 우선순위: `products/aiops/rules/channels.md`
