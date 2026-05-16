# Gridge Billing MSP — PRD v2.0

> 본 문서는 v1.0을 대체합니다. v1.0은 후불 청구 + 6개월 크레딧백 모델, v2.0은 **충전 선금제 + 6개월 한정 할인 + 벤더 청구서 진리원천**으로 모델이 근본적으로 바뀌었습니다. v1.0은 `_archive_` 영역으로 보존됩니다.

## 0. 문서 요약 (TL;DR)

```
[v1.0 → v2.0 핵심 변화]
수익 모델     : 월 후불 + 6개월 크레딧백  →  충전 선금 + Org별 할인율 + 6개월 한정
청구 진리원천 : 카드 거래 합산           →  벤더 invoice API (옵션 3)
세계 발행 시점: 월말 자동                →  충전·증액 즉시 (충전 신청 즉시 자동 슬랙 포스팅)
헤드룸 단계   : 1단 (Org)                →  2단 (Org + 팀)
환차          : (개별)                   →  고객 결제 시점 환율 고정, 그릿지 흡수
멤버 동기화   : 없음                      →  1h sync + 그림자 멤버 감지·해소
할인기간 시작 : 가입 시점                →  첫 계정 active 전이 시점 (account.status='active')

[그릿지 게이트키퍼 원칙 — 2개만 사람 컨펌]
1. 충전 컨펌 (돈이 들어올 때)
2. 카드번호 입력 (카드사 OOB 작업 결과 시스템 등록)
→ Phase 1에 카드사 B2B API 연동 시 게이트 1개로 축소

[Phase 0 → Phase 1 → Phase 2 → Phase 3]
Phase 0 : 어휘 정합 (`AiOPS`→`AI Observer`, `통제`→`관리`, `제안 자동화`→`업셀 시그널 자동 감지`)
Phase 1 : v2 마이그레이션 12개 적용 + lib·UI v2 전환
Phase 2 : 카드사 B2B API + 벤더 SSO + Smart Bill 자동 발행 웹훅
Phase 3 : Wiring AI 전환 — 업셀 시그널 자동 감지 → CSM 직접 제안
```

---

## 1. 제품 비전 / 문제 정의

### 1.1 해결하려는 문제

기업 고객이 다수의 AI 벤더(Anthropic·OpenAI·Cursor 등)를 사용할 때 발생하는 운영 부담을 그릿지가 단일 진입점으로 흡수한다:

- 벤더별 결제수단 관리, 카드 변경, 세금계산서 별도 수령
- 팀·멤버별 비용 분리 추적 불가
- 환차 리스크 (USD 결제 + KRW 회계)
- 어떤 멤버가 어떤 워크스페이스에 가입했는지 파악 어려움
- 키 발급·삭제 관리 부재

### 1.2 제공하는 가치

- **단일 KRW 청구서** — 모든 벤더 비용을 그릿지가 통합 청구
- **즉시 할인 세계 발행** — 충전 시점에 할인 적용된 KRW로 세금계산서
- **환차 흡수** — 고객은 충전 시점 환율로 고정, 시장 환율 차이는 그릿지 부담
- **그림자 멤버 자동 감지** — 1h sync로 1시간 내 발견·고객 어드민 알림
- **팀 2단 헤드룸** — Org → 팀 분배로 부서 운영 자율성
- **벤더 청구서 진리원천** — 카드 거래·사용량 매핑 누락 시에도 청구 정합

### 1.3 사업적 포지션

```
Gridge AIMSP 4제품 중 Billing MSP (Mode D)
  - AI Observer  : 사용 로그 + 거버넌스
  - LucaPus      : 개발 AI 프레임워크
  - Wiring AI    : 개발 그룹웨어
  - Billing MSP  ← 본 문서

엔터프라이즈 6개월 사용 후 자연스러운 Wiring AI 전환을 위한
업셀 시그널을 자동 감지하는 진입점 역할
```

---

## 2. 목표 사용자 / 페르소나

### 2.1 1차 고객 (Buyer)

- **국내 엔터프라이즈·중견기업** AI 도구 구매·운영 책임자
- 다수 벤더 (Anthropic·OpenAI·Cursor·기타) 동시 사용
- 월 ₩100만~₩5,000만 AI 비용 규모

### 2.2 2차 사용자 (Users)

| 역할 | 책임 |
|---|---|
| 고객 어드민 (Owner) | Org 전체 운영, 벤더 토큰 등록, 팀·헤드룸 분배, 카드 교체 체크리스트 |
| 고객 팀 어드민 (Team Admin) | 자기 팀 헤드룸 내 운영, 멤버 추가·제거 (벤더 동기 반영) |
| 고객 멤버 (Member) | 자기 사용량·키 조회, API 발급 신청 (어드민 승인 필요) |

### 2.3 운영 주체 (Gridge Side)

| 역할 | 인원 | 책임 |
|---|---|---|
| AM (Luna) | 1 | 고객 계정·요청 처리, 월간 리뷰, 그림자 멤버 알림 대응 |
| 슈퍼어드민 (위버) | 1 | 충전 컨펌, 카드번호 입력, 할인율·결제일·헤드룸 지정, 6개월 갱신 |
| Finance/Ops (Phase 1+) | TBD | 벤더 invoice 매칭 검수, 환차 회계, 마감 |

### 2.4 역할 사전 (Glossary)

| 호칭 | 동의어 | 의미 | 권한 범위 |
|---|---|---|---|
| **슈퍼어드민** | 그릿지 어드민, Super, Gridge Admin | 그릿지가 고객사 운영·관리 | 전 고객사 |
| **고객 어드민** | Owner, Org Admin (별도 표기 없는 모든 "어드민"은 이쪽) | 고객 Org 최상단 | 자기 Org 전체 |
| **고객 팀 어드민** | Team Admin | 고객 Org 내 팀별 어드민 | 자기 팀만 |

코드 식별자: `super_admin` / `org_admin` / `team_admin` (snake_case 고정).

---

## 3. 성공 지표 (KPI)

### 3.1 Phase 1 Alpha 지표 (3개월)

