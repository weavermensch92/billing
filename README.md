# Gridge Billing MSP — v2.0

> AI MSP 빌링 시스템 — 충전 선금 + 6개월 한정 할인 + 벤더 청구서 진리원천

## 핵심 모델 (v1 → v2)

| 항목 | v1.0 | v2.0 |
|---|---|---|
| 결제 모델 | 월 후불 + 6개월 크레딧백 | **충전 선금제 + 6개월 한정 할인** |
| 청구 진리원천 | 카드 거래 합산 | **벤더 invoice API** (옵션 3) |
| 세계 발행 | 월말 자동 | **충전·증액 즉시 슬랙 자동 포스팅** |
| 헤드룸 | Org 1단 | **Org + 팀 2단** |
| 환차 | 카드 결제 시점 | **충전 시점 환율 고정, 그릿지 흡수** |
| 멤버 sync | 수동 | **1h 자동 + f3 24h 검수** |
| 그릿지 사람 게이트 | (없음) | **Gate #1 충전 컨펌, Gate #2 카드 입력** |

## 빠른 시작

### 환경 변수

`.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Mock 모드 (개발용)
NEXT_PUBLIC_MOCK_MODE=true

# Cron 보안
CRON_SECRET=...

# Slack (5번·6번 흐름)
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_TAX_INVOICE_CHANNEL_ID=C...

# 벤더 토큰 암호화 (v2 신규)
VENDOR_TOKEN_ENC_KEY=<base64 32 bytes>

# 벤더 어댑터 (선택 — Phase 2에서 동적 토큰으로 대체)
ANTHROPIC_ADMIN_API_KEY=...
ANTHROPIC_ORG_ID=...
OPENAI_ADMIN_API_KEY=...
OPENAI_ORG_ID=...
```

### 마이그레이션 적용

Phase 1 (9개 신규) + 보강 4개 + Phase 2 폐기 3개 = **16개**:

```bash
# Supabase CLI 사용
supabase db push

# 또는 개별 적용
for f in supabase/migrations/2026051500001*_v2_*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
```

### 개발 서버

```bash
npm install
npm run dev
# → http://localhost:3000
```

Mock 모드 추천 (`NEXT_PUBLIC_MOCK_MODE=true`):
- 벤더 어댑터: 결정적 더미 데이터 (Alice/Bob, gpt-4o/o1, ...)
- Supabase: 메모리 mock client
- 벤더 워크스페이스 토큰 불필요

## 아키텍처

```
┌───────────────────────────────────────────────────────────┐
│  고객 (Org / 팀 / 멤버)                                    │
│  ┌─ /home, /billing/{wallet,charge,api-keys,teams,cards}  │
│  │   → Server Actions → lib/actions/v2-billing.ts         │
│  │                       → lib/billing/* (wallet, refund, │
│  │                          team-headroom, key-issuance, │
│  │                          shadow-approval, termination) │
│  │                       → executeRequestCompletion      │
│  └─ Supabase RLS: Org 격리                                │
└───────────────────────────────────────────────────────────┘
                              ↕
┌───────────────────────────────────────────────────────────┐
│  슈퍼어드민 (그릿지 내부)                                  │
│  ┌─ /console/{charges,vendor-invoices,sync,orgs,vcn}     │
│  │   → Server Actions → service-role client (RLS bypass) │
│  └─ Slack 화이트리스트 ack (Gate #1 → 5번 자동 포스팅)    │
└───────────────────────────────────────────────────────────┘
                              ↕
┌───────────────────────────────────────────────────────────┐
│  외부 인티그레이션                                          │
│  ┌─ Slack Events Webhook (POST /api/slack/events)        │
│  │   → ✅ 리액션 → confirm_slack_ack → wallet active     │
│  ├─ Vendor API (anthropic/openai)                        │
│  │   → token-broker (AES-256-GCM)                        │
│  │   → member-sync (1h cron)                             │
│  │   → invoice-fetcher (월 5일 cron)                     │
│  │   → policy-lockdown (key 권한 강제)                   │
│  └─ Cron (Vercel Cron — vercel.json 정의)                │
└───────────────────────────────────────────────────────────┘
```

## 디렉토리 구조

