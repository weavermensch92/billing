# Skills — 라우터

> 기술 레퍼런스 카탈로그. 특정 기술 사용 시 F 체인이 참조 로드.
> **규칙이 아닌 가이드** — 강제 수준 없음.

---

## 카탈로그 (디렉토리 구조)

| 디렉토리 | 기술 영역 | 연관 규칙 |
|---|---|---|
| `nextjs/` | Next.js 14 (App Router) + Server Actions | PW-*, Wiring 프론트 전반 |
| `supabase/` | Supabase (DB + Auth + RLS + Realtime) | 모든 schemas/, G-144 RLS |
| `react-flow/` | React Flow + Dagre (파이프라인/규칙그래프) | PW-002~005, PW-012 |
| `paperclip/` | Paperclip (Node.js 오케스트레이션 엔진) | PL-002~004, I-002 |
| `claude-api/` | Anthropic Claude API + SDK + MCP | 하네스 / 모든 에이전트 구현 |
| `multi-llm-routing/` | 멀티 LLM 라우팅 (Claude/GPT/Gemini/Solar) | PL-004 하네스 |
| `chrome-extension/` | Manifest V3 개발 | PA-006, extension_web |
| `frontend-design/` | 글래스모피즘 + Tailwind + shadcn/ui | PW-001 디자인 토큰 |

각 디렉토리의 `CLAUDE.md` = 주 가이드. 하위에 추가 파일 허용 (예: `nextjs/server-actions.md`).

---

## 로드 우선순위 (F 체인 자동)

| 요청 키워드 | 자동 로드 |
|---|---|
| Next.js / App Router / Server Component / SSR | `nextjs/CLAUDE.md` |
| Supabase / RLS / Realtime / migration | `supabase/CLAUDE.md` |
| React Flow / Dagre / 노드 / 엣지 | `react-flow/CLAUDE.md` |
| Paperclip / 오케스트레이션 엔진 | `paperclip/CLAUDE.md` |
| Anthropic SDK / Claude API / Messages / MCP | `claude-api/CLAUDE.md` |
| Chrome Extension / Manifest V3 / content script | `chrome-extension/CLAUDE.md` |
| 멀티 LLM / 모델 라우팅 / 벤더 비교 | `multi-llm-routing/CLAUDE.md` |
| 글래스모피즘 / Tailwind / shadcn / 디자인 토큰 | `frontend-design/CLAUDE.md` |

---

## 로컬 스킬과의 관계

`.context/skills/` = 이 프로젝트 전용 패턴. 여기 `.claude/skills/` = 범용 가이드.
3회+ 감지된 로컬 패턴 중 가치 있는 건 여기로 승격 제안 (PL-009-03).

---

## 공통 원칙

- **최신 버전 사전 확인**: 작성 시점 기준. 실제 사용 시 최신 docs 확인 필수
- **외부 노출 금지**: `paperclip` 등 내부 엔진 이름 고객 UI 에 노출 X (G-004)
- **프라이버시**: 스킬 파일에 고객 데이터 / 내부 시크릿 포함 X

---

## 참조

- Wiring 디자인 토큰: `products/wiring/rules/design.md` (PW-001)
- React Flow 사용처: `products/wiring/rules/pipeline_view.md` (PW-002~005)
- 하네스 모델 배정: `products/lucapus/orchestrators/harness.md` (PL-004)
- AiOPS 익스텐션: `products/aiops/rules/extension.md` (PA-006)
- 로컬 스킬: `.context/skills/README.md`