| 지표 | 목표 |
|---|---|
| 충전 신청 → 컨펌까지 SLA | 4 시간 (영업시간) |
| 슬랙 ✅ → wallet active SLA | < 5분 |
| 첫 계정 active 후 할인 정책 자동 생성 정합 | 100% |
| 그림자 멤버 발견 → 고객 어드민 알림 SLA | 1시간 |
| 벤더 invoice ↔ 카드 거래 매칭 정합도 | > 99% |
| 환차 손익 변동성 (월별 fx_pnl 표준편차) | < 청구 총액의 1% |

### 3.2 Phase 2 전환 조건

| 조건 | 임계 |
|---|---|
| 운영 중 Org | ≥ 5 |
| 월간 충전 총액 | ≥ ₩5,000만 |
| 그림자 멤버 평균 해소 시간 | ≤ 24시간 |
| 충전 → wallet active 자동화 비율 | ≥ 95% |
| 카드사 B2B API 협상 완료 | 1개사 이상 |

### 3.3 Phase 3 장기 목표

- Anthropic Claude Partner Network 승인 후 파일럿 5개 Org
- Wiring AI 전환 — 업셀 시그널 자동 감지 → 6개월 후 자연 전환율 ≥ 30%

---

## 4. 핵심 흐름 (1~10번)

```
[가입 — Setup]
1. 슈퍼어드민이 그릿지 측 LLM API 센터 마스터 계정 연동 (Anthropic Admin / OpenAI Admin)
2. 슈퍼어드민이 고객 Org 생성 + 4가지 설정
   · 기본 할인율 (default_discount_rate, 기본 0.1)
   · 결제일 (billing_day_of_month, 1~28)
   · 잔액 만료 (wallet_default_validity_months, 기본 12)
   · Org headroom (self_approval_headroom_krw)

[정보 입력 — Onboarding]
3. 고객이 정보 입력
   · 어떤 AI × 계정 유형(개인/팀/엔터) × 수량 × 용도
   · 예상 API 비용
   · 사업자등록증 + 세금계산서 담당자 (이름·연락처·이메일)

[충전 신청 — Charging]
4. 고객이 충전 신청 (KRW gross 금액)
   4-1. 슈퍼어드민 컨펌 ← Gate #1
   4-2. 슈퍼어드민이 대행 입력해서 스킵 가능
   4-3. 컨펌 시 계약서 샘플 노출 (3번 정보 자동 채움)

[세계 발행 — Tax Invoice]
5. wallet_charge 컨펌 즉시 #세금계산서_발행_신청 채널에 자동 포스팅
   · 금액 = gross × (1 - discount_rate) [할인 적용가]
6. 발행 담당자 ✅ 리액션 (화이트리스트 검증) → wallet_charge.status = active
   · 같은 순간 tax_invoice_issued_at 기록
   · 같은 순간 첫 wallet active 알람 (단순 알람, discount_policy는 별개)

[API 키 발급 — Provisioning]
7. 그릿지가 벤더 admin API로 키 발급 → 고객 어드민에 노출
   7-1. 담당자 신청 → 고객 어드민 승인 → 발급 (그릿지에 신청 안 옴)
   7-2. 키 삭제 후 같은 페이지 내 즉시 재발행 가능 (1h/3회 임계, 24h 쿨다운)

[카드 발급 + 연동 — Card Binding]
8. 슈퍼어드민이 카드번호 입력 ← Gate #2
9. 고객이 벤더 콘솔에서 카드 직접 입력 (Idea 1 — 수동 가이드 + 일회용 패널)
   9-1. 엔터/팀 → 카드 등록 후 1회 수동 토큰 등록 (벤더 admin API 권한 인계)
       · 등록 후 그릿지 페이지에서 멤버 증감이 벤더에 즉시 자동 반영
   9-2. 개인 → 단순 카드 교체 체크리스트

[첫 계정 활성 → 할인 정책 자동 시작]
* accounts.status가 처음 'active'로 전이된 순간:
  · 6개월 할인 정책 자동 INSERT (rate=orgs.default_discount_rate)
  · 슈퍼어드민은 매 순간 갱신 가능 (renew_discount_policy)
  · 6개월 도달 시 검토 알림 (자동 만료 X — 명시적 변경 전까지 유지)

[사용 → 차감]
* 사용 발생 시 잔액 → 헤드룸 순차 소진
  순서:
   1) wallet 잔액 FIFO 차감 (만료 빠른 순)
   2) 잔액 부족 → 팀 헤드룸 차감
   3) 팀 헤드룸 부족 → Org headroom 차감
   4) 모두 부족 → AM 정식 요청

[월간 정산 — Settlement]
10. Org별 결제일에 헤드룸 사용분 청구
    · 결제일은 슈퍼어드민이 Org별 지정
    · pg_cron 매일 호출, 오늘이 결제일인 Org만 처리
    · 헤드룸 + 팀 헤드룸 동시 리셋
    · 할인기간 내라면 동일 할인율 적용

[추가 — 그림자 멤버 자동 감지]
* 1h마다 벤더 admin API로 멤버 sync
* 새 멤버 발견 시 자동 등록 + 미할당 팀 임시 배치 + 고객 어드민 알림
* 청구 시도 X (누락 < 오인 원칙)
* 워크스페이스 결제 단절 24h 지속 시 anomaly 알림
```

---

## 5. 게이트키퍼 원칙

```
[그릿지 사람이 손대는 게이트 = 2개]
  Gate #1  충전 컨펌      (돈이 들어올 때)
  Gate #2  카드번호 입력  (카드사 OOB 작업 결과 시스템 등록)

[고객 자율 = 그릿지 미개입]
  - API 키 발급·삭제·재발행
  - 카드 교체 (벤더 콘솔에서 고객이 직접)
  - 팀 멤버 증감 (그릿지 페이지 → 벤더 자동)
  - 팀 헤드룸 분배

[시스템 자동]
  - 세금계산서 슬랙 자동 포스팅
  - 첫 account active → 할인 정책 INSERT
  - 멤버 sync 1h
  - 결제일 헤드룸 리셋
  - 잔액 만료 처리
  - 벤더 invoice 폴링·매칭

[Phase 2 진입 시 게이트 축소]
  카드사 B2B API 연동 → Gate #2 자동화 → Gate 1개로 축소
```

