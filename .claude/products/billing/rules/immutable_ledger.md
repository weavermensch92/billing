# Billing / Rules / Immutable Ledger — 결제·감사 역기록 원칙

> **PB-005** — 결제·감사 관련 테이블은 UPDATE/DELETE 금지. 수정 시 역기록(reversal entry) 만 허용. 세무조사·분쟁 대응의 근거.

---

## PB-005-01. Immutable 대상 테이블 (7종)

| 테이블 | 이유 | 예외 |
|---|---|---|
| `transactions` | 결제 원장 (settled 이후) | status 업데이트만 허용 (settled 까지) |
| `audit_logs` | 감사 로그 전체 | 없음 (완전 immutable) |
| `credit_backs` | 크레딧백 적용 이력 | 없음 |
| `payment_receipts` | 수납 영수증 | 없음 |
| `interim_statements` (issued 이후) | 주간 내역서 | status 업데이트만 (issued 전) |
| `invoices` (issued 이후) | 청구서 | status 업데이트만 (issued 전) |
| `tax_invoices` (Smart Bill 발행 후) | 세금계산서 | 없음 |

## PB-005-02. DB 레벨 강제

```sql
-- 예시: transactions
CREATE RULE transactions_no_update_after_settled AS
  ON UPDATE TO transactions
  WHERE OLD.status = 'settled'
  DO INSTEAD NOTHING;

CREATE RULE transactions_no_delete AS
  ON DELETE TO transactions
  DO INSTEAD NOTHING;

-- audit_logs 완전 차단
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;

CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
```

서비스 role / admin role 도 예외 없음.

## PB-005-03. 역기록 (Reversal Entry) 패턴

결제 오류 / 크레딧백 계산 오류 수정 시:

**❌ 금지**: 기존 row UPDATE / DELETE
**✅ 허용**: 반대 부호로 새 row INSERT

```sql
-- 잘못된 크레딧백 발견 (₩900,000 → 실제는 ₩850,000 이어야 했음)

-- 원본 (수정 불가)
INSERT INTO credit_backs (..., credit_amount_krw, ...) VALUES (..., 900000, ...);

-- 역기록 1: 원본 취소 (부호 반대)
INSERT INTO credit_backs (..., credit_amount_krw, note, ...) VALUES (..., -900000, 'reversal of cb_xxx', ...);

-- 역기록 2: 정정
INSERT INTO credit_backs (..., credit_amount_krw, note, ...) VALUES (..., 850000, 'corrected from cb_xxx', ...);
```

**결과**:
- 순액: -900000 + 850000 = **-50000** (차액)
- 원장 흐름 완전 추적 가능
- 세무조사 시 역산 가능

## PB-005-04. 상태 전이는 허용 (UPDATE 예외)

```
transactions.status:  pending → authorized → settled
                                          → declined
                                          → reversed
```

상태 컬럼만 업데이트 허용. 금액 / 일시 / 참조 필드는 불변.

**State transition 감사**:
```sql
-- 트리거로 모든 상태 변경 audit_logs 기록
CREATE TRIGGER trg_transactions_state_audit
  AFTER UPDATE OF status ON transactions
  FOR EACH ROW EXECUTE FUNCTION log_state_change();
```

## PB-005-05. `audit_logs` 가시성 3분할

감사 로그는 고객 · 콘솔 양쪽 조회 가능 (권한별 마스킹):

```sql
audit_logs.visibility  TEXT CHECK (visibility IN ('customer_only','internal_only','both'))
```

- `customer_only`: 고객 포털만 (내부 감사에 숨김)
- `internal_only`: 콘솔만 (회계 분리, VCN 전체 조회 등 민감 작업)
- `both`: 양쪽 표시 (마스킹된 형태)

## PB-005-06. Immutable 필드 (row 내 일부만)

`transactions` 에서 일부 필드만 수정 가능:

| 필드 | immutable? |
|---|---|
| `id`, `org_id`, `account_id` | ✅ 완전 |
| `amount_krw`, `gridge_cost_krw`, `customer_charge_krw` | ✅ 완전 |
| `authorized_at`, `settled_at` | ✅ 완전 |
| `status` | 상태 머신 내에서만 |
| `invoice_id` | 월말 정산 후 설정 (이후 immutable) |
| `raw_payload` | ✅ 완전 (카드사 원본 웹훅) |

## PB-005-07. 보존 기간

| 데이터 | 보존 | 처리 |
|---|---|---|
| `transactions` | 2년 | 2년 후 `raw_payload` 만 압축 아카이브, 집계 필드 유지 |
| `audit_logs` | 3년 | immutable, 3년 후 cold storage 이관 |
| `invoices` | 10년 | 법정 보관 |
| `tax_invoices` | 10년 | 법정 보관 |
| `credit_backs` | 10년 | `invoices` 에 연동 |
| `payment_receipts` | 10년 | `invoices` 에 연동 |

## PB-005-08. 해지 시 예외 처리

고객 해지 D+30 완전 삭제 시:
- `orgs` 와 하위 테이블은 CASCADE 삭제
- `audit_logs` 는 `org_id = NULL` 로 유지 (법정 3년 보존)
- 세금계산서 / 청구서는 법정 10년 보존 (별도 아카이브)

고객 데이터 주권 + 감사 요건 양립.

## PB-005-09. 트리거 기반 자동 감사

```sql
CREATE OR REPLACE FUNCTION auto_audit_log() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    org_id, actor_id, action_type, target_table, target_id,
    before_data, after_data, visibility, created_at
  ) VALUES (
    COALESCE(NEW.org_id, OLD.org_id),
    current_setting('app.actor_id', true)::uuid,
    TG_OP || ':' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    to_jsonb(OLD),
    to_jsonb(NEW),
    'both',
    now()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

모든 민감 테이블에 AFTER INSERT/UPDATE 트리거 적용:
- `virtual_cards`, `accounts`, `invoices`, `credit_backs`, `org_contracts`, `members`

## PB-005-10. 자동 검증 체크리스트

- [ ] Immutable 테이블에 UPDATE/DELETE 쿼리 직접 실행?
- [ ] `audit_logs` UPDATE/DELETE 트리거 우회 시도?
- [ ] 역기록 없이 기존 row 를 "재사용" 하여 값 변경?
- [ ] `raw_payload` 수정 시도?
- [ ] 트리거 DROP / DISABLE 시도?
- [ ] `REVOKE` 없이 service_role 이 audit_logs 수정 가능?

## 참조

- `transactions`, `audit_logs`, `credit_backs`: `schemas/INDEX.md`
- 회계 분리 엔진: PB-009 (v0.19)
- 해지 시 데이터 삭제: `playbook/data-deletion.md` (v0.20)
- 세무 자문 리스트: `playbook/legal-tax-review.md` § 9-2 (v0.20)
- 원본 기획: `02_시스템_아키텍처.md § 11 감사 로그` + `03_데이터_모델.md § 1-1 Immutable Ledger`
- 공통 G-141 immutable: `08_security.md § 2`
