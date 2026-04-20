# Billing / Rules / Accounting Split Engine — 회계 분리 엔진

> **PB-009** — transactions 수신 시 `gridge_cost` / `customer_charge` / `gridge_margin` / `is_anthropic_passthrough` 자동 계산. DB 트리거 + 애플리케이션 레이어 2단계.

---

## PB-009-01. 목적

1 개의 결제 이벤트를 **재무제표 분리 자동 처리**:
- Gridge 매입가 (회계: 매입)
- 고객 청구가 (회계: 매출)
- 마진 (내부 지표)
- Anthropic 파트너십 패스스루 여부 (재협상 자료)

이 분리를 **트리거 / 애플리케이션 레이어 / View** 3계층으로 강제.

## PB-009-02. 계산 순서 (애플리케이션 레이어)

카드사 웹훅 수신 직후 (또는 CSV import 시) 실행:

```typescript
async function processIncomingTransaction(raw: CardIssuerWebhook) {
  // 1. 가맹점 → 서비스 매칭
  const service = await resolveService(raw.merchant_descriptor);

  // 2. 패스스루 판단 (PB-007)
  const isPassthrough = 
    service?.vendor === 'Anthropic'
    && await isFeatureFlagActive('anthropic_passthrough');

  // 3. 환율 환산 (이미 KRW 이면 그대로)
  const amountKrw = raw.currency === 'KRW'
    ? raw.amount
    : Math.round(raw.amount * raw.fx_rate);

  // 4. 금액 3필드 분리
  const gridgeCost     = amountKrw;   // 그릿지 실제 지불
  const customerCharge = amountKrw;   // 고객에게 청구 (패스스루/일반 동일)
  const gridgeMargin   = 0;           // 기본 0 (크레딧백은 별도 credit_backs)

  // 5. INSERT
  await db.insert('transactions', {
    ...raw,
    amount_krw: amountKrw,
    gridge_cost_krw: gridgeCost,
    customer_charge_krw: customerCharge,
    gridge_margin_krw: gridgeMargin,
    is_anthropic_passthrough: isPassthrough,
    billing_month: calcBillingMonth(raw.authorized_at),
  });
}
```

## PB-009-03. DB 트리거 (방어선)

애플리케이션 레이어 우회 방지용. 필드 누락 시 자동 채움:

```sql
CREATE OR REPLACE FUNCTION enforce_accounting_fields() RETURNS TRIGGER AS $$
BEGIN
  -- gridge_cost 누락 시 amount_krw 로 대체
  IF NEW.gridge_cost_krw IS NULL THEN
    NEW.gridge_cost_krw := NEW.amount_krw;
  END IF;

  -- customer_charge 누락 시 gridge_cost 로 대체 (기본 = 원가 재판매)
  IF NEW.customer_charge_krw IS NULL THEN
    NEW.customer_charge_krw := NEW.gridge_cost_krw;
  END IF;

  -- margin 자동 계산
  NEW.gridge_margin_krw := NEW.customer_charge_krw - NEW.gridge_cost_krw;

  -- is_anthropic_passthrough 검증 (vendor 매칭)
  IF NEW.is_anthropic_passthrough = TRUE THEN
    IF NOT EXISTS (
      SELECT 1 FROM services 
      WHERE id = NEW.service_id AND vendor = 'Anthropic'
    ) THEN
      RAISE EXCEPTION 'is_anthropic_passthrough=TRUE but service vendor != Anthropic';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_accounting
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION enforce_accounting_fields();
```

## PB-009-04. View 3계층 격리

| View | 용도 | gridge_cost | customer_charge | margin | passthrough | raw |
|---|---|---|---|---|---|---|
| `transactions` (raw) | DB 직접 | ✅ | ✅ | ✅ | ✅ | ✅ |
| `v_transaction_customer` | 고객 포털 | ❌ (숨김) | ✅ `amount_krw` 표기 | ❌ | ❌ | ❌ |
| `v_transaction_internal` | 콘솔 Finance/Super | ✅ | ✅ | ✅ | ✅ | ✅ |

고객 포털 API 는 **반드시** `v_transaction_customer` 경유. `transactions` 직접 SELECT 금지.