---

## 6. 데이터 모델

### 6.1 v2 신규 (12개 마이그레이션)

| # | 마이그레이션 | 핵심 객체 |
|---|---|---|
| M-1001 | `wallet_charges` | 충전 + Immutable ledger + FIFO + 환율 스냅샷 + auto expires_at |
| M-1002 | `discount_policies` | Org별 할인율 + 6개월 + 검토 알림 + visible/active 뷰 분리 + orgs 컬럼 3종 추가 |
| M-1003 | `vendor_invoices`+`items` | 청구 진리원천 (Immutable) + 매칭 검증 + 미할당 식별 |
| M-1004 | `member_sync_jobs`+`events`+`shadow_member_findings` | 1h sync + UPSERT + 워크스페이스 결제 단절 룰 |
| M-1005 | `teams`+`team_headroom`+`members.team_id` | 팀 2단 + 미할당 자동 + 합계 검증 + Org별 결제일 리셋 |
| M-1006 | `vendor_admin_tokens` | 1회 수동 등록 + 암호화 + 회전 |
| M-1007 | `key_issuance_policies`+`quota`+`events` | 1h/3회 임계 + 24h 쿨다운 + 원자 함수 |
| M-1008 | `usage_allocations`+`v_fx_pnl_monthly`+`v_team_usage_breakdown` | 환차 변환 + 팀 분배 + 미할당 |
| M-1009 | `slack_messages`+`whitelist`+`payments_inbound` | ✅ 화이트리스트 + confirm_slack_ack + 입금 |
| M-2001 | `_archive_credit_backs_v1` | v1 보존 + RLS 슈퍼어드민만 |
| M-2002 | `simplify_billing_plan` | plan='prepaid_v2' 단일화 + DEPRECATED |
| M-2003 | `drop_creditback_columns` | orgs/contracts/invoices 컬럼 정리 + 이관 |

상세 SQL: `supabase/migrations/202605150000*.sql` 12개 파일 참조.

### 6.2 v1 유지·확장

| 영역 | 변경 |
|---|---|
| billing 스키마 분리, RLS 패턴 | ✅ 그대로 |
| `audit_logs` + visibility enum | 🔧 `org_internal` 추가 (5분 카드 조회) |
| `self_approval_headroom_krw` | 🔧 신규 `team_headroom`과 짝, Org별 결제일 리셋으로 변경 |
| `anomaly_rules` 9 seed | 🔧 신규 1건 `'workspace_payment_break'` |
| VCN 9단계 상태머신 | ✅ 그대로 |
| `vendor_api_calls` 감사 | ✅ 그대로 + sync 호출 추가 |
| Realtime publication | ✅ 그대로 |
| `accounts.provider_user_id` 매핑 | ✅ 그대로 |
| 회계 분리 트리거 (PB-009) | ✅ 그대로 (검증식만 wallet 기준으로) |

### 6.3 v1 폐기

| 객체 | 처리 |
|---|---|
| `credit_backs` 테이블 | RENAME → `_archive_credit_backs_v1` (보존) |
| `orgs.creditback_start_at/end_at` | DROP |
| `org_contracts.creditback_*` 4개 | 이관(rate→orgs.default_discount_rate) 후 DROP |
| `invoices.subtotal_before_creditback`/`credit_amount` | DROP |
| `BillingPlan` enum 3종 | 단일 `'prepaid_v2'`로 통일, DEPRECATED 컬럼 잔존 |

### 6.4 ERD 한 장 (핵심만)

```
                   orgs ── default_discount_rate
                    │      billing_day_of_month
                    │      wallet_default_validity_months
                    │      self_approval_headroom_krw
                    │      self_approval_used_krw
        ┌───────────┼───────────┬──────────────┐
        ▼           ▼           ▼              ▼
   discount_      wallet_     teams ──── team_headroom
   policies      charges        │
        │           │           │
        │           │       members.team_id
        │           │
        │       wallet_ledger (immutable, FIFO 차감 역기록)
        │
   v_org_active_discount  (내부, 0% 포함)
   v_org_visible_discount (고객 노출, rate>0만)


   vendor_invoices ──── vendor_invoice_items
        │                       │
        │                       ▼
        │              usage_allocations ─── teams (분배)
        │              (amount_usd / market_krw / charged_krw / fx_pnl_krw)
        │                       │
        └───── matched ←─→ transactions (P1, 카드 거래)


   slack_messages ─── slack_acknowledger_whitelist
        │   confirm_slack_ack(channel, ts, emoji, slack_user_id)
        │   → wallet_charges.status pending → active
        ▼
   payments_inbound


   member_sync_jobs ── member_sync_events ── shadow_member_findings
                       (account_id NULL이면 그림자)


   vendor_admin_tokens (1회 수동 등록, 회전, 폐기)
        │
        └─ used by: member sync / key issuance / invoice fetch


   key_issuance_policies ── key_issuance_quota ── key_issuance_events
                            (1h/3회 + 24h 쿨다운)
```

---

## 7. 기능 요구사항

### 7.1 F-CHG — 충전 흐름

| ID | 요구사항 |
|---|---|
| F-CHG-01 | 고객이 KRW gross 금액으로 충전 신청 |
| F-CHG-02 | 슈퍼어드민 컨펌 시 `wallet_charges` row INSERT (status=pending) |
| F-CHG-03 | 컨펌 시 슬랙 #세금계산서 채널에 자동 포스팅 (gross × (1-discount_rate) 금액 포함) |
| F-CHG-04 | 슈퍼어드민이 4-1을 스킵하고 4-2로 대행 입력 가능 |
| F-CHG-05 | expires_at NULL이면 orgs.wallet_default_validity_months 기준 자동 계산 |
| F-CHG-06 | discount_rate는 충전 시점 orgs.default_discount_rate 스냅샷 (이후 정책 변경 영향 X) |
| F-CHG-07 | 환율 스냅샷 (`exchange_rate_at_charge`, `fx_source`, `fx_at`) 충전 시점 기록 |
| F-CHG-08 | 충전 0원 = wallet_charges row 생성 안 함 (할인 정책도 미시작) |

