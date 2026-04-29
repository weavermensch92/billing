# Gridge Billing Fill Helper — Chrome Extension

> AI 서비스 결제 페이지에서 Gridge VCN 카드번호를 안전하게 복사하는 브라우저 확장 (MV3).

## 왜 필요한가

Claude Team, ChatGPT Team, Cursor Business 등 대부분의 AI 서비스가 **Stripe Elements iframe** 으로 카드 입력 폼을 구현. Cross-origin iframe 보안 정책상 JS로 직접 입력이 불가능해, Playwright 같은 서버 자동화 또는 사용자의 "복사-붙여넣기" 도움만 가능.

이 확장은 후자의 UX를 **1-click + 자동 클립보드 클리어** 로 안전하게 만듦.

## 동작 플로우

```
1. 사용자가 AI 서비스 결제 페이지 접속 (예: https://console.anthropic.com/billing)
2. 툴바에 Gridge 아이콘 "$" badge 표시 (background worker가 URL 매칭)
3. 사용자가 아이콘 클릭 → popup
4. popup 이 Gridge 포털 세션 확인 (GET /api/extension/session)
5. 접근 가능한 VCN 리스트 표시 (GET /api/extension/accounts)
6. 사용자가 "카드번호 복사" 클릭
7. POST /api/extension/reveal → 일시 카드번호 응답 (Mock 모드: test card)
8. 클립보드에 복사 + 상태 배너 "✓ 카드번호 복사됨 (120초 후 클리어)"
9. 사용자가 Stripe iframe 에 Cmd/Ctrl+V
10. 120초 후 자동 클립보드 클리어 시도
```

## 디렉토리

```
extension/
├── public/
│   ├── manifest.json       ← MV3 매니페스트
│   ├── popup.html          ← popup 쉘
│   ├── popup.css           ← popup 스타일
│   └── icons/              ← 아이콘 (현재는 플레이스홀더)
├── src/
│   ├── popup/popup.ts      ← popup 로직 (세션/리스트/복사)
│   ├── background/
│   │   └── background.ts   ← MV3 service worker (badge 갱신)
│   └── content/
│       └── content.ts      ← 결제 페이지 주입 (Stripe iframe 감지 + 툴팁)
├── dist/                   ← vite build 출력 (Chrome 로드 대상)
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 빌드

```bash
cd extension
npm install
npm run build
# → extension/dist/ 폴더 생성
```

## Chrome 설치 (개발자 모드)

1. Chrome 주소창 `chrome://extensions`
2. 우상단 "개발자 모드" 토글 ON
3. "압축 해제된 확장 프로그램 로드" 클릭
4. `extension/dist/` 폴더 선택
5. 툴바에 Gridge 아이콘 고정 (pin) 권장

## API Base URL 설정

기본값 `http://localhost:3000`. 변경:

- 확장 popup 하단 "설정" 버튼 → URL 입력
- 또는 DevTools: `chrome.storage.sync.set({ apiBase: 'https://app.gridge.ai' })`

## 보안 / PCI 고려사항

- **전체 카드번호 저장 안 함** — Gridge DB 는 `card_last4` 만 저장. `/api/extension/reveal` 은 **Mock 모드에서만** 가짜 번호를 반환. 실제 모드에서는 카드사 포털(신한 V-Card) 프록시 연결이 Phase 1 과제.
- **클립보드 자동 클리어** — 복사 후 120초(CVV는 30초) 뒤 JS로 빈 값 덮어쓰기 시도. 단 탭 포커스 없으면 `readText` 불가 — 완전 보장 아님 (OS 수준).
- **감사 로그** — 매 reveal 요청마다 `audit_logs (visibility=internal_only, action=vcn_reveal_extension, detail={purpose_url, card_last4})` 기록.
- **권한 분리** — Member는 본인 계정 VCN 만 reveal 가능 (서버 측 검증).
- **Stripe iframe 무침입** — DOM 자동 입력 시도 없음. 사용자 명시적 `Cmd/Ctrl+V` 필수. ToS 회색 지대 회피.

## 지원 서비스 (Phase 0)

Badge 자동 표시 URL 패턴:

- `claude.ai/*/billing*`
- `console.anthropic.com/*billing*`
- `platform.openai.com/*billing*`
- `chatgpt.com/*billing*`
- `cursor.com/*billing*`
- `github.com/settings/billing*`

`manifest.json` 의 `host_permissions` 및 `content_scripts.matches` 확장으로 서비스 추가 가능.

## Phase 1 로드맵

- [ ] 실제 Anthropic/OpenAI Admin API 직결 경로 병행 (자동 등록 가능 서비스는 자동으로 전환)
- [ ] Playwright 서버 자동화 (Stripe iframe 커버) — ToS 검토 후
- [ ] 카드사 포털 API 프록시 — Mock `reveal` 을 실카드번호 실시간 fetch 로 대체
- [ ] 정식 Chrome Web Store 배포 (비공개 채널 or 조직 전용)
- [ ] Edge/Firefox 포팅 (MV3 호환)

## Gridge 앱과의 연동

- 고객 포털(`/services/[id]`) 에 "이 VCN을 Extension 으로 복사" 링크 추가 예정
- Phase 1: 확장 설치 감지 + 자동 카드 선택 (`chrome.runtime.sendMessage` + origin 매칭)
