# 콘솔 사용 설명서

운영 콘솔의 각 페이지에서 무엇을 해야 하는지 정리. 새 페이지 추가 시 이 파일에 같은 형식으로 섹션을 추가하면 `/console/manual` 에 자동 반영.

각 섹션은 다음 4가지를 포함:
- **언제 사용** — 어떤 상황에서 이 페이지를 여는가
- **누가** — 어떤 역할 (Super / AM / Finance / Ops) 이 사용
- **단계별 절차** — 화면에서 실제로 클릭/입력하는 순서
- **주의사항 / FAQ** — 자주 묻는 케이스, 함정


## /console/home {#home}

### 언제 사용
- 콘솔 로그인 직후 첫 화면. 오늘 처리할 일의 우선순위 파악.
- 다른 페이지 작업 후 돌아와 진척 확인.

### 누가
AM / Super / Finance / Ops 전체.

### 단계별 절차
1. 상단 KPI 카드 (오늘 처리할 요청 수 / 결제 거절 수 / 임박 카드 수 등) 확인.
2. 우선순위 높은 항목 클릭 → 해당 상세 페이지로 이동.

### 주의사항
- 홈은 읽기 전용. 모든 액션은 상세 페이지에서 실행.


## /console/orgs {#orgs}

### 언제 사용
- 특정 고객사 상태 / 계약 / 멤버 / 요청 이력 확인.
- 신규 고객사 등록 (Super).
- 고객사별 세부 작업 (벤더 토큰, headroom, 멤버 관리) 진입점.

### 누가
- 조회: AM / Super / Finance / Ops
- 신규 등록: Super
- 헤드룸 / 벤더 토큰 / 신규 요청 대신 제출: Super (벤더 토큰만 Super 전용, 나머지는 AM 도 가능)

### 단계별 절차 — 고객사 조회
1. 검색창에 회사명 일부 입력 또는 목록에서 선택.
2. 상세 페이지 진입 → 탭으로 (계약 / 멤버 / 요청 / 결제 / 사용량) 전환.

### 단계별 절차 — 벤더 토큰 등록 (Super 전용)
1. 고객사 상세 우상단 "벤더 토큰" 클릭.
2. 폼에 vendor / vendor_workspace_id / token_label / 평문 토큰 입력.
3. 평문은 1회만 입력 — 등록 후 DB 에는 SHA-256 hash + 8자 prefix 만 보관.
4. 같은 (vendor, workspace) 에 active 토큰이 있으면 자동 회전 (구 토큰 status='rotated').

### 주의사항
- 평문 토큰을 슬랙·이메일·티켓에 평문으로 붙여넣기 금지. 콘솔 폼에 직접 입력.
- 잘못 등록한 토큰은 "폐기" 버튼으로 제거 + 사유 입력. 폐기된 토큰은 복구 불가.


## /console/requests {#requests}

### 언제 사용
- 고객이 포털에서 제출한 요청 (카드 발급 / 멤버 추가 / 키 발급 등) 처리.
- 자동 승인 큐 대기 항목 확인.

### 누가
AM (1차 처리) / Super (위험도 높은 요청 2차 승인).

### 단계별 절차
1. 상단 필터로 status='pending' 만 표시.
2. 상세 진입 → request_data 확인 → "승인 / 반려" 버튼.
3. 승인 시 자동으로 executor 가 실 작업 수행 (벤더 API 호출, DB 변경 등).
4. 반려 시 사유 입력 → 고객 알림 자동 발송.

### 주의사항
- 같은 고객의 같은 종류 요청이 연속으로 들어오면 quota / 쿨다운 체크. 쿨다운 중 승인 시 차단.
- 키 발급 요청은 벤더 API 호출까지 자동. 실패 시 quota 카운터는 그대로 차감 (블록 정책).


## /console/payments {#payments}

### 언제 사용
- 결제 실패 / 거절 / 환불 이슈 모니터링.
- 카드사별 거래 내역 확인.

