# AiOPS (AI 옵저버) — 제품 라우터

> AiOPS 작업 시 추가 로드되는 제품 라우터.
> 공통 규칙(rules/) + 이 라우터 + 필요 시 rules/ 하위 파일.
> 200줄 이내 유지.

---

## 0. 제품 개요

- **정체**: 엔터프라이즈 AI 사용 모니터링 & 역량 플랫폼. 조직 전체의 AI(Claude/ChatGPT/Gemini 등) 사용을 관찰·분석·코칭.
- **주 고객**: 10~200인 IT/개발 중심 조직 (관리진이 AI 사용 현황을 모르는 상태)
- **기술 스택**: Next.js 14 / TypeScript / Supabase / Node.js Express (프록시) / Python FastAPI (분석) / Chrome Extension MV3 / mitmproxy
- **핵심 상품 포인트**: API 10% 할인(비용 앵글) + 거버넌스 대시보드 + AI 성숙도 평가 + Next Step 추천
- **Wiring과의 관계**: Wiring에 내장. 단독 판매는 Wiring 미도입 고객 대상만.

---

## 1. AiOPS 작업 시 자동 로드 순서

```
ALWAYS_LOAD (이미 컨텍스트)
  ↓
rules/01_product.md / 03_hierarchy.md / 05_infra_mode.md / 08_security.md
  ↓
[이 파일]
  ↓
작업 유형별 추가 로드 (§ 3)
```

---

## 2. AiOPS 핵심 기능 매핑

| 기능 | PA-ID | 파일 |
|---|---|---|
| 데이터 모델 (logs / users / orgs) | PA-001 | `rules/data_model.md` |
| API 프록시 서버 (Anthropic/OpenAI/Gemini) ★ Sprint 1 | PA-002, PA-003 | `rules/proxy.md` |
| 3단 권한 체계 (super_admin / admin_teams / member) | PA-004 | `rules/auth.md` |
| 로그 수집 채널 (11개) | PA-005 | `rules/channels.md` |
| 브라우저 익스텐션 (Claude.ai / Gemini 웹) | PA-006 | `rules/extension.md` |
| 거버넌스 대시보드 (이상 탐지 / 민감 데이터 감지) | PA-007, PA-008 | `rules/governance.md` |
| 실시간 경고 + Slack/Email 알림 | PA-009 | `rules/alerts.md` |
| AI 성숙도 5단계 + Next Step 추천 | PA-010 | `rules/maturity.md` |
| 온프레미스 배포 (엔터프라이즈) | PA-011 | `rules/onprem.md` |

---

## 3. 작업 유형별 추가 로드

### 3.1 프록시 서버 (F/I 체인)

| 요청 키워드 | 추가 로드 |
|---|---|
| 프록시, BASE_URL, 환경변수, API wrap | `rules/proxy.md` + `rules/data_model.md` |
| 비동기 로깅, latency 최소화 | `rules/proxy.md § 성능` |
| org_id 토큰 발급 | `rules/auth.md` + `rules/proxy.md` |

### 3.2 채널 연동 (I 체인)

| 채널 | 방식 | 파일 |
|---|---|---|
| Anthropic API | `ANTHROPIC_BASE_URL` 환경변수 | `channels/anthropic.md` |
| OpenAI API | `OPENAI_BASE_URL` 환경변수 | `channels/openai.md` |
| Gemini API | `GOOGLE_BASE_URL` 환경변수 | `channels/gemini.md` |
| Claude Code | `.env` 1줄 | `channels/claude_code.md` |
| Cursor / Windsurf | 설정 UI 변경 | `channels/cursor_windsurf.md` |
| Claude.ai 웹 / Gemini 웹 | Chrome 익스텐션 (DOM 캡처) | `channels/extension_web.md` + `rules/extension.md` |
| ChatGPT 웹/모바일 | 공유 링크 수신 계정 + 크롤러 (Playwright) | `channels/chatgpt_crawler.md` |
| GitHub Copilot | mitmproxy + 인증서 설치 (IT팀 협조) | `channels/copilot_mitmproxy.md` |
| Notion AI | mitmproxy (공식 지원) | `channels/notion.md` |

### 3.3 거버넌스 (F 체인)

| 요청 키워드 | 추가 로드 |
|---|---|
| 이상 탐지, 비용 폭증, 급증 | `rules/governance.md § 이상 탐지` + `rules/alerts.md` |
| 민감 데이터, PII 감지, 카드번호 | `rules/governance.md § PII` + `rules/08_security.md` |
| 팀별 사용량, 개인 대시보드 | `rules/governance.md § 대시보드` |

