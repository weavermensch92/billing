# AiOPS / Channels — 규칙 본문

> PA-005 본문. AiOPS가 지원하는 **로그 수집 채널 11종**과 각각의 연동 방식.
> 각 채널의 커버리지 / 난이도 / 구현 전략.

---

## PA-005 — 채널 카탈로그 (MUST)

### Sprint 1 지원 (4종)

| 채널 | 수집 방식 | 커버리지 | 난이도 | 상세 |
|---|---|---|---|---|
| Anthropic API | 프록시 서버 | 100% | 🟢 낮음 | `channels/anthropic.md` |
| OpenAI API | 프록시 서버 | 100% | 🟢 낮음 | `channels/openai.md` |
| Gemini API | 프록시 서버 | 100% | 🟢 낮음 | `channels/gemini.md` |
| Claude Code | 프록시 서버 (env var) | 100% | 🟢 낮음 | `channels/claude_code.md` |

### Sprint 2 지원 (4종)

| 채널 | 수집 방식 | 커버리지 | 난이도 |
|---|---|---|---|
| Cursor | 프록시 서버 (설정 UI) | 90% | 🟡 중간 |
| Windsurf | 프록시 서버 (설정 UI) | 90% | 🟡 중간 |
| Claude.ai 웹 | Chrome 익스텐션 (DOM) | 80% | 🟡 중간 |
| Gemini 웹 | Chrome 익스텐션 (DOM) | 80% | 🟡 중간 |

### Sprint 3 지원 (3종)

| 채널 | 수집 방식 | 커버리지 | 난이도 |
|---|---|---|---|
| ChatGPT 웹/앱 | 공유 링크 + Playwright 크롤러 | 70% | 🟡 중간 |
| GitHub Copilot | mitmproxy (IT팀 협조) | 80% | 🔴 높음 |
| Notion AI | mitmproxy (공식 지원) | 75% | 🔴 높음 |

### 미지원 (기술적 불가)

- Claude / ChatGPT 모바일 앱 (네이티브 네트워크 후킹 불가)
- Slack AI (API 제한적, Sprint 4+ 검토)

---

## PA-005-01 — 수집 방식 3종 (MUST)

### 방식 1: API 프록시 (Sprint 1~2)

```
고객 앱/에디터 → proxy.gridge.ai → 원본 API
               └── logs 테이블 ──┘
```

**장점:** 100% 커버리지, latency ≤ 30ms, 에러/재시도까지 포착
**단점:** BASE_URL 변경 필요 (고객 측 작업 1회)

**적용:** 환경변수/설정 변경 가능한 모든 채널

### 방식 2: 브라우저 익스텐션 (Sprint 2)

```
사용자 브라우저 → 익스텐션 (DOM 감지) → 우리 서버
```

**장점:** API 없는 웹 UI 수집 가능
**단점:** 커버리지 80% (DOM 변경 대응 필요), 대용량 응답 누락 가능, 설치 강제 필요

**적용:** Claude.ai / ChatGPT.com / Gemini.google.com

### 방식 3: 공유 링크 크롤러 (Sprint 3)

```
사용자가 ChatGPT 대화 → "공유" → 수신 계정 (Gridge 전용) → Playwright 크롤러
```

**장점:** 익스텐션 설치 불필요
**단점:** 커버리지 70% (사용자 행동 의존), 실시간 아님 (15분 주기)

**적용:** ChatGPT 웹/앱 (익스텐션이 불편한 모바일 유저 대상)

### 방식 4: mitmproxy (Sprint 3)

```
고객 네트워크 전체 → mitmproxy (인증서 설치) → 원본 API
                 └── 로그 서버 ─────┘
```

**장점:** 앱 변경 불필요, 모든 트래픽 포착
**단점:** IT팀 협조 필수, 인증서 관리 복잡, 엔터프라이즈 전용

**적용:** GitHub Copilot, Notion AI (BASE_URL 불가 / 비공식)

---

## PA-005-02 — 채널별 온보딩 소요 시간 (SHOULD)

| 채널 | 연동 시간 | 고객 작업 |
|---|---|---|
| Claude Code | 5분 | `.env` 파일 1줄 추가 |
| Cursor / Windsurf | 10분 | 설정 UI 2~3클릭 |
| OpenAI API / Anthropic API / Gemini API | 10분 | 환경변수 1줄 변경 |
| 브라우저 익스텐션 | 10분 | 크롬 익스텐션 설치 + 토큰 입력 |
| ChatGPT 공유 링크 | 5분 + 사용자 교육 | 대시보드 > 링크 등록 |
| GitHub Copilot (mitmproxy) | IT팀 1일 | 프록시 배포 + 인증서 MDM 배포 |
| Notion AI (mitmproxy) | IT팀 반나절 | 프록시 설정 |

---

## PA-005-03 — 채널 활성/비활성 관리 (MUST)

### DB 필드

`orgs.active_channels text[]` (PA-001 참조):

```sql
-- 예시
UPDATE orgs
SET active_channels = ARRAY[
  'anthropic_api',
  'claude_code',
  'extension_web',
  'chatgpt_crawler'
]
WHERE id = $1;
```

### UI (설정 > 연동 설정)

- 11개 채널 카드 그리드 표시
- 각 카드: 채널명 / 상태 배지 (연동됨 / 미연동) / [연동하기] [설정] [테스트] [해제]
- "연동됨" 카드는 실시간 수집 상태 표시 (마지막 로그 N분 전)

