# Billing / Playbook / Termination — 이관·해지·재계약 절차

> D-30 ~ D+30 공식 절차. 데이터 주권 보호 + 법정 보관 양립.

---

## 3가지 시나리오

| 시나리오 | 대표 상황 | 기간 |
|---|---|---|
| **계약 연장** (자동) | 6개월 크레딧백 종료 후 유지 | 영구 (auto_renew) |
| **중도 해지** | 고객 주도 해지 | D-30 ~ D+30 |
| **이관** | M&A, 사업자 변경 | 별건 처리 (Super 2단계 승인) |

---

## A. 계약 연장 (자동)

### 6개월 크레딧백 종료 시점

`org_contracts.creditback_end_date` 도달 → 자동 처리:

**변경 없는 것**:
- 서비스 이용 (AI 계정·VCN 유지)
- 월 신용한도 (`monthly_credit_limit_krw`)
- 담당 AM

**변경되는 것**:
- 크레딧백 적용 종료 (`creditback_end_date` 경과)
- 고객 청구액 = **원가 100%** (일반 서비스는 마진 0, Anthropic 패스스루는 지속)

### CSM 액션 (종료 D-60 ~ D-30)

```
D-60  upsell_signals INSERT (type='renewal_risk')
      CSM 피드 노출

D-45  CSM 재계약 협상 개시
      옵션 제안:
       1. 유지 (크레딧백 종료 후 원가 청구)
       2. 크레딧백 연장 (신규 AI 서비스 도입 조건부)
       3. Wiring 번들 (I-005 업셀)
       4. AiOPS 추가 도입 (별도 요금)

D-30  최종 협의 완료 (서면 합의 or Slack 확인)

D-0   creditback_end_date 도달
      M6 결제분 크레딧백 마지막 적용 → M7 청구서
      final_creditback_applied = TRUE

D+1   계약 자동 연장 (해지 없음)
      선택된 옵션 반영 (org_contracts 업데이트)
```

### 티어 재평가 동시 진행

```sql
-- 자동 티어 이동 감지 (PB-003-05)
-- Upgrade 조건 충족 시 CSM 에 제안 (고객 동의 필수)
SELECT o.id, o.name,
  AVG(monthly_total) AS avg_monthly,
  CASE
    WHEN AVG(monthly_total) > 20000000 THEN 'prepaid_monthly'
    WHEN AVG(monthly_total) > 5000000  THEN 'weekly'
    ELSE 'monthly'
  END AS recommended_tier
FROM orgs o
JOIN LATERAL (
  SELECT SUM(customer_charge_krw) AS monthly_total
  FROM transactions WHERE org_id = o.id
  AND billing_month >= CURRENT_DATE - interval '3 months'
  GROUP BY billing_month
) stats ON TRUE
GROUP BY o.id, o.name;
```

---

## B. 중도 해지

### Step 1: 고객 주도 해지 통지

```
[고객 Owner] Slack Connect or 콘솔 /app/settings/data-export 해지 의향 표시
      ↓
[Luna] 협의 미팅 일정 잡기 (1~3일 내 Zoom)
      ↓
[조건 확인]:
  - 잔여 크레딧백 포기 인지
  - 미수 잔액 (overdue_actions 조회)
  - 이관 희망 여부 (있으면 시나리오 C)
  - 최종 해지 확정일 합의
      ↓
[contract 업데이트]
  UPDATE org_contracts SET terminated_at = '{agreed_date}'
  WHERE org_id = $1 AND terminated_at IS NULL;
  
  UPDATE orgs SET status = 'terminating' WHERE id = $1;
```

### Step 2: D-30 ~ D+0 절차

```
D-30  공식 해지 통지 (이메일 + Slack)
      "해지 확정일: {date}"
      최종 청구 일정 안내

D-14  신규 VCN 발급 중단
      UPDATE service_flags SET vcn_issuance_paused = TRUE
        WHERE org_id = $1;
      
      고객 포털 /app/services/new 에 안내 배너:
      "해지 진행 중 — 신규 계정 요청 불가"

D-7   이관 준비 (고객 측 제어권 확인)
      - 각 AI 서비스 결제 수단 교체 계획
      - 벤더 직접 계약 전환 필요성

D-1   마지막 결제 예정 (정상 처리)

D+0   해지 확정
      - orgs.status = 'terminated'
      - 모든 VCN status = 'revoked'
      - 이후 새 결제 차단

D+15  최종 청구서 발행
      - M월 잔여 결제 + 크레딧백 최종 적용
      - 미수 잔액 합산

D+30  데이터 유예 종료 → 자동 처리 (아래 Step 4)
```

### Step 3: 잔존 작업 (고객 측)

**고객이 직접 해야 하는 것**:
- 각 AI 서비스의 결제 수단을 자사 카드로 교체
- 벤더와 직접 계약 체결 (원하는 서비스만)
- 구독 직접 해지 (원하지 않는 서비스)

**Gridge 가 할 수 없는 것**:
- 벤더 계정 자체 이관 (각 벤더 약관 제약)
- 사용 이력 이관 (벤더 내부 데이터)

### Step 4: D+30 완전 삭제

