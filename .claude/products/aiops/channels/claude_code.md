# AiOPS / Channels / Claude Code — 규칙 본문

> PA-005-04 본문. Claude Code CLI 로깅. Anthropic 프록시의 특수 사용 사례.

---

## 연동 (개발자 환경)

```bash
# ~/.zshrc 또는 ~/.bashrc
export ANTHROPIC_BASE_URL=https://proxy.gridge.ai/anthropic
export ANTHROPIC_AUTH_TOKEN=<고객사_org_token>
```

Claude Code 재시작 시 환경 변수 재로드.

---

## 추가 수집 데이터 (vs 단순 API)

Claude Code 는 에이전트 형태로 작동 → 더 풍부한 컨텍스트 수집 가능:

| 데이터 | 수집 방법 |
|---|---|
| 작업 디렉토리 | system 프롬프트에 포함된 `<cwd>` 파싱 |
| 참조 파일 목록 | tool_use 블록 분석 (Read / Edit 등) |
| 툴 사용 패턴 | tool_use 이벤트 집계 |
| 세션 길이 | conversation 턴 수 |
| 대화 흐름 | user/assistant 교차 패턴 |

---

## channel 식별

- 요청 헤더 `x-api-source: claude-code` 또는 `user-agent` 에 `claude-code`
- 없으면 system 프롬프트 내용으로 판별 (Anthropic/claude-code 키워드)

```typescript
function detectChannel(req): Channel {
  const ua = req.headers['user-agent'] || '';
  if (ua.includes('claude-code')) return 'claude_code';
  if (ua.includes('claude-cowork')) return 'claude_cowork';
  // ... 기타 SDK/CLI 판별
  return 'anthropic_api';  // 기본
}
```

---

## 툴 사용 로깅

Claude Code 가 많이 사용하는 tools:
- `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`

로그 엔트리에 `tools_used` 배열 추가:
```typescript
{
  channel: 'claude_code',
  tools_used: ['Read:package.json', 'Bash:npm install', 'Edit:src/server.ts'],
  tool_count: 3,
}
```

파일 경로 / 명령어 원문 저장 시 **PII/시크릿 감지** 필수 (PA-007).

---

## 개발자 프라이버시

Claude Code 사용자 = 개발자. 로그에 민감 데이터 포함 가능성 높음:
- 코드 조각 (사내 소스)
- API 키 / DB URL (에러 메시지에 섞임)
- 고객 데이터 샘플 (디버깅 과정)

### 완화

- 프롬프트 **요약만** 기본 저장 (원문 X)
- 원문 저장은 OA 명시 opt-in (PA-007)
- gitleaks 패턴 실시간 감지 → 매치 시 해당 필드 마스킹

---

## Mode B 고려

온프레 고객의 Claude Code → 고객 내부 프록시 → 고객 LLM 서버 (vLLM):
```bash
export ANTHROPIC_BASE_URL=https://aiops-proxy.internal.acme.kr/anthropic
```

이 경우 Anthropic 공식 API 호출 없음 — Claude Code 가 Anthropic SDK 와 완전 호환되는 로컬 모델 필요 (예: Claude 호환 서빙).

---

## 자동 검증 체크리스트

- [ ] `tools_used` 에 절대 경로 / API 키 포함?
- [ ] PII 감지 없이 `Edit` 툴 원문 저장?
- [ ] Mode B 환경인데 `api.anthropic.com` 으로 직접 호출 (외부 반출)?

---

## 참조

- Anthropic 프록시 구현: `channels/anthropic.md`
- PA-007 PII 감지 10종: `products/aiops/rules/governance.md`
- G-150 시크릿 로그 노출 금지: `08_security.md § 9`