### 누가
Finance / Ops / Super.

### 단계별 절차
1. 상단 필터로 status='declined' 또는 기간 지정.
2. 실패 거래 행 클릭 → 상세 (decline_reason / 카드사 응답).
3. 카드 만료 임박 / 한도 초과 케이스는 고객에게 안내 메일 (포털 알림).

### 주의사항
- 결제 원장은 immutable. 보정이 필요하면 역기록 거래 (reversal entry) 생성.


## /console/workspaces {#workspaces}

### 언제 사용
- 벤더 측 워크스페이스 (Anthropic Console / OpenAI Platform 등) 정보를 그릿지에 등록 / 관리.
- 신규 고객 온보딩 시 벤더 워크스페이스 생성 직후.

### 누가
Super 전용.

### 단계별 절차
1. "+ 새 워크스페이스" 클릭 (Super 만 보임).
2. Org / Service / Workspace ID / 표시명 / 상태 입력.
3. 등록 후 목록에서 인라인 상태 변경 (active / suspended / terminated).

### 주의사항
- 같은 (service, vendor_workspace_id) 중복 등록 시 거부 (UNIQUE 제약).
- 상태 변경 시 자동으로 audit_logs 기록 (visibility=internal_only).


## /console/ai-api {#ai-api}

### 언제 사용
- Gridge 자체 게이트웨이 (api.gridge.ai) 상품 카탈로그 관리.
- 고객별 키 발급 / 회전 / 폐기.
- 사용량·과금 분석.

### 누가
Super 전용.

### 단계별 절차
1. 상단 액션 버튼으로 작업 영역 선택:
   - 📊 사용량 — 일간/월간 호출량·비용 분석
   - 🗝 벤더 키 대행 — Anthropic/OpenAI 키를 그릿지가 대신 발급
   - 🔑 Gridge 키 — Gridge 게이트웨이 자체 발급 키
   - 🔐 고객사별 벤더 토큰 — 고객이 그릿지에 위임한 벤더 admin 토큰
   - 🛂 Gridge Upstream 토큰 — 게이트웨이가 upstream 호출용으로 보관한 그릿지 자체 토큰
   - + 신규 상품 — 게이트웨이 상품 카탈로그 등록
2. 본 화면(허브)은 상품 목록 위주. 활성/전체 필터 토글 가능.


## /console/ai-api/keys {#ai-api-keys}

### 언제 사용
- Gridge 게이트웨이 자체 키 발급 (Org × 상품).
- 키 회전 (24h 유예 후 자동 폐기).
- 즉시 폐기.

### 누가
Super 전용.

### 단계별 절차
1. "+ 신규 키 발급" → Org / 상품 / 월 한도 / 라벨 입력 → 발급.
2. 발급 직후 평문 1회 노출 화면 — 안전한 채널로 고객에게 전달 후 페이지 닫기.
3. 기존 키 회전 필요 시 "회전" — 신규 키 즉시 발급 + 구 키 24h 양쪽 인증 허용.
4. 즉시 폐기는 "폐기" 버튼.

### 주의사항
- 평문 키는 발급 직후 단 1회만 화면에 노출. 분실 시 새로 발급.
- DB 에는 SHA-256 hash + 12자 prefix 만 저장.


## /console/ai-api/vendor-keys {#ai-api-vendor-keys}

### 언제 사용
- 고객이 Anthropic / OpenAI 등의 키를 직접 발급받기 어려울 때 그릿지가 대신 발급.
- 어댑터 미구현 벤더 (예: Cursor) 는 목록에 disabled "(준비중)" 으로 표시.

### 누가
Super 전용.

### 단계별 절차
1. "+ 대행 발급" → 계정 (Org × 서비스 × 멤버) + 승인자 (고객 Owner/Admin) 선택.
2. 발급 → 그릿지가 보관 중인 해당 고객의 vendor_admin_token 으로 벤더 API 호출.
3. 평문 1회 노출 → 안전한 채널로 고객에게 전달.

