# Gridge Billing MSP

> AI 서비스 결제를 법인카드 대신 **리셀러 구조**로 대행하는 Managed Service Provider — Alpha 구현.
>
> Gridge AIMSP 4제품 (AiOPS / LucaPus / Wiring AI / **Billing MSP**) 중 **Mode D** 제품. PRD v1.0 기반 4 스프린트 Alpha 완성.

![Status](https://img.shields.io/badge/status-Alpha-yellow)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Supabase](https://img.shields.io/badge/Supabase-PG_15-3FCF8E)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)

---

## 제품 개요

한국 중소·중견 기업의 **AI 도구 법인 결제 실무**를 해결:

- **Gridge 명의**로 한국 카드사 VCN 발급 → AI 서비스에 등록
- Gridge가 벤더 (Anthropic/OpenAI/Cursor…)에 **USD 선결제**
- 고객은 월말 **원화 청구서 + 세금계산서**로 받음
- **10% 크레딧백** 6개월 + 전담 AM Luna가 개설·해지·거절 전담

### 차별화

| 경쟁 영역 | Gridge 차별화 |
|---|---|
| 법인카드 대안 (Brex/Ramp) | 한국 서비스 + 전담 AM + AI 특화 |
| PG사 (나이스/KG) | PG 아님 (리셀러 구조) — 전자금융거래법 경계 |
| 비용 관리 SaaS (Spendesk) | 결제 레일 직접 소유 + Anthropic 파트너십 |

---

## 빠른 시작 (3분)

### 최소 요건

- Node.js 20+
- pnpm 또는 npm
- Windows / macOS / Linux
- Supabase 계정 (실제 모드만 필요, Mock 모드는 불필요)

### 1. 설치

```bash
git clone <repo>
cd 2-3billing
npm install
```

### 2. 환경 설정

```bash
cp .env.local.example .env.local
```

`.env.local` 편집:

```env
# (A) Mock 모드 — DB 없이 전체 페이지 점검
NEXT_PUBLIC_MOCK_MODE=true

# (B) 실제 Supabase 연결
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

### 3. 데모 런처 실행

```bash
npm run demo
```

크로스 플랫폼 컬러 메뉴가 뜹니다. `1`을 선택하면 dev 서버 시작 + 브라우저 자동 오픈.

**대안 런처**:
- Windows cmd: `scripts\demo.cmd` (더블클릭)
- Git Bash/macOS: `npm run demo:sh`

---

## 데모 계정 (Mock 모드 전용)

### 시나리오: Acme Corp (크레딧백 M3 진행 중)

| 계정 | 이메일 | 역할 | 주요 확인 |
|---|---|---|---|
| 김앨리스 | `alice@acme.com` | Owner | 청구서 · 크레딧백 · 데이터 내보내기 · 멤버 관리 |
| 박밥 | `bob@acme.com` | Admin | 멤버 초대 · 요청 제출 · 서비스 관리 |
| 최찰리 | `charlie@acme.com` | Member | 본인 계정만 조회 |
| Luna | `luna@gridge.ai` | AM | 요청 처리 · CSM · 고객사 상세 |
| 위버 | `weber@gridge.ai` | Super | **조직 등록** · 청구서 고액 승인 · VCN 전체번호 조회 감사 |

### 직접 URL 로그인 (GET 방식)

```
http://localhost:3000/api/dev-login?email=weber@gridge.ai&redirect=/console/orgs/new
```

이 URL 한 번이면 쿠키 설정 + 지정 경로로 즉시 진입. 런처의 `Quick Paths` 메뉴도 동일 방식.

---

## 구현된 기능 (Alpha)

### 고객 포털 (`/`)

| 경로 | 설명 |
|---|---|
| `/login` | Magic Link + Mock 계정 카드 |
| `/home` | StatCard 4개 (활성 계정·이번 달 청구·진행 중 요청·크레딧백 진행) |
| `/services` | 4탭 필터 (전체·구독·API·에이전트 크레딧) + 계정 카드 그리드 |
| `/services/[id]` | 계정 상세 + VCN 마스킹 + 한도 변경/해지 버튼 |
| `/services/new` | **5단계 wizard** (5종 액션: new/limit/terminate/vcn/decline) |
| `/requests` | 진행/완료/전체 3탭 |
| `/requests/[id]` | 타임라인 + **Realtime 메시지 스레드** + 고객 확인 버튼 |
| `/billing` | 청구서 리스트 + 3단계 breakdown |
| `/billing/[id]` | 상세 (원금 → 크레딧백 → VAT → 합계) + 거래 내역 |
| `/billing/creditback` | 6개월 진행바 + D-30 경고 + M6 Final 플래그 |
| `/org/members` | 멤버 리스트 + 오프보딩 진입 |
| `/org/members/new` | 초대 (Owner → admin/member, Admin → member) |
| `/org/members/[id]/offboarding` | **3단계 wizard** (영향 미리보기 → 계정별 처리 → 비밀번호 재확인) |
| `/settings/audit-log` | 감사 로그 + 가시성 필터 + **CSV 내보내기** |
| `/settings/data-export` | Owner 전용 · 5종 export · 주당 1회 제한 · 7일 만료 |
| `/settings/notifications` | 14 이벤트 × 3 채널 토글 + 3계층 fallback |
| `/settings/security` | **TOTP 2FA** (enroll/verify/unenroll) |

### 운영 콘솔 (`/console`)

| 경로 | 설명 |
|---|---|
| `/console/login` | Admin 이메일+비밀번호 → **2FA TOTP** (Super/Finance 필수) |
| `/console/home` | AM 뷰 (오늘 할 일 · 담당 고객사 · SLA 대기) |
| `/console/orgs` | 고객사 리스트 + **신규 등록** 버튼 |
| `/console/orgs/new` | **Super 전용 4단계 wizard** (조직 → 계약 → Owner → 확인) |
| `/console/orgs/[id]` | 8탭 상세 (Overview/계정/결제/청구서/요청/멤버/팀/메모) |
| `/console/requests` | SLA 정렬 처리 큐 (4탭 상태 필터) |
| `/console/requests/[id]` | **3컬럼 워크플로** (요청정보 · 체크리스트 · 메시지) |
| `/console/payments` | 실시간 피드 + 거절 큐 + 미정산 + SOP 체크리스트 |
| `/console/vcn/[id]` | **9단계 상태 머신 시각화** + 전체번호 조회 감사 (Super) |
| `/console/invoices` | 월별 검수 필터 + Finance 액션 |
| `/console/invoices/[id]` | 원가/마진 breakdown + Super 고액 승인 + Smart Bill 기록 |

---

## 개발 모드

### A. Mock 모드 (기본, 권장 시작)

```bash
# .env.local
NEXT_PUBLIC_MOCK_MODE=true
```

- Supabase 없이 가상 데이터로 **모든 페이지 렌더링 확인**
- In-memory store + Supabase 쿼리 체인 흉내 (eq/in/order/limit/single/insert/update/upsert)
- Realtime·Storage·MFA 모두 stub

### B. 실제 Supabase 모드

1. Supabase 프로젝트 생성
2. Dashboard → Settings → API → **Exposed schemas**에 `billing` 추가
3. 마이그레이션 적용 (순서 엄수):
   ```bash
   supabase db push
   ```
4. `.env.local`에서 `NEXT_PUBLIC_MOCK_MODE=false` + Supabase URL/키 입력

---

## 프로젝트 구조

```
.
├── app/
│   ├── (customer)/            고객 포털 — route group
│   │   ├── home/
│   │   ├── services/new/wizard.tsx
│   │   ├── requests/[id]/
│   │   ├── billing/
│   │   ├── org/members/[id]/offboarding/
│   │   └── settings/{audit-log,data-export,notifications,security}/
│   ├── (console)/console/     운영 콘솔 — route group
│   │   ├── home/
│   │   ├── orgs/{new,[id]}/
│   │   ├── requests/[id]/
│   │   ├── payments/
│   │   ├── invoices/[id]/
│   │   └── vcn/[id]/
│   ├── login/                 (route group 외부 — auth bypass)
│   ├── console/login/
│   ├── auth/{callback,signout}/
│   └── api/dev-login/         Mock 전용 GET/POST 로그인
│
├── components/
│   ├── ui/{stat-card,status-badge}.tsx
│   ├── customer/{message-thread,notification-bell}.tsx
│   └── console/{admin-message-thread,realtime-transactions,vcn-state-machine}.tsx
│
├── lib/
│   ├── supabase/{server,client,middleware}.ts   Mock/실제 자동 분기
│   ├── mock/{fixtures,client}.ts                Supabase 인터페이스 흉내
│   └── utils/format.ts                          KRW/USD/날짜 포맷
│
├── types/
│   ├── billing.types.ts       전체 도메인 타입
│   └── request.types.ts       wizard + 메시지 타입
│
├── supabase/
│   ├── migrations/            7개 SQL (P1/RLS/P2/Auth/Anomaly/Review/Sprint4)
│   └── seed/01_services.sql   10종 벤더 카탈로그
│
├── scripts/
│   ├── demo.js                크로스 플랫폼 Node 런처 (npm run demo)
│   ├── demo.cmd               Windows 런처
│   └── demo.sh                Bash 런처
│
├── docs/
│   └── HARNESS.md             Claude Code 하네스 레퍼런스
│
├── .claude/                   Claude Code 하네스 (개발 규칙)
├── middleware.ts              auth 보호 + /console/* 분리
└── Gridge_Billing_MSP_PRD_v1.0.md
```

---

## DB 마이그레이션 순서

```
20260420000001_billing_p1_schema.sql        P1 테이블 12개 + VCN 9단계 트리거 + 회계분리 검증
20260420000002_billing_rls.sql              RLS 정책 + 헬퍼 함수 (my_org_id, my_role, is_admin_user)
20260420000003_billing_p2_requests.sql      request_events/messages/notification_preferences
20260420000004_auth_integration.sql         admin_users.user_id + Supabase Auth 연동 + Realtime publication
20260420000005_anomaly_detection.sql        anomaly_rules/events + 9종 seed
20260420000006_sprint3_review_fixes.sql     v_transaction_customer security_invoker + 자동 감사 트리거
20260420000007_sprint4_settings.sql         export_jobs + notification defaults + 월말 배치 함수
```

### 월말 청구서 생성 (수동 실행 / Phase 1 pg_cron 자동)

```sql
SELECT * FROM billing.generate_invoices_for_month('2026-04');
-- (org_id, invoice_id, total_due_krw) 행 반환
-- 크레딧백 자동 계산 + M6 is_final + ≥₩10M Super 승인 자동 표시
```

---

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | Next.js dev 서버 (port 3000) |
| `npm run build` | 프로덕션 빌드 |
| `npm run typecheck` | TypeScript strict 검증 (0 에러 유지) |
| `npm run lint` | ESLint |
| `npm run demo` | **크로스 플랫폼 데모 런처 (권장)** |
| `npm run demo:cmd` | Windows cmd 런처 |
| `npm run demo:sh` | Bash 런처 |

---

## 보안

### 적용된 방어

- **RLS 서버 레벨 필터링** (G-052) — 모든 테이블 + `security_invoker = true` 뷰
- **Immutable Ledger** (PB-005) — `transactions` / `credit_backs` / `audit_logs` UPDATE/DELETE 차단
- **VCN 전체번호 DB 미저장** — `card_last4`만, 카드사 포털 조회 시 Super 전용 + 사유 입력 + `internal_only` 감사 로그
- **회계 분리 검증 트리거** (PB-009) — `customer_charge = gridge_cost + margin` 강제
- **자원 소유권 검증** — 요청 생성 시 account/member의 org_id 일치 확인 (타 조직 자원 차단)
- **요청 확인 주체 검증** — Member는 본인 요청만, Owner/Admin은 조직 내 요청만
- **Super/Finance 2FA 강제** — `totp_secret` NULL이면 로그인 차단
- **감사 CSV 민감 키 13종 마스킹** (password/totp/ip/api_key/margin 등)
- **오프보딩 본인 비밀번호 재확인**
- **Dev-login `NODE_ENV=production` 차단** (defense-in-depth)

### Phase 2+ 추가 예정

- IP 화이트리스트 (엔터프라이즈)
- SSO (SAML/OIDC/SCIM)
- 콘솔 세션 타임아웃 별도 정책
- ISO 27001 / SOC 2 Type II

---

## 일정 (PRD § 8 기반)

| 단계 | 기간 | 상태 |
|---|---|---|
| **Sprint 1** | D-7 ~ D-1 | ✅ P1 스키마 + 기본 포털/콘솔 |
| **Sprint 2** | D+1 ~ D+7 | ✅ 요청 워크플로 + 메시지 Realtime |
| **Sprint 3** | D+8 ~ D+21 | ✅ 청구서 + VCN + 결제 모니터링 |
| **Sprint 4** | D+22 ~ D+30 | ✅ 설정 · 감사 · 오프보딩 · 월말 배치 |
| **Alpha 운영** | D+30 ~ D+90 | ⏳ Alpha 고객 1개사 운영 안정화 |
| **Phase 1** | D+90 ~ D+270 | 로드맵 — 카드사 B2B API · Smart Bill API · 오픈뱅킹 |
| **Phase 2** | D+270 ~ | 로드맵 — SSO · 다수 고객사 · ML 이상 감지 |

---

## Claude Code 하네스

이 레포는 **`@gridge-ai/aimsp-harness`** 룰북 위에서 개발되었습니다. `.claude/` 디렉토리에 300+ 규칙 ID가 포함되어 있으며, Claude Code에서 다음과 같이 작동:

```
> /console/invoices에 Finance Super 승인 UI 추가해줘

  ↓ Claude Code 자동 수행
  1. 4축 확정 (제품=Billing · 모드=A · actor=L4 · Stage=0)
  2. F 체인 선택 + PB-003/PB-007/PB-009 규칙 자동 로드
  3. 회계 분리 + 고액 임계 + Super 2차 승인 로직 일관 생성
  4. audit_logs 자동 기록 (visibility=internal_only)
  5. TypeScript strict 검증 + PR draft 생성
```

상세: [`docs/HARNESS.md`](docs/HARNESS.md) · [`.claude/CLAUDE.md`](.claude/CLAUDE.md)

---

## 문서

- [PRD v1.0](Gridge_Billing_MSP_PRD_v1.0.md) — 제품 요구사항 명세
- [docs/HARNESS.md](docs/HARNESS.md) — Claude Code 하네스 레퍼런스
- [.claude/rules/00_index.md](.claude/rules/00_index.md) — 규칙 ID 카탈로그

---

## 라이선스

**UNLICENSED (Proprietary)** · SoftSquared Inc. (Gridge)

내부 사용 전용. 무단 배포·수정·공개 금지.

---

## 문의

- 엔지니어링: `engineering@gridge.ai`
- 영업/파트너십: `partnerships@gridge.ai`
- Alpha 고객 지원: `support@gridge.ai`
