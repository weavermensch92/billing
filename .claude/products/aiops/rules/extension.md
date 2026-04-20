# AiOPS / Extension — 규칙 본문

> PA-006 본문. Claude.ai / ChatGPT.com / Gemini.google.com 웹 UI의 DOM을 감지하여 로그 수집.
> Chrome Extension Manifest V3 기반.

---

## PA-006 — 브라우저 익스텐션 (MUST)

### 목적

**API가 없는 웹 UI 채널** (Claude.ai / ChatGPT / Gemini 웹) 의 사용 로그 수집.

### 기술 스택

- Chrome Extension **Manifest V3** 필수 (V2는 2023년부터 deprecated)
- `content_script` : 대상 사이트 DOM 감지
- `service_worker` (background) : 서버 전송 + 토큰 관리
- `popup.html` : org 토큰 입력 UI + 상태 표시

### 대상 사이트

| 사이트 | 도메인 | 감지 대상 DOM | 모델 추출 |
|---|---|---|---|
| Claude.ai | `claude.ai` | `[data-testid='conversation']` | URL 쿼리 / DOM 메타 |
| ChatGPT | `chatgpt.com`, `chat.openai.com` | `[data-message-author-role]` | 상단 모델 선택 버튼 |
| Gemini | `gemini.google.com` | `message-content` | URL path |

---

## PA-006-01 — Manifest (MUST)

```json
{
  "manifest_version": 3,
  "name": "Gridge AiOPS Logger",
  "version": "1.0.0",
  "description": "AI usage monitoring for enterprise teams",
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://claude.ai/*",
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://gemini.google.com/*",
    "https://proxy.gridge.ai/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://claude.ai/*",
        "https://chatgpt.com/*",
        "https://chat.openai.com/*",
        "https://gemini.google.com/*"
      ],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icon.png"
  },
  "icons": {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png"
  }
}
```

### 권한 최소화 (G-140)

- `host_permissions`: 4개 사이트만 (전체 웹 접근 권한 X)
- `permissions`: `storage` (토큰 보관) + `activeTab` (현재 탭만)
- `<all_urls>` 권한 **절대 요청 금지** (감사 통과 불가)

---

## PA-006-02 — DOM 감지 원칙 (MUST)

### MutationObserver 기반

```typescript
// content.js
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (isMessageNode(node)) {
        extractAndSend(node);
      }
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});
```

### 사이트별 감지 함수

```typescript
function isMessageNode(node: Node): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;

  // Claude.ai
  if (location.hostname === 'claude.ai') {
    return node.matches('[data-testid="conversation-message"]');
  }

  // ChatGPT
  if (location.hostname.includes('chatgpt') || location.hostname.includes('openai')) {
    return !!node.querySelector?.('[data-message-author-role]');
  }

  // Gemini
  if (location.hostname === 'gemini.google.com') {
    return node.tagName === 'MESSAGE-CONTENT' || !!node.querySelector?.('message-content');
  }

  return false;
}
```

---

## PA-006-03 — 서버 전송 (MUST)

### content_script → background

`chrome.runtime.sendMessage` 로 background worker에 전달 (content_script는 서버 fetch 제한):

```typescript
// content.js
function extractAndSend(node: HTMLElement) {
  const data = {
    channel: detectChannel(),              // 'extension_web_claude' | '_chatgpt' | '_gemini'
    session_id: detectSessionId(),         // URL 경로 해시
    model: detectModel(),                   // DOM에서 추출
    role: detectMessageRole(node),          // 'user' | 'assistant'
    content: extractText(node),
    timestamp: Date.now(),
  };

  chrome.runtime.sendMessage({ type: 'log', data });
}
```

### background → 서버

```typescript
// background.js
chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type !== 'log') return;

  const { orgToken } = await chrome.storage.local.get('orgToken');
  if (!orgToken) return;  // 토큰 없으면 수집 X

  try {
    await fetch('https://proxy.gridge.ai/extension/log', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-org-token': orgToken,
      },
      body: JSON.stringify(msg.data),
    });
  } catch (err) {
    // 실패 시 재시도 큐 (최대 100건)
    await enqueueFailedLog(msg.data);
  }
});
```

---

## PA-006-04 — 사용자/세션 매핑 (MUST)

### 사용자 매핑

익스텐션은 **브라우저 로그인 계정**을 감지하기 어려움. 대안:

| 방법 | 구현 난이도 | 정확도 |
|---|---|---|
| 토큰만 사용 (사용자 매핑 없음) | 🟢 | 🔴 매우 낮음 |
| popup에서 사용자가 직접 이메일 입력 | 🟢 | 🟡 중간 (입력 누락 가능) |
| SSO 세션 쿠키 감지 (엔터프라이즈) | 🔴 | 🟢 높음 |

**Sprint 2 권장:** popup에서 이메일 입력 + 조직 토큰 입력.
**Sprint 3+:** SSO 연동 (Okta / Azure AD 세션 공유).

### popup.html UI

```html
<form id="auth-form">
  <label>조직 토큰 (Org Token)</label>
  <input name="orgToken" type="password" required>

  <label>이메일</label>
  <input name="email" type="email" required>

  <button type="submit">저장</button>

  <div id="status">
    <p>상태: <span id="status-text">미연결</span></p>
    <p>오늘 수집: <span id="log-count">0</span> 건</p>
  </div>
</form>
```

---

## PA-006-05 — 프라이버시 & 보안 (MUST)

### G-087 / G-140 정합

- **Mode B 고객은 익스텐션 쓰면 안 됨** — 데이터가 외부 서버(proxy.gridge.ai)로 나감
- Mode A/C 전용. 대시보드에서 Mode B 고객에게는 익스텐션 메뉴 숨김

### 민감 데이터 처리

- 프롬프트 원문은 **서버 전송 시** `orgs.prompt_storage` 옵션 적용 (PA-001-02)
- 익스텐션 자체 로컬 저장소엔 토큰만 (`chrome.storage.local`, 암호화)
- 비밀번호 / API 키 패턴 감지 시 경고 후 전송 거부 (`/[a-zA-Z0-9]{40,}/` 등)

### 조직 MDM 배포

- Google Workspace / Okta 의 Chrome Policy 로 **자동 설치 + 강제 설정**
- popup에서 토큰 편집 **비활성화** (OA가 사전 배포)
- 제거 차단 (enterprise policy `extensions_to_force_install`)

---

## PA-006-06 — 배포 및 버전 관리 (SHOULD)

### Chrome Web Store

- Private listing (조직 전용 링크)
- 심사 기간: 2~7일
- 업데이트: 자동 (설치된 고객 기기에서)

### 자체 호스팅 (엔터프라이즈)

- `.crx` 파일을 내부 웹서버에서 배포
- 그룹 정책 `ExtensionInstallForcelist` 로 강제 설치

### 버전 호환성

- `content_script` 가 호환 안 되는 사이트 구조 변경 감지 시:
  - `service_worker` 에서 서버에 "site_structure_outdated" 이벤트 전송
  - 대시보드에 "익스텐션 업데이트 권장" 경고
  - 최신 버전 릴리즈 후 자동 전파

---

## PA-006-07 — 익스텐션 자체 로깅 (SHOULD)

익스텐션 동작 진단용 메타 로그:

```typescript
// 별도 채널 'extension_meta'
{
  channel: 'extension_meta',
  event: 'installed' | 'dom_parse_failed' | 'token_refreshed' | 'sync_failed',
  browser_version: '...',
  extension_version: '1.0.0',
  site: 'claude.ai',
  timestamp: ...
}
```

대시보드 > 관리자 설정에 익스텐션 상태 요약 (설치 수 / 활성 / 실패율).

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] Manifest V2 사용?
- [ ] `<all_urls>` 권한 요청?
- [ ] content_script 에서 직접 fetch (CORS 문제 / 토큰 노출)?
- [ ] Mode B 고객에게 익스텐션 메뉴 노출?
- [ ] 비밀번호 / API 키 패턴 감지 없이 그대로 전송?
- [ ] popup에서 토큰 평문 표시 (`<input type="text">`)?
- [ ] `chrome.storage.local` 외 localStorage 에 민감 정보 저장?
- [ ] MutationObserver 해제 로직 없음 (메모리 누수)?

---

## 참조

- 데이터 모델 (logs.channel): `products/aiops/rules/data_model.md § PA-001`
- 프록시 서버 (extension/log 엔드포인트): `products/aiops/rules/proxy.md § PA-002-01`
- 채널 목록 전체: `products/aiops/rules/channels.md § PA-005`
- 보안 / 민감 정보: `08_security.md § 1, 9` (G-140, G-150)
- Mode B 제외: `05_infra_mode.md § 7` (G-087)
- 개별 사이트 구현: `products/aiops/channels/extension_web.md` (작성 예정)