### 3.4 AI 성숙도 & 코칭 (F 체인)

| 요청 키워드 | 추가 로드 |
|---|---|
| 성숙도 평가, Level 1~5, Maturity Score | `rules/maturity.md` |
| Next Step 추천, 단기/중기/장기 | `rules/maturity.md § Next Step` |
| 프롬프트 코칭, 재질문 감지 | `rules/maturity.md § 코칭` |

### 3.5 온프레미스 (F/I 체인)

| 요청 키워드 | 추가 로드 |
|---|---|
| 온프레 배포, 고객 서버 설치, 엔터프라이즈 | `rules/onprem.md` + `rules/05_infra_mode.md § 7` |
| 내부망, 데이터 격리, GDPR | `rules/onprem.md` + `rules/08_security.md` |

---

## 4. 데이터 모델 (PA-001)

핵심 테이블 3종:

| 테이블 | 용도 | 상세 |
|---|---|---|
| `logs` | 모든 AI 호출 기록 | session_id, user_id, org_id, timestamp, channel, model, prompt, response, input_tokens, output_tokens, cost, latency |
| `users` | AI 사용자 | user_id, org_id, name, role, team |
| `orgs` | 고객 조직 | org_id, name, api_token, plan (starter/growth/enterprise) |

전체 스키마: `schemas/INDEX.md` + `schemas/tables/*.md`.

---

## 5. AiOPS 전용 절대 규칙

이 제품 내부에서 위반 시 Conflict 자동 발동:

1. **로그 DB에 프롬프트 원문 저장 (고객 설정 무시)** — PA-008 위반 (프롬프트 저장 옵션 무시)
2. **org_id 없이 cross-org 쿼리** — G-144 위반
3. **민감 정보 감지 후 원문 저장** — G-140 위반 (PII 최소 수집)
4. **API 키를 프록시 서버 로그에 남김** — G-150 위반
5. **고객 API 키로 그릿지 자체 테스트 호출** — 신뢰 파괴
6. **AI 성숙도 점수를 고객 동의 없이 타사와 공유** — 익명 통계도 opt-in 필요

---

## 6. AiOPS 상품 BM

| 플랜 | 대상 | 가격 (월) | 포함 |
|---|---|---|---|
| Starter | ~20인 | ₩29만 | 모니터링 + 기본 코칭 |
| Growth | ~100인 | ₩99만 | 전체 기능 + 컴플라이언스 옵션 |
| Enterprise | 100인+ | 협의 | 전체 + 전담 CS + 온프레 옵션 |

**핵심 commercial hook**: API 10% 할인 (Anthropic/OpenAI/Upstage 파트너십 활용).

BM 상세: `01_product.md § 6` 와 정합.

---

## 7. 외부 노출 제한

이 제품을 고객/파트너에게 소개할 때 **사용하지 않을 용어** (G-004):
- "AI 옵저버" (내부 코드명, 외부 노출 OK이나 "AiOPS" 병기 권장)
- "mitmproxy" (기술 디테일, IT팀 협조 문맥에서만)
- "Playwright 크롤러" (기술 디테일, 고객에게 "주기적 수집"으로 표현)

사용 가능:
- "AI 거버넌스 플랫폼"
- "AI 사용 모니터링"
- "AI 역량 평가"

---

## 8. Sprint 1 (로그 수집 인프라) 범위

AiOPS 개발의 **최우선 스프린트**. 3~4일 내 완료 목표:

1. 로그 DB 스키마 (logs/users/orgs) + Supabase 마이그레이션
2. API 프록시 서버 (Anthropic/OpenAI/Gemini 호환, 비동기 로깅)
3. Claude Code 연동 (`ANTHROPIC_BASE_URL` 가이드 + 테스트)
4. Cursor/Windsurf 연동 가이드
5. org_id 기반 고객사 식별 토큰 발급

완료 기준: **채널별 로그가 DB에 정상 적재**.

상세: 프로젝트 knowledge `Antigravity_개발_명령어___Sprint_1__로그_수집_.md` 참조 (내부).

---

## 9. 제품 라우터 크기 제한 준수

이 파일 ≤ 200줄. 초과 시 `rules/` 또는 `channels/` 로 분할.

개별 규칙 본문은 여기에 적지 않음. ID와 파일 위치만.
