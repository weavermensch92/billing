# AiOPS / Channels / Extension (Web) — 규칙 본문

> PA-005-07 본문. 브라우저 익스텐션 기반 웹 채널 수집.
> 대상: claude.ai / chatgpt.com / gemini.google.com. Manifest V3.

---

## 지원 사이트

| 사이트 | 완전성 | 셀렉터 전략 |
|---|---|---|
| claude.ai | ⚠️ 80% | `[data-testid="user-message"]` / `.font-claude-message` |
| chatgpt.com | ⚠️ 80% | `[data-message-author-role]` |
| gemini.google.com | ⚠️ 80% | `.user-query-text` / `.model-response-text` |

DOM 구조는 벤더 업데이트에 취약 → 회귀 테스트 + 셀렉터 catalog 분리.

---

## Manifest V3

```json
{
  "manifest_version": 3,
  "name": "Gridge AiOPS Extension",
  "version": "1.0.0",
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://claude.ai/*",
    "https://chatgpt.com/*",
    "https://gemini.google.com/*"
  ],
  "content_scripts": [{
    "matches": [
      "https://claude.ai/*",
      "https://chatgpt.com/*",
      "https://gemini.google.com/*"
    ],
    "js": ["content_script.js"],
    "run_at": "document_idle"
  }],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html"
  }
}
```

---

## content_script.js

MutationObserver 로 DOM 변화 감지:

```javascript
const loggedElements = new Set();

const SELECTORS = {
  'claude.ai': {
    user: '[data-testid="user-message"]',
    assistant: '.font-claude-message',
  },
  'chatgpt.com': {
    user: '[data-message-author-role="user"]',
    assistant: '[data-message-author-role="assistant"]',
  },
  'gemini.google.com': {
    user: '.user-query-text',
    assistant: '.model-response-text',
  },
};

const domain = location.hostname.replace(/^www\./, '');
const selectors = SELECTORS[domain];
if (!selectors) return;

const observer = new MutationObserver(() => {
  // user 메시지
  document.querySelectorAll(selectors.user).forEach(el => {
    const key = el.id || el.innerText.slice(0, 40);
    if (loggedElements.has(key)) return;
    loggedElements.add(key);
    chrome.runtime.sendMessage({
      role: 'user',
      content: el.innerText,
      channel: domain,
      timestamp: Date.now(),
    });
  });

  // assistant 메시지 (스트리밍 완료 감지)
  document.querySelectorAll(selectors.assistant).forEach(el => {
    // 로딩 중이면 스킵 (스피너 클래스 등 체크)
    if (el.querySelector('[data-loading]')) return;
    const key = el.id || el.innerText.slice(0, 40);
    if (loggedElements.has(key)) return;
    loggedElements.add(key);
    chrome.runtime.sendMessage({
      role: 'assistant',
      content: el.innerText,
      channel: domain,
      timestamp: Date.now(),
    });
  });
});

observer.observe(document.body, { childList: true, subtree: true });
```

---

## background.js

서버 전송 + 실패 큐:

```javascript
const QUEUE_KEY = 'gridge_log_queue';

chrome.runtime.onMessage.addListener(async (message) => {
  const { orgToken } = await chrome.storage.local.get('orgToken');
  if (!orgToken) return;

  try {
    await fetch('https://proxy.gridge.ai/log/extension', {
      method: 'POST',
      headers: {
        'x-org-token': orgToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify(message),
    });
  } catch (err) {
    // 오프라인 큐
    const { [QUEUE_KEY]: queue = [] } = await chrome.storage.local.get(QUEUE_KEY);
    queue.push(message);
    await chrome.storage.local.set({ [QUEUE_KEY]: queue.slice(-100) });  // 최대 100건
  }
});

// 큐 flush (복구 시)
setInterval(async () => {
  const { [QUEUE_KEY]: queue = [] } = await chrome.storage.local.get(QUEUE_KEY);
  if (queue.length === 0) return;
  // ... 재전송 로직
}, 60_000);
```

---

## popup.html (org 토큰 입력)

```html
<div>
  <h3>Gridge AiOPS</h3>
  <label>Organization Token:
    <input id="orgToken" type="password" />
  </label>
  <button id="save">저장</button>
</div>
```

---

## 배포

### 방법 1: Chrome Web Store

공개 스토어. 심사 시간 ~1주.

### 방법 2: Unlisted (엔터프라이즈)

MDM / 그룹 정책으로 강제 설치. 고객사 IT 팀과 협업.

### 방법 3: .crx 직접 배포 (파일럿)

파일럿 단계에서 내부 공유. 개발자 모드 On 필요.

---

## 프라이버시 고지

익스텐션 첫 실행 시 명시:
- 수집 대상: 프롬프트 / 응답 / URL / 타임스탬프
- 수집 안 함: 쿠키 / 비밀번호 / 다른 사이트
- 전송 대상: 고객사 Gridge 대시보드만
- 옵트아웃: 확장 제거

PA-008 직원 고지 템플릿 연동.

---

## 자동 검증 체크리스트

- [ ] 3개 사이트 외 다른 사이트에 권한 요청?
- [ ] 쿠키 / 비밀번호 / 탭 컨텐츠 접근 권한 요청 (불필요)?
- [ ] DOM 셀렉터 변경 시 silently fail (알림 없음)?
- [ ] orgToken 이 평문 저장 (chrome.storage.local 은 암호화 X, G-143 위반)?
- [ ] 스트리밍 중 부분 메시지 중복 로깅?

---

## 참조

- PA-006 브라우저 익스텐션 규칙: `products/aiops/rules/extension.md`
- PA-008 직원 고지: `products/aiops/rules/governance.md`
- G-143 암호화: `08_security.md § 4`
