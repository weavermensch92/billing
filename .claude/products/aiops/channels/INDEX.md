# AiOPS / Channels — INDEX

> PA-005 (채널 카탈로그) 의 세부 구현 파일 인덱스.
> Sprint 1/2/3 순차 진행 (PA-005 정합).

---

## Sprint 1 (Week 1-4): API 프록시 3종

| 채널 | 파일 | 완전성 | 난이도 |
|---|---|---|---|
| Anthropic API | `anthropic.md` | ✅ 100% | 🟢 낮음 |
| OpenAI API | `openai.md` | ✅ 100% | 🟢 낮음 |
| Gemini API | `gemini.md` | ✅ 100% | 🟢 낮음 |
| Claude Code CLI | `claude_code.md` | ✅ 100% | 🟢 낮음 |

**공통 패턴**: 프록시 서버 경유 + 환경 변수 1줄 변경.

## Sprint 2 (Week 5-6): 웹 채널

| 채널 | 파일 | 완전성 |
|---|---|---|
| Cursor (BASE_URL) | `cursor.md` | ⚠️ 90% |
| ChatGPT 웹 (크롤러) | `chatgpt_crawler.md` | ⚠️ 70% |
| Claude.ai / Gemini 웹 (Extension) | `extension_web.md` | ⚠️ 80% |

## Sprint 3 (파일럿 후)

추후 추가: GitHub Copilot (mitmproxy) / Slack AI / LangChain SDK.

## 공통 원칙

- PA-003 비동기 로깅 (latency 영향 최소화)
- PA-007 PII 감지 룰 공통 적용
- Mode B: Gridge 서버 경유 금지 (고객 인프라 내부 프록시만)
- 외부 노출 금지: 내부 구현 상세 고객 UI 에 X (G-004)

## 참조

- 채널 카탈로그: `products/aiops/rules/channels.md` (PA-005)
- 프록시 규칙: `products/aiops/rules/proxy.md` (PA-002/003)
- 브라우저 확장: `products/aiops/rules/extension.md` (PA-006)
- 로그 모델: `products/aiops/rules/data_model.md` (PA-001)