### 활성 기준

로그가 **최근 24시간 내** 1건 이상 기록되었는가:

```sql
SELECT DISTINCT channel
FROM logs
WHERE org_id = $1
  AND timestamp > now() - INTERVAL '24 hours';
```

24시간 이상 로그 없으면 대시보드에 "⚠ 수집 중단?" 경고.

---

## PA-005-04 — 채널 분류 원칙 (MUST)

### 필수 채널 (최소 온보딩)

**Starter 플랜 최소 요건:**
- Claude Code 또는 Cursor 또는 Windsurf (개발자 주 도구 1개)

**Growth 플랜 최소 요건:**
- 위 + Anthropic/OpenAI/Gemini API 중 1개 (프로덕션 앱)
- 위 + 브라우저 익스텐션 (비개발자 포함)

### 선택 채널

- ChatGPT 공유 링크 (모바일 사용자 포함)
- mitmproxy 계열 (Copilot / Notion — Enterprise에서만)

---

## PA-005-05 — 채널별 세션 묶음 (MUST)

`logs.session_id` 는 대화방 단위로 묶임. 채널별로 기준 다름:

| 채널 | 세션 기준 |
|---|---|
| Anthropic API / OpenAI API / Gemini API | 고객이 `x-session-id` 헤더로 지정 (없으면 요청당 UUID) |
| Claude Code | 자동 session_id (Claude Code 내부 conversation_id) |
| Cursor / Windsurf | 탭/파일 단위 (에디터가 지정) |
| Chrome 익스텐션 | Claude.ai conversation URL 해시 |
| ChatGPT 크롤러 | 공유 링크의 conversation_id |
| mitmproxy | 클라이언트 IP + 시작 시각 기반 (휴리스틱) |

### 세션 묶음 목적

- "재질문 패턴 감지" (PA-009): 같은 세션 내 유사 프롬프트 3+
- "세션 깊이 계산" (Sprint 2): 평균 대화 턴 수
- "코칭 트리거": 재질문 많으면 프롬프트 가이드 발송

---

## PA-005-06 — 채널 연동 테스트 (MUST)

각 채널에 연결 테스트 엔드포인트 제공:

```typescript
// POST /api/channels/test
{
  "channel": "claude_code",
  "org_token": "<고객사 토큰>"
}

→ 응답:
{
  "success": true,
  "test_log_id": "uuid",
  "latency_ms": 124,
  "message": "Test log recorded. Check dashboard."
}
```

테스트 로그는 `logs.channel = 'test'` 로 별도 채널 값 부여 → 실 통계에서 제외.

---

## PA-005-07 — 채널별 비용 / 모델 파싱 (MUST)

각 채널마다 `model` 필드 추출 방식 다름:

```typescript
function extractModel(channel: string, reqBody: any, reqPath: string): string {
  switch (channel) {
    case 'anthropic_api':
    case 'claude_code':
      return reqBody.model;  // 'claude-sonnet-4-6'

    case 'openai_api':
    case 'cursor':
    case 'windsurf':
      return reqBody.model;  // 'gpt-4o'

    case 'gemini_api':
      // 경로에서 추출: /v1/models/gemini-2.0-flash:generateContent
      return reqPath.match(/models\/([^:]+)/)?.[1] ?? 'unknown';

    case 'extension_web':
      // 익스텐션이 DOM에서 감지한 모델명
      return reqBody.meta?.model ?? 'unknown';

    case 'chatgpt_crawler':
      // 공유 링크에서 모델 감지 어려움 (ChatGPT가 공개 안 함)
      return 'gpt-4-unknown';

    case 'copilot_mitmproxy':
      // Copilot은 내부적으로 여러 모델 혼용
      return 'copilot';

    default:
      return 'unknown';
  }
}
```

---

## PA-005-08 — 채널 비활성화 (MUST)

super_admin 이 설정 > 연동 해제 시:

1. 해당 채널의 새 로그 수신 거부 (프록시가 403 반환)
2. 기존 로그는 유지 (감사 목적)
3. 대시보드 통계에서 "비활성" 배지 표시
4. 감사 로그 기록 (G-141)

```sql
UPDATE orgs
SET active_channels = array_remove(active_channels, 'cursor')
WHERE id = $1;
```

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] 지원 범위 외 채널 이름을 `logs.channel` 에 저장?
- [ ] 채널 연동 테스트가 실 통계에 포함?
- [ ] 모바일 앱 수집 시도 (기술적 불가)?
- [ ] mitmproxy 인증서를 Gridge 서버에 저장 (보안 위험)?
- [ ] `orgs.active_channels` 비어있는데 해당 채널 로그 기록?
- [ ] 채널 비활성 후에도 프록시가 로그 받음?

---

## 참조

- 프록시 구현: `products/aiops/rules/proxy.md` (PA-002~003)
- 브라우저 익스텐션: `products/aiops/rules/extension.md` (PA-006)
- 이상 감지 (재질문/비용 폭증): `products/aiops/rules/governance.md` (PA-007~008)
- 온프레 (mitmproxy 자체 호스팅): `products/aiops/rules/onprem.md` (PA-011)
- 채널별 가이드 파일: `products/aiops/channels/*.md` (작성 예정)
- 개별 채널 구현 예시: 프로젝트 knowledge `로그_수집_채널_전체_리스트업___개발_계획.md`
