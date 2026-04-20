# Billing / Schemas / org_contracts — 테이블 본문

> 고객사 계약 (티어 / 크레딧백 / 예치금 / 신용 한도). org 당 1 레코드 (활성).

---

## DDL

```sql
CREATE TABLE org_contracts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,

  -- 계약 기간
  contract_start_date         DATE NOT NULL,
  contract_end_date           DATE,                  -- NULL = 무기한
  auto_renew                  BOOLEAN DEFAULT TRUE,
  terminated_at               TIMESTAMPTZ,           -- 해지 시점

  -- 결제 티어 (PB-003)
  billing_tier                TEXT NOT NULL DEFAULT 'monthly'
                              CHECK (billing_tier IN ('monthly','weekly','prepaid_monthly')),
  monthly_credit_limit_krw    BIGINT NOT NULL,       -- 월 신용 한도

  -- 선불 (티어 3 전용)
  deposit_initial_krw         BIGINT DEFAULT 0,
  deposit_remaining_krw       BIGINT DEFAULT 0,

  -- 크레딧백 (PB-004)
  creditback_rate             NUMERIC(4,3) DEFAULT 0.100,
  creditback_end_date         DATE NOT NULL,         -- 일반 6개월 후
  final_creditback_applied    BOOLEAN DEFAULT FALSE,

  -- 담당자 메모
  internal_notes              TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_contracts_active ON org_contracts(org_id)
  WHERE terminated_at IS NULL;
CREATE INDEX idx_org_contracts_creditback_end ON org_contracts(creditback_end_date)
  WHERE final_creditback_applied = FALSE;
```

## 제약

- org 당 **활성 계약은 1개** (partial unique index 로 강제):
```sql
CREATE UNIQUE INDEX uniq_org_contracts_active
  ON org_contracts(org_id)
  WHERE terminated_at IS NULL;
```

- `creditback_end_date >= contract_start_date` (CHECK 가능)
- `billing_tier = 'prepaid_monthly'` 이면 `deposit_initial_krw > 0` 필수 (트리거로 검증)

## 필드 설명

### `billing_tier` (PB-003)

| 값 | 의미 | 예치금 | 세계서 주기 |
|---|---|---|---|
| `monthly` | 월 1회 (Alpha 고객 기본) | 불필요 | 월 1장 |
| `weekly` | 주간 내역서 + 월 세계서 | 불필요 | 월 1장 (선수금 공제) |
| `prepaid_monthly` | 선불 예치금 + 월간 | **필수** | 월 1장 (예치금 차감) |

### `monthly_credit_limit_krw`

그릿지 대지급 한도. 이 금액 초과 결제 감지 시:
- `anomaly_events` INSERT
- 신규 VCN 발급 일시 중단
- Super 알림

**계산 가이드**: 예상 월 결제액 × 1.3 배 (버퍼).

### `creditback_end_date`

기본 `contract_start_date + 6 months`. 재협상으로 연장 가능:
```sql
UPDATE org_contracts SET creditback_end_date = '2027-05-01' WHERE org_id = $1;
-- audit_logs 자동 기록 (트리거)
```

### `final_creditback_applied` (PB-004-05)

M6 청구서 발행 시 자동 `TRUE` 전환:
```sql
-- invoice_generation 배치 내
IF billing_month = contract.creditback_end_date - interval '1 month' THEN
  UPDATE org_contracts SET final_creditback_applied = TRUE WHERE org_id = $1;
END IF;
```

이후 고객 포털 배너 "마지막 크레딧백이 적용되었습니다" 노출.

## 상태 전이

```
[신규 계약]   contract_start_date 설정
              creditback_end_date = start + 6 months
              billing_tier 지정
              auto_renew = TRUE

[크레딧백 종료 D-60]   CSM 알림 (upsell_signals)

[크레딧백 종료 D-30]   고객 포털 경고 + Owner 이메일

[M6 청구 시]   final_creditback_applied = TRUE

[크레딧백 종료 후]   자동 연장 (해지 없음) → CSM 재협상

[해지 확정 시]   terminated_at 설정
                 orgs.status = 'terminating'
                 D+0 VCN 전수 정지
```

## RLS

```sql
ALTER TABLE org_contracts ENABLE ROW LEVEL SECURITY;

-- Owner/Admin 조회
CREATE POLICY "org_contracts_owner_select"
  ON org_contracts FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM members
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner','admin')
        AND status = 'active'
    )
  );
```

Member 는 접근 불가 (신용 한도 / 예치금 민감 정보).

## 주요 쿼리

```sql
-- 현재 활성 계약
SELECT * FROM org_contracts
WHERE org_id = $1 AND terminated_at IS NULL;

-- 크레딧백 종료 60일 이내 (upsell 대상)
SELECT oc.*, o.name FROM org_contracts oc JOIN orgs o ON o.id = oc.org_id
WHERE oc.terminated_at IS NULL
  AND oc.creditback_end_date BETWEEN now() AND now() + interval '60 days'
  AND oc.final_creditback_applied = FALSE;

-- 티어 3 예치금 부족 경고 (월 예상액 30% 이하)
SELECT * FROM org_contracts
WHERE billing_tier = 'prepaid_monthly'
  AND deposit_remaining_krw < monthly_credit_limit_krw * 0.30;
```

## 참조

- 3단 티어 규칙: `rules/billing_tier.md` (PB-003)
- 크레딧백 규칙: `rules/creditback.md` (PB-004)
- 해지 절차: `playbook/termination.md` (v0.20)
- 원본: `03_데이터_모델.md § 5-4 org_contracts`