```
D+0 ~ D+30   유예 기간
  - 모든 데이터 보존
  - 읽기 전용 접근 가능
  - 고객이 /app/settings/data-export 에서 전체 ZIP 다운로드

D+30          자동 삭제
  [Super 콘솔] /console/orgs/[id]/danger → [완전 삭제] 확인
      ↓
  1. 최종 ZIP export 자동 생성 (export_jobs)
  2. Supabase Storage 에 아카이브 (3년 보존)
  3. orgs + 하위 테이블 CASCADE 삭제
  4. audit_logs 는 org_id = NULL 로 유지 (법정 3년)
  5. invoices / tax_invoices / credit_backs 는 법정 10년 별도 아카이브
  6. 고객에 "데이터 삭제 완료 확인서" 이메일
```

### 법정 10년 보관 예외

```sql
-- 세무 기록은 삭제 대신 아카이브 테이블 이관
INSERT INTO invoices_archive SELECT * FROM invoices
  WHERE org_id = '{terminated_org_id}';

INSERT INTO tax_invoices_archive SELECT * FROM tax_invoices
  WHERE invoice_id IN (SELECT id FROM invoices WHERE org_id = '{terminated_org_id}');

-- 이후 현재 테이블에서 삭제
DELETE FROM invoices WHERE org_id = '{terminated_org_id}';
```

---

## C. 이관 (고객 내부 변경)

### 사업자번호 변경 (M&A 등)

**Super 전용 위험 액션** (`service.code_migrate`):
- 2단계 Super 승인 필수 (Super 2명 동의)
- 기존 데이터는 유지 + 조직 정보만 업데이트
- 이전 사업자의 세금계산서는 **이전 정보로**, 이후는 **새 정보로**

```sql
-- Step 1: 이전 사업자 기록 아카이브
UPDATE orgs SET
  business_registration_no = '{new_biz_no}',
  name = '{new_name}',
  metadata = jsonb_set(metadata, '{previous}',
    jsonb_build_object(
      'biz_no', '{old_biz_no}',
      'name', '{old_name}',
      'migrated_at', now()
    )
  )
WHERE id = '{org_id}';

-- Step 2: 이관 감사 로그
INSERT INTO audit_logs (
  org_id, actor_type, actor_id, action_type,
  target_table, target_id, before_data, after_data, visibility
) VALUES (
  '{org_id}', 'admin', '{super_id}', 'service.code_migrate:orgs',
  'orgs', '{org_id}', ...,
  'internal_only'  -- 민감 액션
);
```

### Owner 양도 (고객 내부)

**현재 Owner 만 양도 가능** (PB-001 Owner 불변 원칙).

API: `POST /api/org/members/:id/transfer-owner`

```sql
BEGIN;
  UPDATE members SET role = 'admin' WHERE org_id = $1 AND role = 'owner';
  UPDATE members SET role = 'owner' WHERE id = $new_owner_id;
  -- audit_logs 자동 기록 (트리거)
  -- 고객 내부 Slack 통지
COMMIT;
```

---

## D. 해지 관련 금전 정산

### 티어 1 (월간)
- M월 결제 → M+1월 청구 (일반 플로우)
- 해지 후 M+15일 최종 청구서
- 미수 잔액 있으면 연체 조치

### 티어 2 (주간)
- 주간 선수금 잔액 이월 (환급 아님)
- 최종 세금계산서에 잔액 차감

### 티어 3 (선불 예치금)
```sql
-- 예치금 잔액 조회
SELECT deposit_remaining_krw FROM org_contracts WHERE org_id = $1;

-- 최종 청구와 상계
IF deposit_remaining >= final_invoice_total:
  deposit_used = final_invoice_total
  refund_amount = deposit_remaining - final_invoice_total
ELSE:
  deposit_used = deposit_remaining
  additional_billing = final_invoice_total - deposit_remaining
```

환급 방법:
- **계좌 입금** (Finance 수동, Phase 0)
- 환급 세금계산서 별도 발행

---

## KPI

- **해지 통지 → D+0**: 평균 30일 (동의한 기간 준수)
- **데이터 삭제 확인서 발급**: D+30 + 3영업일 내 100%
- **재계약 전환율**: 해지 통지 → 취소 비율 ≥ 40% (CSM 노력)
- **이관 성공률**: 사업자 변경 케이스 100% (무사고)

## 자동 알림 설정

### 고객 측
- D-30 통지: 이메일 + Slack Connect
- D-14 배너: 고객 포털 상단
- D-1 경고: 이메일 + Slack
- D+30 확인서: 이메일

### 내부
- D-30: CSM Slack 알림 + monthly_reviews 엔트리
- D-14: Ops 알림 (VCN 정지 준비)
- D+0: Super 알림 (해지 확정 감사 로그)
- D+30: Super 승인 요청 (완전 삭제 최종 확인)

## 참조

- `org_contracts.terminated_at`: `schemas/tables/org_contracts.md`
- 데이터 주권: `products/billing/CLAUDE.md § 7-4`
- Immutable 예외: `rules/immutable_ledger.md § PB-005-08`
- Phase 0 절차: `playbook/phase0-day1-runbook.md` (역방향)
- 법무 자문 (해지 조항): `playbook/legal-tax-review.md § E`
- 원본: `07_운영_플레이북.md § 8 이관·해지·재계약`