```
billing/
├─ supabase/migrations/        16개 v2 마이그레이션
├─ lib/
│  ├─ billing/                 비즈니스 로직 (v2 16개 모듈)
│  │  ├─ wallet.ts             충전·차감·만료 (FIFO)
│  │  ├─ discount-policy.ts    6개월 한정 할인 (가시성 분리)
│  │  ├─ team-headroom.ts      Org+팀 2단 자율승인
│  │  ├─ refund.ts             A3 정책 (할인 회수+차액)
│  │  ├─ termination.ts        B-i+c (다음 결제일 grace)
│  │  ├─ usage-allocator.ts    FIFO 다중 wallet+환차
│  │  ├─ vendor-invoice/       청구서 fetch·match·resell
│  │  ├─ key-issuance/         quota+executor (Q5 임계)
│  │  ├─ shadow-approval.ts    f3 24h 검수
│  │  ├─ card-expiry-notifier  D-30/D-7/D-0 알림
│  │  ├─ limit-validator.ts    vendor_invoice 우선 (v2)
│  │  ├─ request-executor.ts   action_type 11개 분기
│  │  └─ prorate.ts            DEPRECATED (선금제로 폐기)
│  ├─ slack/                   webhook·poster·allowlist
│  ├─ vendor-api/              어댑터 (mock·real × 2 벤더)
│  ├─ actions/v2-billing.ts    Server Action 통합 헬퍼
│  ├─ cron/auth.ts             Bearer 검증
│  └─ supabase/service-role.ts RLS bypass 클라이언트
├─ app/
│  ├─ (customer)/              고객 페이지
│  │  ├─ home/                 v2 잔액·헤드룸·할인 카드
│  │  ├─ billing/{wallet,charge,api-keys,teams,cards,[id]}
│  │  ├─ services/{new,[id]}   계정 신청 + 카드 교체 Idea 1
│  │  ├─ settings/termination  Org 해지 신청
│  │  └─ org/members/[id]/approval  24h 검수 결정
│  ├─ (console)/console/       슈퍼어드민 페이지
│  │  ├─ home/                 5 ActionCard 대시보드
│  │  ├─ charges/[id]          Gate #1 컨펌
│  │  ├─ vendor-invoices/      매칭 검수
│  │  ├─ sync/                 멤버 sync 이력 + 24h 검수
│  │  └─ orgs/new              v2 4가지 정책 입력
│  └─ api/
│     ├─ slack/events          Slack webhook (HMAC 검증)
│     └─ cron/                 7개 cron route
├─ docs/
│  ├─ v1-archive/              v1 PRD·README 보존
│  └─ HARNESS.md
├─ Gridge_Billing_MSP_PRD_v2.0.md   메인 PRD
├─ vercel.json                 cron 스케줄 7개
└─ README.md                   이 파일
```

## v2 핵심 흐름 6개

### 1. 충전 5단계 + 슬랙 ack (Gate #1)

```
고객 어드민 → /billing/charge 신청
   → action_requests INSERT (charge_request, status=awaiting_gate)
   ↓
슈퍼어드민 → /console/charges/[id] 컨펌 (Gate #1)
   → executeChargeRequest
     → createPendingCharge (wallet status=pending)
     → postTaxInvoiceRequest (Slack #세금계산서 자동 포스팅)
   ↓
세무 담당자 (화이트리스트 등재) → 슬랙 ✅ 리액션
   → POST /api/slack/events
   → verifySlackSignature → handleSlackEvent
   → confirm_slack_ack RPC
     → wallet status=active + tax_invoice_issued_at
```

### 2. 키 발급 (Q5 임계 + Q6 그릿지 미개입)

```
멤버 → /billing/api-keys 요청
고객 어드민 승인 → issueApiKey Server Action
   → executeKeyIssuance
     → consumeQuota (1h/3회 + 24h 쿨다운)
       (차단 시 KeyIssuanceBlockedError + blocked 이벤트)
     → adapter.createApiKey (벤더 API, 동적 토큰)
     → api_keys INSERT (그릿지 DB)
     → key_issuance_events 'issued'
   → redirect ?reveal={keyValueOnce}  (1회 노출)
```

### 3. 그림자 멤버 24h 검수 (f3)

```
1h cron → /api/cron/member-sync
   → 각 토큰별 adapter.listWorkspaceMembers
   → diff → register_shadow_member_pending
   → accounts.approval_status='pending_approval' + +24h
   ↓
24h 내: 고객 어드민 → decideShadowApproval
        → approve (팀 지정) or reject
   ↓
24h 만료: /api/cron/auto-approve-pending
          → daily_auto_approve_pending (관대 모드 자동 active)
```

### 4. 팀 헤드룸 2단 (Q1-d)

```
고객 어드민 → /billing/teams
   → setTeamHeadroom Server Action
   → team_headroom UPSERT
   → BEFORE 트리거: 팀 합계 ≤ Org headroom 검증
     (초과 시 EXCEPTION → UI에 에러 노출)
```

### 5. 사용량 분배 (FIFO + 환차)

```
월 5일 cron → /api/cron/invoice-polling
   → adapter.getInvoices (전월 기간)
   → saveVendorInvoice
   ↓
자동 매칭 cron → autoMatchPendingInvoices
   → vendor_total_krw vs card_charge_krw
   → match_status: matched (<1%) / partial (<5%) / mismatched (≥5%)
   ↓
allocateInvoice → 각 invoice_item 별:
   - basis: api_key_match → member_email_match → manual → default_unassigned
   - rejected 멤버는 skip
   - FIFO 다중 wallet 차감 (환율 변환 amount_krw_at_market → amount_krw_charged)
   - fx_pnl_krw = 차이 (슈퍼어드민 전용 v_fx_pnl_monthly 뷰)
```

### 6. 해지 (B-i + c)