### 7.2 F-DISC — 할인 정책

| ID | 요구사항 |
|---|---|
| F-DISC-01 | accounts.status가 처음 'active' 전이 시 `discount_policies` 자동 INSERT |
| F-DISC-02 | INSERT 시 rate=orgs.default_discount_rate, period_months=6 |
| F-DISC-03 | Org당 active 정책 1개만 (partial unique index) |
| F-DISC-04 | 슈퍼어드민이 `renew_discount_policy` 호출 시 기존 ended_early_at 종료 + 새 row + parent_policy_id 연결 |
| F-DISC-05 | 자동 만료 없음 (period_end_at은 검토 알림 기준일) |
| F-DISC-06 | 6개월 도달 알림 (D-30, D-7, D-0) — 별도 알림 잡 |
| F-DISC-07 | `v_org_active_discount` = 내부용 (0% 포함) / `v_org_visible_discount` = 고객 노출 (rate>0만) |
| F-DISC-08 | 0% 정책 row는 생성하되 고객 UI에서 할인 섹션 숨김 |

### 7.3 F-HRM — 헤드룸 2단

| ID | 요구사항 |
|---|---|
| F-HRM-01 | Org → 팀 2단 헤드룸 |
| F-HRM-02 | 차감 순서: wallet 잔액 → 팀 헤드룸 → Org 헤드룸 (잔액→헤드룸 순차) |
| F-HRM-03 | 팀 헤드룸 합계 ≤ Org 헤드룸 (BEFORE INSERT/UPDATE 트리거 검증) |
| F-HRM-04 | 합계 초과 시 EXCEPTION → 고객 어드민 UI 표시 |
| F-HRM-05 | Org별 결제일에 헤드룸 + 팀 헤드룸 동시 0 리셋 |
| F-HRM-06 | 헤드룸 사용분은 익월 결제일 청구 (할인기간 내라면 동일 할인율 적용) |

### 7.4 F-INV — 벤더 청구서 진리원천

| ID | 요구사항 |
|---|---|
| F-INV-01 | 매월 벤더 invoice API 폴링 → `vendor_invoices` + `items` INSERT |
| F-INV-02 | core 필드 Immutable (vendor·org·total_usd·exchange_rate·raw_payload) |
| F-INV-03 | items 완전 Immutable |
| F-INV-04 | `v_invoice_vs_card_diff` 자동 매칭 (<1% matched / <5% partial / 이상 mismatched) |
| F-INV-05 | 매칭 안 된 invoice (mismatched)는 슈퍼어드민 검수 큐에 표시 |
| F-INV-06 | `v_unallocated_invoice_items` = 멤버·키 매핑 없는 라인 → 미할당 팀 자동 배치 |
| F-INV-07 | invoice 단일 진리원천 = 카드 거래 합산 X. 매칭은 보조 검증. |

### 7.5 F-USE — 사용량 매핑 + 환차 흡수

| ID | 요구사항 |
|---|---|
| F-USE-01 | 라인 → 멤버·팀 매핑: 4 basis (api_key_match / member_email_match / manual / default_unassigned) |
| F-USE-02 | FIFO 다중 wallet 걸침 시 라인당 여러 `usage_allocations` row |
| F-USE-03 | `amount_krw_at_market` = USD × 시장 환율 (그릿지 실 지출) |
| F-USE-04 | `amount_krw_charged` = USD × wallet 환율 (고객 차감액) |
| F-USE-05 | `fx_pnl_krw` = market - charged (양수=그릿지 손실, 음수=이익) |
| F-USE-06 | `v_fx_pnl_monthly` = 슈퍼어드민 전용 (고객 미노출) |
| F-USE-07 | `v_team_usage_breakdown` = 팀별 청구 분배 (amount_krw_charged 기준) |

### 7.6 F-SLK — 슬랙 ✅ 자동화

| ID | 요구사항 |
|---|---|
| F-SLK-01 | 충전 컨펌 → `slack_messages` INSERT + 자동 포스팅 (subject=tax_invoice_request) |
| F-SLK-02 | 발행 담당자 ✅ 리액션 → `confirm_slack_ack()` 호출 |
| F-SLK-03 | 화이트리스트 검증: slack_user_id + active + 채널·주제 일치 |
| F-SLK-04 | 통과 시 message status acked → wallet_charge active 전이 → tax_invoice_issued_at 기록 → message completed |
| F-SLK-05 | 미통과 시 이벤트 무시 + 감사 로그 |
| F-SLK-06 | 같은 메시지 중복 ack 차단 |

### 7.7 F-SHD — 그림자 멤버

| ID | 요구사항 |
|---|---|
| F-SHD-01 | 1h cron으로 멤버 sync 잡 실행 |
| F-SHD-02 | account_id NULL = 그림자 → `shadow_member_findings` UPSERT |
| F-SHD-03 | 자동 등록 정책: accounts row 자동 INSERT + 미할당 팀 배치 |
| F-SHD-04 | 청구 시도 안 함 (누락 < 오인 원칙) |
| F-SHD-05 | 워크스페이스 결제 단절 24h 지속 → anomaly_rule trigger (workspace_payment_break) |
| F-SHD-06 | 발견 시 슈퍼어드민·고객 어드민 알림 (notified_super_at, notified_org_admin_at) |
| F-SHD-07 | resolution 5종: auto_registered, manual_assigned, ignored, removed_at_vendor, unresolved |

### 7.8 F-CARD — 카드 교체 (Idea 1)

| ID | 요구사항 |
|---|---|
| F-CARD-01 | Org당 1 VCN 표준 (사용량 API 없는 벤더만 계정별 VCN 예외) |
| F-CARD-02 | 슈퍼어드민이 카드번호 입력 ← Gate #2 |
| F-CARD-03 | 카드정보 노출: 기본 마스킹 영구 + 5분 조건부 전체번호 (고객 어드민 권한 + 2FA 재확인) |
| F-CARD-04 | 5분 조회 시 audit_logs 기록 (visibility='org_internal') |
| F-CARD-05 | 카드 교체 UX: 수동 가이드 + 일회용 패널 (자동화 0) |
| F-CARD-06 | OTP 면제: 카드사 발급 시점에 해외 결제 OTP 면제 사전 등록 |

