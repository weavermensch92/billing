# Billing / Rules / Billing Tier — 3단 결제 티어

> **PB-003** — 고객 규모·신용도에 따른 결제 사이클 3단 티어 (월간 / 주간 / 선불). 세금계산서는 월 1회 원칙 유지.

---

## PB-003-01. 3단 티어 정의

| 티어 | 코드 | 대상 | 결제 주기 | 세금계산서 | 운영 공수 |
|---|---|---|---|---|---|
| 1 | `monthly` | 월 ₩500만 이하, 신용도 검증 고객 | 월 1회 | 월 1장 | 낮음 |
| 2 | `weekly` | 월 ₩500만~₩2,000만 | 주 1회 중간 + 월 1회 최종 | 월 1장 | 중간 |
| 3 | `prepaid_monthly` | 월 ₩2,000만 초과 또는 신용도 낮음 | 선지급 + 월간 | 월 1장 | 낮음 |

**Alpha 고객 기본**: `monthly` (티어 1).

## PB-003-02. 티어 1 — 월간 (기본값)

```
M월 내내 결제 누적
     ↓
M+1월 1일  invoice_generation 배치
M+1월 3일  청구서 발행
M+1월 15일  납부 기한
```

가장 단순. 월말 배치 1회.

## PB-003-03. 티어 2 — 주간 중간 + 월간 세계서

```
[주 1] M/1~M/5   결제 누적
       M/6 (월)  주간 내역서 발행 (interim_statements)
                 "이번 주 결제 × 0.9 (크레딧백 적용)"
                 납부 기한: M/6 + 5영업일
       M/11      고객 입금 → payment_receipts(interim_statement_id)
                 
[주 2~4] 동일 반복

[월말]  M+1월 초 최종 세금계산서 1장 발행
                 공급가액: 그 달 settled 전체 × 0.9
                 VAT 10%
                 선수금 공제: 주간 입금 합계
                 최종 납부액: 잔액만
```

**핵심 세법 해석**:
- 세금계산서는 **월 1회, 공급시기 말일** 발행
- 주간 입금은 **선수금** 회계 처리
- 세무 리스크 없음

**필수 필드** (`invoices`):
- `interim_paid_krw` — 주간 선수금 누계
- `net_due_krw` — 최종 잔액 청구

## PB-003-04. 티어 3 — 선불 보증금 + 월간

```
[계약 체결]    고객이 1개월 예상 결제액 선지급 → 예치금
               org_contracts.deposit_remaining_krw = 선지급액

[M월]         그릿지 VCN 결제 진행 (예치금 관계없이 한도 내)

[M+1월 초]    청구서 발행
              "납부액 = 청구액 − 예치금 잔액"
              예치금 > 청구액 → 잔액 이월
              예치금 < 청구액 → 잔액만 청구

[계약 종료]   남은 예치금 반환 or 최종 청구와 상계
```

**예치금 보충 트리거**: `deposit_remaining_krw` 가 월 예상액의 **30% 이하** 도달 시 고객에 보충 안내.

## PB-003-05. 티어 선택·변경 정책

**계약 체결 시점**:
- Gridge 가 월 예상 결제액·신용도 평가
- 티어 권장 → 고객 협의 → 최종 결정

**자동 티어 이동 트리거** (Phase 1 이후 배치 감지):

| 이동 | 조건 |
|---|---|
| T1 → T2 (Upgrade) | 월 결제액 ₩500만 3개월 연속 초과 |
| T1/T2 → T3 (Upgrade) | 연체 발생 또는 월 ₩2,000만 돌파 |
| T2/T3 → T1 (Downgrade) | 6개월 무연체 + 결제액 감소 |

이동 변경은 `org_contracts.billing_tier` 업데이트 + **익월 사이클부터** 적용 (당월 중 변경 금지).

## PB-003-06. 권한

| 액션 | 권한 |
|---|---|
| 신규 계약 티어 지정 | AM (Luna) |
| 티어 변경 (T1↔T2) | AM |
| 티어 변경 (→T3) | Super (신용 리스크 평가) |
| 티어 변경 (T3→하향) | Super |

모든 변경은 `audit_logs` 기록 + 고객 통지.

## PB-003-07. 데이터 모델 반영

```sql
-- org_contracts 핵심 필드
billing_tier             TEXT CHECK (billing_tier IN ('monthly','weekly','prepaid_monthly'))
monthly_credit_limit_krw BIGINT
deposit_remaining_krw    BIGINT  -- 티어 3 전용

-- interim_statements 테이블 (티어 2 전용)
id                  UUID
org_id              UUID
invoice_id          UUID   -- 월말 최종 세계서와 연결
week_start_date     DATE
week_end_date       DATE
subtotal_before_cb  BIGINT
credit_back_amount  BIGINT
subtotal_krw        BIGINT  -- (0.9 × 원가)
paid_at             TIMESTAMPTZ
status              TEXT CHECK (status IN ('draft','issued','paid','void'))

-- invoices 필드
interim_paid_krw    BIGINT DEFAULT 0   -- 티어 2 선수금 차감
deposit_used_krw    BIGINT DEFAULT 0   -- 티어 3 예치금 차감
net_due_krw         BIGINT             -- 최종 고객 납부액
```

## PB-003-08. Phase 전환 체크리스트

| 기능 | Phase 0 | Phase 1 | Phase 2 |
|---|---|---|---|
| T1 월간 배치 | ✅ 수동 검수 | ✅ 자동 | ✅ 안정화 |
| T2 주간 배치 | 테이블·API만 | **실행 로직 구현** | 안정화 |
| T3 선불 상계 | 테이블·API만 | **실행 로직 구현** | 안정화 |
| 자동 티어 이동 감지 | — | 수동 평가 | 배치 자동 감지 |

**Alpha 고객**: `billing_tier = 'monthly'` 고정 시작. T2/T3 는 Phase 1 두 번째 고객부터.

## PB-003-09. 자동 검증 체크리스트

- [ ] T2 고객이 주간 세금계산서 발행 (세법 위반)?
- [ ] 티어 변경을 당월 중 적용 (원장 혼란)?
- [ ] T3 예치금 음수 허용?
- [ ] T2 `interim_paid_krw` 가 월말 세계서에 선수금 공제로 반영되지 않음?
- [ ] AM 이 T3 업그레이드 단독 실행 (Super 권한 우회)?

## 참조

- 세금계산서 발행: `rules/immutable_ledger.md` (PB-005)
- 크레딧백 0.9 계산: `rules/creditback.md` (PB-004)
- 월말 정산 플로우: `playbook/month-end-close.md` (v0.20)
- `invoices` / `interim_statements` / `org_contracts`: `schemas/INDEX.md`
- 원본 기획: `02_시스템_아키텍처.md § 5 결제 사이클`