```
고객 어드민 → /settings/termination
   → submitOrgTermination
   → request_termination RPC
     → grace_until = 다음 billing_day_of_month
     → 신규 충전·사용 차단 X (그대로 운영)
   ↓
매일 cron → /api/cron/finalize-termination
   → grace_until ≤ today 인 Org만 finalize_termination
   → 자원 회수 + wallet 만료
```

## 운영 정책 §13 (PRD §13 참조)

| § | 항목 | 정책 |
|---|---|---|
| 13.1 | 환불 | A3 (할인 회수 + 차액 환불), 지원금/체험 크레딧 거부 |
| 13.2 | 해지 | B-i + c (다음 결제일 grace, 충전·사용 그대로 운영) |
| 13.3 | 이관 | Phase 2 후 별도 |
| 13.4 | 카드 만료 | D-30/D-7/D-0 알림 + AM 전화 푸시 SOP, 자동 발급 X |
| 13.5 | 6개월 갱신 | 자동 갱신 X (e1 — 수동 슈퍼어드민) |
| 13.6 | 그림자 | f3 24h 검수 (관대 모드, 미응답 시 자동 active) |

## 마이그레이션 매핑

| ID | 파일 | 역할 |
|---|---|---|
| M-1001 | `20260515000001_v2_wallet_charges.sql` | 충전 ledger + FIFO + 환율 스냅샷 |
| M-1002 | `20260515000002_v2_discount_policies.sql` | 6개월 한정 할인 + 가시성 분리 |
| M-1003 | `20260515000003_v2_vendor_invoices.sql` | 청구서 진리원천 + 매칭 |
| M-1004 | `20260515000004_v2_member_sync.sql` | sync 잡 + 그림자 발견 |
| M-1005 | `20260515000005_v2_team_headroom.sql` | Org+팀 2단 자율승인 |
| M-1006 | `20260515000006_v2_vendor_admin_tokens.sql` | 1회 수동 토큰 (BYTEA 암호화) |
| M-1007 | `20260515000007_v2_key_issuance.sql` | 키 발급 정책 + 1h/3회 쿨다운 |
| M-1008 | `20260515000008_v2_usage_allocations.sql` | FIFO 다중 wallet + 환차 |
| M-1009 | `20260515000009_v2_slack_payments.sql` | 슬랙 화이트리스트 + ack |
| M-1010 | `20260515000013_v2_refund_policy.sql` | A3 환불 정책 |
| M-1011 | `20260515000014_v2_termination_flow.sql` | B-i+c 해지 흐름 |
| M-1012 | `20260515000015_v2_shadow_approval.sql` | f3 24h 검수 (관대) |
| M-1013 | `20260515000016_v2_card_expiry_notifications.sql` | D-30/D-7/D-0 알림 큐 |
| M-2001 | `20260515000010_v2_drop_credit_backs.sql` | credit_backs → _archive (v1 폐기) |
| M-2002 | `20260515000011_v2_simplify_billing_plan.sql` | plan='prepaid_v2' 단일화 |
| M-2003 | `20260515000012_v2_drop_creditback_columns.sql` | creditback 컬럼 DROP |

## v1 → v2 어휘 변경 (전체)

| v1 | v2 |
|---|---|
| `credit_backs` 테이블 | `wallet_charges` (Immutable ledger) |
| `contracts.creditback_rate` | `orgs.default_discount_rate` |
| 후불 청구 | 충전 선금제 |
| 일할 계산 (`prorate`) | 폐기 — `termination.ts` grace 흐름으로 대체 |
| 카드 거래 합산 = 진리원천 | `vendor_invoices` = 진리원천 / 카드 = 보조 검증 |
| Org headroom (1단) | Org + 팀 headroom (2단) |
| 월말 세계 발행 | 충전 시 즉시 슬랙 자동 포스팅 |
| `aiops` (배제 — 사용 금지) | `AI Observer` (전체 카피·코드) |

## 운영 모드

| 모드 | 설정 | 용도 |
|---|---|---|
| **Mock** | `NEXT_PUBLIC_MOCK_MODE=true` | 로컬 개발·e2e 테스트 |
| **Hybrid** | Mock=false + 실 Supabase | DB는 실, 벤더 어댑터는 결정적 mock |
| **Production** | 모든 env 실제값 | 실 운영 |

## 다음 라운드

| 우선순위 | 작업 |
|---|---|
| 높음 | e2e 시나리오 (충전→ack→사용→환차→환불 통합 테스트) |
| 중간 | wizard.tsx v2 통합 (orgs/new 4가지 설정을 wizard step에 내장) |
| 중간 | Anthropic·OpenAI endpoint 정정 (어댑터 실 호출 검증) |
| 낮음 | Phase 2 카드사 B2B API (Gate #2 자동화) |
| 낮음 | Smart Bill 협상 (세금계산서 자동 발행 API) |
| 낮음 | Wiring AI 통합 (AI Observer 모듈 흡수 예정) |

## 라이선스

Internal — Gridge / SoftSquared Inc.
v1 보존: `docs/v1-archive/Gridge_Billing_MSP_PRD_v1.0.md`
v2 PRD: `Gridge_Billing_MSP_PRD_v2.0.md` (905 라인 / 70 헤더)