### 7.9 F-KEY — API 키 발급 (Q5 임계)

| ID | 요구사항 |
|---|---|
| F-KEY-01 | 그릿지 마스터 계정에서 키 신규 발급 → 고객 어드민에 노출 |
| F-KEY-02 | 담당자 신청 → 고객 어드민 승인 후 발급 (그릿지에 신청 안 옴) |
| F-KEY-03 | 키 발급 임계: 1h/3회 + 24h 쿨다운 (Org별 조정 가능) |
| F-KEY-04 | 같은 페이지에서 즉시 재발행 OK (실수 복구), 페이지 이탈 시 정식 재신청 |
| F-KEY-05 | `consume_key_issuance_quota` 원자 함수 + FOR UPDATE 락 |
| F-KEY-06 | 임계 초과 차단 시 `key_issuance_events` blocked_by_quota=TRUE 기록 |

### 7.10 F-TKN — 벤더 토큰 1회 등록

| ID | 요구사항 |
|---|---|
| F-TKN-01 | 카드 교체 직후 1회 수동 토큰 등록 (벤더 콘솔에서 admin token 생성 후 그릿지 페이지 붙여넣기) |
| F-TKN-02 | 앱 레이어 암호화 (AES-256-GCM) → BYTEA로 DB INSERT |
| F-TKN-03 | DB에 평문 토큰 절대 저장 안 함 |
| F-TKN-04 | token_prefix (첫 8자) UI 마스킹용 |
| F-TKN-05 | (org, vendor, workspace) 당 active 토큰 1개만 |
| F-TKN-06 | 회전: `rotate_vendor_token(old, new, by)` → 기존 rotated 상태로 + 연결 |

---

## 8. 비기능 요구사항

### 8.1 보안

| 영역 | 요구사항 |
|---|---|
| RLS | 모든 billing 스키마 테이블 RLS 활성. 정책: org_id=my_org_id() / is_admin_user() |
| 암호화 | `vendor_admin_tokens.token_encrypted` 앱 레이어 AES-256-GCM. DB 평문 X. |
| Immutable Ledger | wallet_ledger / vendor_invoice_items / member_sync_events / key_issuance_events UPDATE/DELETE 차단 |
| audit_logs | visibility enum: public / org_internal / internal_only (super_only) |
| 카드정보 | 영구 마스킹 + 5분 조건부 노출 + 감사 로그 |

### 8.2 회계 분리 (PB-009)

```
billing 스키마와 AI Observer 스키마 물리적 분리 유지
환차 손익은 별도 fx_pnl_ledger 또는 wallet_ledger.detail JSON에 기록
고객 차감액 != 그릿지 실 지출
v_fx_pnl_monthly 슈퍼어드민 전용 (RLS 차단)
```

### 8.3 환차 흡수 정책

```
- 고객은 KRW 잔액·KRW 청구만 봄
- 충전 시점 USD→KRW 환율을 wallet_charges.exchange_rate_at_charge에 스냅샷
- 사용량 차감 시 wallet 환율 기준 KRW로 차감
- 그릿지가 실제 카드사에 결제한 KRW(시장 환율)와 차이는 그릿지 손익
- 환차 변동 모니터링: v_fx_pnl_monthly
```

### 8.4 동시성

- `consume_wallet`·`consume_team_headroom`·`consume_key_issuance_quota` 모두 FOR UPDATE 락
- 원자 함수로 부분 차감 없음 (전체 성공 또는 실패)

### 8.5 가용성

- pg_cron 잡: 멤버 sync (1h), wallet 만료 (1d), 헤드룸 리셋 (1d), invoice 폴링 (1d)
- 잡 실패 시 재시도 + 슬랙 알림

### 8.6 규제 준수

- 세금계산서 = Smart Bill·Popbill 연동 (Phase 2). Phase 1은 수동 발행 후 슬랙 ✅
- 사업자등록증·세금계산서 담당자 정보는 orgs/org_contracts에 보관

---

## 9. UI / 페이지 구조

### 9.1 고객 포털 (라우트)

| 경로 | 상태 | 핵심 |
|---|---|---|
| `/home` | 🔧 확장 | 잔액·헤드룸·할인기간 D-N 카드 |
| `/services/new` | 🔧 단순화 | 카드 등록 = Idea 1 가이드 (5단계 wizard 축소) |
| `/services/[id]` | 🔧 확장 | 카드 교체 = 일회용 패널 |
| `/billing/wallet` | ✨ 신규 | 충전 이력·잔액·만료 |
| `/billing/charge` | ✨ 신규 | 충전 신청 5단계 |
| `/billing/api-keys` | ✨ 신규 | 키 발급·삭제·재발행 (Q5 임계 표시) |
| `/billing/teams` | ✨ 신규 | 팀별 헤드룸 분배 |
| `/billing/cards` | ✨ 신규 | 마스킹 + 5분 조건부 노출 |
| `/billing/[id]` | 🔧 재작성 | 사용량 분배 + 벤더 청구서 매칭 |
| `/billing/creditback` | ❌ 폐기 | → `/billing/wallet` 으로 대체 |
| `/org/members` | ✅ 유지 | |
| `/requests` | 🔧 재정의 | 요청 종류 변경 반영 |

### 9.2 운영 콘솔