## PB-009-05. 향후 가격 정책 변경 시 대비

패스스루가 아닌 "자체 마진 추가" 모델로 진화할 수 있음 (Phase 2 고려사항).

**예시: 서비스 특정에 2% 마진 부여**

```typescript
// PB-007-09 타 벤더 확장 로직
function calcCustomerCharge(gridgeCost: number, service: Service): number {
  const policy = service.pricing_policy; // enum
  
  switch (policy) {
    case 'passthrough':
      return gridgeCost;  // 원가 그대로
    case 'cost_plus_2pct':
      return Math.round(gridgeCost * 1.02);
    case 'fixed_markup_10k':
      return gridgeCost + 10000;
    default:
      return gridgeCost;
  }
}
```

**현재 Phase 0~1 에서는 `passthrough` 단일 정책 사용**. 이 정책 전환 시점은 Super 결정 + 고객 통지 + 계약서 수정 3단계.

## PB-009-06. 크레딧백과의 관계

크레딧백은 `transactions` 에 반영하지 않음. `credit_backs` 별도 테이블 (PB-004):

```
[M월] transactions: customer_charge_krw = gridge_cost_krw (원가 그대로)

[M+1월 초] invoice_generation 배치:
  invoices.subtotal_before_creditback_krw = SUM(customer_charge_krw)
  credit_backs.credit_amount_krw = subtotal × 0.10
  invoices.subtotal_krw = subtotal_before - credit_amount
  invoices.vat_krw = subtotal × 0.10
```

**중요**: `gridge_margin_krw` 에 크레딧백 지출을 기록하지 않음. 크레딧백은 **매출 할인**으로 회계 처리.

## PB-009-07. Finance 대시보드 (`v_finance_mtd` 활용)

```sql
CREATE VIEW v_finance_mtd AS
SELECT
  date_trunc('month', authorized_at) AS billing_month,
  SUM(customer_charge_krw) AS revenue,
  SUM(gridge_cost_krw) AS cost,
  SUM(customer_charge_krw) - SUM(gridge_cost_krw) AS gross_margin,
  -- Anthropic 패스스루 분리
  SUM(CASE WHEN is_anthropic_passthrough THEN customer_charge_krw ELSE 0 END) AS anthropic_revenue,
  SUM(CASE WHEN is_anthropic_passthrough THEN gridge_cost_krw ELSE 0 END) AS anthropic_cost,
  -- 크레딧백은 credit_backs 에서 별도 집계
  (SELECT SUM(credit_amount_krw) FROM credit_backs 
    WHERE billing_month = date_trunc('month', now()))
    AS creditback_expense
FROM transactions
WHERE status = 'settled'
GROUP BY billing_month;
```

Finance 가 손익 한눈에 파악. gross_margin 은 기본 0 (원가 재판매). **크레딧백 차감 후 실질 마진은 음수** (CAC 지출).

## PB-009-08. 자동 검증 체크리스트

- [ ] `gridge_margin_krw` 가 `customer_charge - gridge_cost` 와 불일치?
- [ ] `is_anthropic_passthrough = TRUE` 인데 service.vendor ≠ 'Anthropic'?
- [ ] 고객 포털 API 가 `transactions` 직접 SELECT (View 우회)?
- [ ] `gridge_margin_krw` 를 양수로 설정 (마진 차감 정책 없이)?
- [ ] 크레딧백 금액을 `gridge_margin_krw` 에 기록?

## PB-009-09. 이관 시 회계 분리

사업자 변경 (M&A) 시 transactions 이관:
- 기존 사업자 명의 transactions 는 **그대로 유지** (법정 10년)
- 새 사업자 명의 transactions 는 이관일 이후부터 INSERT
- `audit_logs.visibility = 'internal_only'` 이관 이력 기록

## 참조

- 회계 분리 필드 설계: `schemas/tables/transactions.md`
- Anthropic 패스스루 규칙: `rules/anthropic_passthrough.md` (PB-007)
- 크레딧백 (별도 테이블): `rules/creditback.md` (PB-004)
- View 분리: `schemas/INDEX.md § 13개 View`
- 원본: `02_시스템_아키텍처.md § 7 회계 분리 엔진`