### 주의사항
- 고객 Org 의 Quota 정책을 그대로 따름 (Super override 없음). 차단 시 정책 조정 후 재시도.
- 폐기 시 그릿지 DB 폐기와 함께 벤더 측 키도 자동 삭제. 실패 시 이벤트 로그 (`key_issuance_events.detail.vendor_revoke`) 확인.


## /console/ai-api/vendor-tokens {#ai-api-vendor-tokens}

### 언제 사용
- 고객사가 벤더 콘솔에서 발급받은 admin 토큰을 그릿지가 위임 보관.
- 신규 고객 온보딩 시 / 토큰 회전 시.

### 누가
Super 전용.

### 단계별 절차
1. 상단에서 고객사 선택 → 해당 org 의 토큰 목록 + 등록 폼 표시.
2. Vendor / Workspace ID / Label / 평문 토큰 입력 → "등록".
3. 같은 (vendor, workspace) 에 active 토큰 있으면 자동 회전.
4. 폐기는 사유 입력 필수.

### 주의사항
- 평문은 DB 에 절대 저장 안 됨 (AES-256-GCM 암호화).
- 같은 화면을 `/console/orgs/{id}/vendor-tokens` 에서도 접근 가능. 진입 경로 무관, 데이터 동일.
- 어댑터 미구현 벤더는 vendor select 에서 disabled.


## /console/ai-api/gateway-tokens {#ai-api-gateway-tokens}

### 언제 사용
- Gridge 자체 게이트웨이가 upstream 벤더 (Anthropic 등) 호출 시 사용하는 그릿지 명의 admin 토큰 등록.
- gridge_self org 만 다룸. 고객 토큰은 `/console/ai-api/vendor-tokens`.

### 누가
Super 전용.

### 단계별 절차
1. Vendor / Vendor Workspace ID / Label / 평문 토큰 입력.
2. Workspace 매핑은 선택 (M-2054). 매핑 시 service.vendor 일치 검증.
3. 등록 후 게이트웨이 호출 시 자동으로 이 토큰을 복호화해 사용.

### 주의사항
- gridge_self 전용. 다른 org 의 토큰을 여기 등록하면 권한 검증에서 막힘.
- 같은 (vendor, workspace) 재등록 시 자동 회전.


## /console/integrations/slack {#integrations-slack}

### 언제 사용
- Slack 알림 채널 연결 / 해제.
- 알림 대상 (이상 거래 / 카드 만료 / 결제 거절) 설정.

### 누가
Super 전용.

### 단계별 절차
1. Slack Workspace OAuth 연결.
2. 알림 카테고리별로 채널 매핑.
3. 테스트 메시지 발송으로 확인.


## /console/admins {#admins}

### 언제 사용
- 신규 관리자 계정 추가 / 권한 변경 / 비활성화.
- 2FA 설정 강제.

### 누가
Super 전용.

### 단계별 절차
1. "+ 새 관리자" → 이메일 / 이름 / 역할 (super / am / finance / ops) 입력.
2. 초대 이메일 발송 → 본인이 비밀번호 설정 + 2FA 등록.
3. 기존 관리자는 행 클릭 → 역할 변경 / is_active 토글.

### 주의사항
- Super 강등 시 마지막 1명이면 차단 (최소 1명 유지).
- 비활성화된 관리자의 작업 이력은 audit_logs 에 영구 보존.


## /console/manual {#manual}

### 언제 사용
- 콘솔 사용법 확인이 필요할 때.

### 누가
모든 역할.

### 단계별 절차
1. 좌측 목차에서 페이지 선택.
2. 우측 본문 확인.

### 주의사항
- 본 문서는 `docs/console-manual.md` 가 원본. 콘솔 페이지가 빌드 타임에 파싱해 렌더링.
- 새 페이지 추가 시 같은 형식 (`## /console/{path} {#slug}` + 4개 서브헤더) 으로 섹션 추가하면 자동 노출.