| 경로 | 상태 | 핵심 |
|---|---|---|
| `/console/home` | 🔧 확장 | 충전 대기 / 벤더 청구서 검수 / 그림자 멤버 |
| `/console/orgs/new` | 🔧 확장 | 4가지 설정 입력 (할인율·결제일·만료·헤드룸) |
| `/console/orgs/[id]` (8탭) | 🔧 확장 | 탭 추가: Wallet·Discount·Sync 이력 |
| `/console/charges` | ✨ 신규 | 충전 컨펌 큐 (Gate #1) |
| `/console/vendor-invoices` | ✨ 신규 | 벤더 청구서 수신·매칭·검수 |
| `/console/sync` | ✨ 신규 | 멤버 sync 이력 + 그림자 멤버 처리 |
| `/console/payments` | 🔧 단순화 | 카드 거래 = 이상감지 중심 |
| `/console/vcn/[id]` | ✅ 유지 | |

### 9.3 폐기·재작성 매트릭스

| 영역 | 폐기 | 재작성 | 신규 |
|---|---|---|---|
| 고객 페이지 | 1 (creditback) | 4 (home·services·billing·requests) | 5 (wallet·charge·api-keys·teams·cards) |
| 콘솔 페이지 | 0 | 5 (home·orgs/new·orgs/[id]·invoices·payments) | 3 (charges·vendor-invoices·sync) |

---

## 10. 운영 시나리오

### 10.1 충전 → 사용 (정상)

```
T0   고객: /billing/charge 에서 ₩10,000,000 신청
T0+5m  슈퍼어드민: /console/charges 컨펌 (Gate #1)
       → wallet_charges INSERT (gross=10M, rate=0.1, net=9M, status=pending)
       → 슬랙 자동 포스팅 (₩9,000,000)
T0+10m 발행 담당자: 세무 시스템에서 세계 발행 + 슬랙 ✅
       → confirm_slack_ack() → wallet status=active + tax_invoice_issued_at
T0+15m 고객: 첫 account 카드 교체 완료 → account.status=active
       → discount_policy 자동 INSERT (rate=0.1, period=6m)
T1     사용 발생 (Anthropic $100, 시장 환율 1400, 충전 시 환율 1300)
       → 다음 invoice 도착 시 차감
T1+1d  vendor_invoice 도착
       → allocate_invoice_item_single($100, market=1400, wallet=1300, team=Eng, member=Alice, basis=api_key_match)
       → market_krw = 140,000 / charged_krw = 130,000 / fx_pnl_krw = +10,000 (그릿지 손실)
       → wallet 차감 130,000 (FIFO)
```

### 10.2 그림자 멤버 발견 → 해소

```
T0   고객 어드민이 Anthropic Console 직접 들어가 새 멤버 추가
T0+1h 멤버 sync 잡 실행
      → vendor 멤버 5명 vs 그릿지 DB 4명 → 1명 차이
      → member_sync_events.event_type='added', account_id=NULL
      → shadow_member_findings UPSERT
T0+1h slack 알림 → 슈퍼어드민·고객 어드민
T0+1h 고객 어드민 UI 알림 + /org/members 에서 자동 등록 멤버 확인 + 팀 지정
      → shadow_member.resolution='manual_assigned', assigned_team_id 채움
```

### 10.3 6개월 할인 갱신

```
D-30  슈퍼어드민 알림 (할인 정책 검토일 임박)
D-7   알림 강도 ↑
D-0   "자동 만료 없음. 검토만." 알림
       (Q-V1: 매 순간 슈퍼어드민이 변경 가능, 자동 동작 X)
D+? 슈퍼어드민이 협상 결과로 renew_discount_policy(org, new_rate=0.05, 6, super_id) 호출
       → 기존 정책 ended_early_at + 새 정책 INSERT + parent_policy_id 연결
       → 새 충전부터 새 rate 적용 (기존 wallet_charge의 스냅샷은 유지)
```

### 10.4 카드 교체 (Idea 1)

```
T0   고객 어드민: /billing/cards 에서 Anthropic VCN [전체번호 5분 조회] 클릭
      → 2FA 재확인
      → 5분 카운트다운 시작
      → audit_logs INSERT (org_internal)
T0+1m 새 탭으로 console.anthropic.com 열기
      → Billing → Payment methods → 카드 수동 입력
      → OTP 면제 사전 등록되어 추가 인증 없이 등록 완료
T0+3m 고객 어드민 페이지로 복귀 → 체크리스트 ✅ 클릭
T0+3m 같은 페이지에서 "벤더 admin token 1회 등록" 단계
      → Anthropic Workspace에서 token 생성
      → 그릿지 페이지 붙여넣기 → vendor_admin_tokens INSERT (암호화)
      → 이후 멤버 sync 자동 시작
```

### 10.5 이의 제기

```
T0   고객 어드민이 청구서 검토 → 의문 발생
      → /billing/[id] 페이지에서 담당 AM·슈퍼어드민 연락처 확인 (UI)
      → 슬랙·이메일로 직접 이의 제기
T0+1d 슈퍼어드민이 vendor_invoice 원본 + 카드 거래 + 사용량 로그 대조
      → 잘못된 청구로 판명 시:
        · 발행 전이면 보류 처리
        · 발행 후면 다음 달 차감 또는 환불 (wallet_ledger 역기록)
```

---

## 11. 리스크 / 가정

### 11.1 가정

```
- 벤더 invoice API 제공 (Anthropic·OpenAI 확인. Cursor 미확인.)
- 벤더 admin token으로 멤버 sync·키 발급 가능
- 카드사가 OTP 면제 사전 등록 지원
- pg_cron 사용 가능 (Supabase 지원)
- 슬랙 Bot 서명 검증 및 이벤트 구독 가능
```

### 11.2 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| Cursor invoice API 없음 → 진리원천 불가 | 한정 벤더 폴백 필요 | 카드 거래 + 사용량 매칭 폴백 (M-1003 v_invoice_vs_card_diff) |
| 환차 급변동 → 그릿지 손실 확대 | 재무 영향 | v_fx_pnl_monthly 모니터링 + Phase 2 헷지 검토 |
| 벤더 토큰 만료·취소 → sync 중단 | 그림자 멤버 감지 누락 | token expires_at 만료 알림 + 회전 잡 |
| Org당 1 VCN → 한 카드 도난 시 전체 영향 | 보안 | VCN 일시 정지 + 신속 재발급 |
| 슬랙 ✅ 화이트리스트 멤버 퇴사 | ack 불가 | 다중 인원 화이트리스트 등록 권장 |
| Phase 2 카드사 API 협상 지연 | Gate #2 자동화 지연 | 수동 게이트 유지로 운영 가능 (Phase 1 그대로) |
| `_archive_credit_backs_v1` 부정확한 보존 | 감사 시 정합 X | 폐기 전 archive 검증 절차 |

### 11.3 운영 한계 (계약·정책 영역)

```
- 그림자 워크스페이스 (별도 워크스페이스 + 개인 카드) → 그릿지 추적 불가
  → 약관: "회사 업무 = 그릿지 워크스페이스에서만" 명시
- 회사 도메인 별도 가입 + 개인 카드 → 그릿지 추적 불가
  → 약관 + 벤더 SSO 강제 권장 (고객 운영 가이드)
- 사용량 API 없는 벤더 → 팀 분배 불완전
  → 카드 거래 이상감지 후행 보완 + 약관 고지
```

---

## 12. 로드맵

### Phase 0 — 어휘 정합 (완료)

```
✅ `AiOPS` → `AI Observer` (367 라인 / 82 파일)
✅ `제안 자동화` → `업셀 시그널 자동 감지` (1 라인)
✅ I-005 본문 의미 보강 (1 라인)
✅ `통제` → `관리` (1 라인)
✅ 컬럼명 aiops_org_id 식별자 유지 (디렉토리·경로 일관성)
```

### Phase 1 — v2 마이그레이션 + lib·UI 전환 (4~6주)

```
Week 1   M-1001, M-1002 적용 + 검증
Week 2   M-1003, M-1004, M-1007 + Realtime 검증
Week 3   M-1005, M-1006, M-1008, M-1009
Week 4   lib/billing/* 재작성 (wallet, discount-policy, vendor-invoice, usage-allocator, key-issuance)
Week 5   lib/vendor-api/ 확장 + lib/slack/ 신규
Week 6   UI 신규·재작성 + e2e
```

### Phase 2 — 자동화 + 외부 연동 (2~3개월)

```
- 카드사 B2B API 연동 → Gate #2 자동화
- Smart Bill·Popbill 세무 SaaS 연동 → 슬랙 ✅ 대체 (D 옵션)
- 벤더 SSO 강제 권장 (고객 운영 가이드)
- 환차 헷지 (재무 검토)
- Phase 2 마이그레이션 M-2001 ~ M-2003 적용
- BillingPlan 컬럼 DROP (v2.1)
```

### Phase 3 — Wiring AI 전환 자동 시그널

```
- 업셀 시그널 자동 감지 (4종)
  · 개발팀 AI 비중 50%+ + 월 ₩500만+
  · AI 서비스 8개+ 분산
  · API 월 ₩1,000만+
  · 할인 정책 갱신 D-60
- CSM 월간 리뷰에서 직접 제안 (자동 제안 X — 어휘 규칙)
- Wiring 라이선스 전환 플로우
```

---

## 13. 11번 뒷부분 — 운영 정책 (결정 확정)

흐름 1~10번의 후속 운영 정책. v2.0 결정 라운드 결과 반영.

### 13.1 환불 정책 — A3 (할인 회수 후 차액 환불)

```
[원칙]
- wallet_charges.refundable BOOLEAN 으로 환불 가능 여부 표시
  · TRUE (디폴트) — 일반 충전, A3 정책 적용
  · FALSE        — 지원금·체험 크레딧, 환수 불가

[해지와 분리된 별도 액션]
- 환불 신청은 해지 신청과 독립
- 해지 신청 후 또는 전에 가능
- 환불 처리 중에도 c (서비스 그대로 운영)

[A3 환불 계산 — 일반 충전]
충전 시점:
  gross  = ₩10,000,000 (신청 금액)
  rate   = 0.10        (당시 적용 할인율)
  net    = ₩9,000,000  (실 입금액)

환불 신청 시점 (잔여 ₩4,000,000 net 가정):
  잔여 gross  = ₩4,000,000 / (1 - 0.10) = ₩4,444,444
  사용 gross  = ₩10,000,000 - ₩4,444,444 = ₩5,555,556
  사용분 할인 = ₩555,556 (사용된 만큼 할인 회수)
  환불액      = ₩4,000,000 (잔여 net 그대로 환원)
  세계 정정   = 마이너스 ₩4,000,000 (세무 시스템에서 마이너스 세계)

[지원금 (refundable=FALSE) 환수 신청]
- process_refund_a3() 함수가 EXCEPTION
- 알림: "지원금은 환수 불가. 만료일까지 사용 가능."

[관련 SQL]
M-1010: refundable 컬럼 + process_refund_a3() 함수
```

### 13.2 해지 흐름 — B-i + c 분리 모델

```
[해지 신청 (종료 통보)]
- 액션: request_termination(org_id, member_id, reason)
- 효과:
  · orgs.termination_requested_at = NOW
  · termination_grace_until = 다음 billing_day_of_month
  · orgs.terminated_at = NULL (정리 완료 전까지)
- 운영:
  · 신규 충전 차단 X (c — 그대로 운영)
  · 신규 사용 차단 X
  · 직원·고객 영향 0 (해지 진행 모름 가능)

[grace 기간 — B-i 다음 결제일까지]
- 결제일이 매월 15일이고 3월 5일 신청 → 3월 15일까지 grace
- 결제일이 매월 15일이고 3월 16일 신청 → 4월 15일까지 grace (약 30일)
- grace 기간 0~30일 가변

[결제일 정리 — finalize_termination]
- pg_cron이 매일 호출. termination_grace_until ≤ today 인 Org 처리
- 카드 회수, 키 비활성화, vendor admin token revoke
- 잔액 처리:
  · refundable=TRUE: 만료까지 보유 (고객이 환불 신청 안 했으면 만료 정책으로 자연 폐기)
  · refundable=FALSE: 동상 (만료 정책)
- orgs.terminated_at = NOW

[환불 신청 — 별도 액션 (해지와 독립)]
- 해지 신청과 무관하게 언제든 가능
- process_refund_a3() 호출
- 잔액 환수 + 세계 정정 + 입금 환불

[관련 SQL]
M-1011: termination 컬럼 + request_termination / finalize_termination 함수
```

### 13.3 Org 이관 — Phase 2 후 결정

```
- 현재 미지원
- 사용 사례 발생 시 Phase 2에서 결정
- 임시 해결: 새 Org 신설 + 기존 해지 + 잔액은 환불 정책 따름
- 후보 함수 예약 (구현 X):
  merge_orgs(source_org_id, target_org_id, super_id)
```

### 13.4 카드 만료 처리 — 알림 + 휴먼 푸시

```
[자동 발급 X — D1 옵션 채택 안 함]
- 만료 임박 자동 발급은 보안·회계 리스크 큼
- 슈퍼어드민·고객 어드민·AM이 알림 받고 명시적으로 D4 수동 회전

[알림 SLA]
- D-30: 슈퍼어드민·고객 어드민 알림 (대시보드·이메일·슬랙)
- D-7:  알림 강도 ↑ + AM에 푸시 (전화·메신저)
- D-0:  최종 알림 + 슈퍼어드민·AM이 고객사 직접 전화 푸시 (SOP)

[만료 도달 후]
- 시스템 차원 자동 액션 X
- 카드 결제 거절 → workspace_payment_break anomaly_rule 트리거 (24h 내)
- 슈퍼어드민이 D4 수동 회전 트리거

[관련 SQL]
M-1013: card_expiry_notifications 큐 + daily cron
[운영 SOP]
AM 전화 푸시 워크플로우 (시스템 외)
```

### 13.5 6개월 할인 정책 자동 갱신 — 수동만 (e1)

```
- Q-V1 결정 그대로 유지
- 슈퍼어드민이 매 순간 renew_discount_policy 호출 가능
- 자동 만료 없음. 명시적 변경 전까지 같은 정책 유지.
- 6개월 도달 시 검토 알림 (D-30/D-7/D-0)

[Phase 2 검토 항목]
- orgs.auto_renew_discount BOOLEAN 옵션 추가
- TRUE면 period_end_at 도달 시 동일율로 자동 6개월 연장
- 현재(v2.0)는 옵션 추가 안 함
```

### 13.6 그림자 멤버 24h 검수 모드 — f3

```
[1h sync에서 그림자 발견 시]
1. shadow_member_findings INSERT (UPSERT)
2. accounts INSERT (status = 'pending_approval')
3. pending_approval_until = NOW + 24h
4. 고객 어드민·슈퍼어드민에 알림

[24h 내 고객 어드민 결정]
- [승인] → accounts.status = 'active'
            + 팀 지정 (기본: 미할당 팀)
            + 다음 sync부터 사용량 정상 매핑
- [거부] → accounts.status = 'rejected'
            + 사용량 매핑 X (미할당 표시)
            + audit_logs 기록

[24h 미응답 — 관대 모드 디폴트]
- 자동 'active' 전이 (미할당 팀)
- 알림 한 번 더 (24h 만료됨)

[Phase 2 검토 항목]
- 엄격 모드 (24h 미응답 → 자동 rejected) Org별 토글
- 현재(v2.0)는 관대 모드만

[관련 SQL]
M-1012: accounts.approval_status 컬럼 + 24h 만료 cron
```

---

## 부록

### A. 12개 마이그레이션 매핑표

| 마이그레이션 | 기능 ID | 라인 | 객체 |
|---|---|---:|---:|
| M-1001 wallet_charges | F-CHG-* | 294 | 16 |
| M-1002 discount_policies | F-DISC-* | 227 | 9 |
| M-1003 vendor_invoices | F-INV-* | 220 | 15 |
| M-1004 member_sync | F-SHD-* | 202 | 20 |
| M-1005 teams + team_headroom | F-HRM-* | 301 | 18 |
| M-1006 vendor_admin_tokens | F-TKN-* | 143 | 7 |
| M-1007 key_issuance | F-KEY-* | 205 | 17 |
| M-1008 usage_allocations | F-USE-* | 210 | 7 |
| M-1009 slack + payments | F-SLK-*, F-CHG-04 | 215 | 16 |
| M-2001 archive credit_backs | (폐기) | 63 | 0 |
| M-2002 simplify billing_plan | (폐기) | 50 | 2 |
| M-2003 drop creditback cols | (폐기) | 68 | 3 |
| **합계** | | **2,398** | **130** |

### B. v1 → v2 어휘 변경표

| v1 | v2 | 영역 |
|---|---|---|
| `AiOPS` | `AI Observer` | 전 영역 (식별자 제외) |
| `통제` | `관리`·`운영` | 자연어 |
| `제안 자동화` | `업셀 시그널 자동 감지` | 통합 문서 |
| credit_back | wallet_charge.discount | 데이터 모델 |
| creditback_rate | discount_rate (snapshot) | 데이터 모델 |
| creditback_months | period_months | 데이터 모델 |
| 6개월 후 환원 | 6개월 한정 즉시 할인 | 수익 모델 |
| 월 후불 청구 | 충전 선금 + 익월 헤드룸 청구 | 수익 모델 |
| 카드 거래 단일 진리원천 | 벤더 청구서 단일 진리원천 | 청구 모델 |

### C. 게이트 ↔ 결정사항 매트릭스

| 게이트 | 결정 ID | 자동/수동 | Phase 2 변경 |
|---|---|---|---|
| 충전 컨펌 | Q6 | 수동 (슈퍼어드민) | 유지 |
| 카드번호 입력 | Q6 | 수동 (슈퍼어드민) | 자동 (카드사 B2B API) |
| 슬랙 ✅ | Q3 A | 반자동 (사람 ✅ + 자동 트리거) | 자동 (Smart Bill 웹훅) |
| API 키 발급 | Q6 | 자동 (Q5 임계 정책) | 유지 |
| 카드 교체 | Q4-a | 수동 (고객, Idea 1) | 반자동 (브라우저 익스텐션 옵션) |
| 멤버 sync | QS1 | 자동 (1h cron) | 유지 |
| 벤더 토큰 등록 | Q4-1 A | 수동 1회 | 자동 (OAuth 가능 시) |
| 할인 정책 갱신 | Q-V1 | 수동 (슈퍼어드민) | 자동 동일율 갱신 옵션 |

---

**End of v2.0 PRD**

> 본 문서는 SQL 마이그레이션 12개 + Phase 0 어휘 패치 + 의사결정 1라운드를 통합한 결과입니다.
> v2.1은 13번 미정 영역 결정 + Wiring AI 전환 시그널 + 카드사 B2B API 협상 결과를 반영합니다.
