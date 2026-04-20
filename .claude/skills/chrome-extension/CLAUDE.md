# Skills — Chrome Extension (Manifest V3)

> AiOPS 브라우저 익스텐션 (PA-006, extension_web) 개발 참조.
> Chrome / Edge 공용. Firefox 는 별도 수정 필요.

---

## 기본 구조

```
extension/
├── manifest.json          # MV3 설정
├── content_script.js      # 타겟 페이지 DOM 접근
├── background.js          # Service Worker
├── popup.html             # 팝업 UI
├── popup.js
└── icons/
```

---

## Manifest V3 핵심

```json
{
  "manifest_version": 3,
  "name": "Gridge AiOPS",
  "version": "1.0.0",
  
  "permissions": [
    "storage",        // 토큰 저장
    "activeTab"       // 현재 탭만 (권장, 전체 <all_urls> 회피)
  ],
  
  "host_permissions": [
    "https://claude.ai/*",
    "https://chatgpt.com/*",
    "https://gemini.google.com/*"
  ],
  
  "content_scripts": [{
    "matches": [ /* 위와 동일 */ ],
    "js": ["content_script.js"],
    "run_at": "document_idle"
  }],
  
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icons/icon-128.png"
  }
}
```

### V2 → V3 차이

- `background.scripts` → `service_worker`
- `browser_action` → `action`
- `webRequestBlocking` 제거 (Declarative Net Request 로)

---

## Service Worker 생명주기

Chrome MV3 SW 는 **유휴 시 자동 종료**. 전역 상태 유지 불가:

```javascript
// ❌ 금지 (SW 재시작 시 사라짐)
let state = { counter: 0 };

// ✅ 올바름 (chrome.storage 사용)
chrome.storage.local.get('counter').then(({ counter = 0 }) => {
  chrome.storage.local.set({ counter: counter + 1 });
});
```

`setInterval` / `setTimeout` 도 SW 종료 시 취소됨 → `chrome.alarms` API 사용:

```javascript
chrome.alarms.create('flush-queue', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'flush-queue') flushQueue();
});
```

---

## Content Script 한계

- 타겟 페이지의 DOM 은 접근 가능
- 타겟 페이지의 JS 전역 변수는 **접근 불가** (Isolated World)
- 필요 시 `<script>` 주입 (CSP 허용 시만):

```javascript
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
document.documentElement.appendChild(script);
```

---

## Storage

| API | 용도 | 한계 |
|---|---|---|
| `chrome.storage.local` | 기본 키-값 | 10MB |
| `chrome.storage.sync` | 기기 간 동기 | 100KB (사용 지양, 민감 데이터 금지) |
| `chrome.storage.session` | 세션만 (MV3) | 10MB, SW 재시작 시 유지 |

### 토큰 저장

```javascript
// orgToken 저장
await chrome.storage.local.set({ orgToken: 'xxx' });

// 암호화 (추가 보안, G-143)
const encrypted = await encrypt(token, userPassword);
await chrome.storage.local.set({ orgTokenEncrypted: encrypted });
```

⚠ `chrome.storage.local` 은 **암호화 X** — 민감 데이터는 추가 암호화 필요.

---

## Messaging

```javascript
// content_script → background
chrome.runtime.sendMessage({ role: 'user', content: '...' }, (response) => {
  console.log(response);
});

// background listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message);
  sendResponse({ ok: true });
  return true;  // async response
});
```

---

## 배포

### Chrome Web Store

- 심사: 약 1주
- 공개 / Unlisted (URL 아는 사람만) / Private

### Enterprise 배포 (MDM)

```json
// managed_schema.json
{
  "type": "object",
  "properties": {
    "orgToken": { "type": "string" },
    "serverEndpoint": { "type": "string" }
  }
}
```

관리자가 GPO / Intune 로 정책 배포 → 사용자 설정 강제.

---

## Edge / Firefox 호환

- Edge: MV3 Chrome 코드 그대로 OK
- Firefox: `browser.*` API + `storage.sync` 차이. 빌드 시 조건 분기.

---

## 자동 검증 체크리스트

- [ ] `<all_urls>` 권한 (과도)?
- [ ] SW 에 전역 변수 의존 (재시작 시 손실)?
- [ ] `orgToken` 평문 저장 (G-143 위반)?
- [ ] `tabs` 권한 (실제 사용 안 하면 삭제)?
- [ ] Firefox 빌드 분기 없음 (배포 범위 제한)?

---

## 참조

- AiOPS 확장 규칙: `products/aiops/rules/extension.md` (PA-006)
- 웹 채널 구현: `products/aiops/channels/extension_web.md`
- G-143 암호화: `08_security.md § 4`
- G-150 시크릿 노출 금지: `08_security.md § 9`
