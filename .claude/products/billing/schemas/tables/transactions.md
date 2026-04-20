# Billing / Schemas / transactions — 테이블 본문

> 결제 이벤트 원장. **회계 분리 3필드** (gridge_cost / customer_charge / margin) + **Anthropic 패스스루**. Immutable (settled 이후).

---

## DDL

```sql
CREATE TABLE transactions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  account_id              UUID REFERENCES accounts(id),
  virtual_card_id         UUID REFERENCES virtual_cards(id),
  service_id              UUID REFERENCES services(id),

  -- 카드사 원본
  issuer                  TEXT NOT NULL,
  issuer_transaction_id   TEXT NOT NULL,          -- 카드사 고유 ID
  merchant_descriptor     TEXT NOT NULL,          -- 가맹점명 원문
  merchant_mcc            TEXT,

  -- 금액 (3-필드 분리, 회계 분리 엔진)
  amount_original_numeric NUMERIC(18,4) NOT NULL, -- 원 화폐 금액
  currency_code           TEXT NOT NULL,          -- 'USD', 'KRW', 'EUR' 등
  fx_rate                 NUMERIC(12,6),          -- 적용 환율
  amount_krw              BIGINT NOT NULL,        -- KRW 환산

  -- ★ 회계 분리 (PB-007) ★
  gridge_cost_krw         BIGINT NOT NULL,        -- 그릿지 매입가
  customer_charge_krw     BIGINT NOT NULL,        -- 고객 청구가
  gridge_margin_krw       BIGINT NOT NULL,        -- 차액 (내부 전용)
  is_anthropic_passthrough BOOLEAN NOT NULL DEFAULT FALSE,

  -- 상태
  status                  TEXT NOT NULL DEFAULT 'authorized'
                          CHECK (status IN ('authorized','settled','declined','reversed','disputed')),
  decline_reason          TEXT,

  -- 타임스탬프
  authorized_at           TIMESTAMPTZ NOT NULL,
  settled_at              TIMESTAMPTZ,
  reversed_at             TIMESTAMPTZ,

  -- 월말 정산 연결
  invoice_id              UUID REFERENCES invoices(id),
  billing_month           DATE,                    -- 귀속 월 (당월 또는 익월)

  -- 원본 페이로드 (Super 전용 접근)
  raw_payload             JSONB,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_transactions_issuer ON transactions(issuer, issuer_transaction_id);
CREATE INDEX idx_transactions_org_month ON transactions(org_id, billing_month, status);
CREATE INDEX idx_transactions_account_month ON transactions(account_id, authorized_at DESC);
CREATE INDEX idx_transactions_vcn ON transactions(virtual_card_id, authorized_at DESC)
  WHERE virtual_card_id IS NOT NULL;
CREATE INDEX idx_transactions_declined ON transactions(org_id, authorized_at DESC)
  WHERE status = 'declined';
CREATE INDEX idx_transactions_invoice ON transactions(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_transactions_passthrough ON transactions(org_id, billing_month)
  WHERE is_anthropic_passthrough = TRUE;
```

## Immutable 규칙 (PB-005)

```sql
-- settled 이후 금액 / 일시 필드 수정 금지
CREATE RULE transactions_no_update_core AS
  ON UPDATE TO transactions
  WHERE OLD.status = 'settled'
    AND (OLD.amount_krw IS DISTINCT FROM NEW.amount_krw
         OR OLD.gridge_cost_krw IS DISTINCT FROM NEW.gridge_cost_krw
         OR OLD.customer_charge_krw IS DISTINCT FROM NEW.customer_charge_krw
         OR OLD.authorized_at IS DISTINCT FROM NEW.authorized_at
         OR OLD.raw_payload IS DISTINCT FROM NEW.raw_payload)
  DO INSTEAD NOTHING;

-- DELETE 완전 금지
CREATE RULE transactions_no_delete AS ON DELETE TO transactions DO INSTEAD NOTHING;
```

예외: `status`, `settled_at`, `invoice_id`, `billing_month` 는 UPDATE 허용.

## 회계 분리 계산 (PB-007)

트리거 또는 애플리케이션 레이어:
```typescript
// 결제 수신 시
const service = await getServiceByMerchant(raw.merchant_descriptor);
const isPassthrough = service?.vendor === 'Anthropic' && await isPartnershipActive();

const gridgeCost = raw.amount_krw;
const customerCharge = isPassthrough
  ? gridgeCost                       // 패스스루: 할인가 그대로 전달
  : gridgeCost;                      // 일반: 매입가 = 매출가

const margin = customerCharge - gridgeCost;  // 패스스루/일반 모두 기본 0

// 크레딧백은 별도 `credit_backs` 테이블에서 월말 적용
```

## RLS — 가장 민감

```sql
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 고객: margin / raw_payload / passthrough 제거
CREATE POLICY "transactions_customer_view"
  ON transactions FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM members
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );
-- 실제 쿼리는 View `v_transaction_customer` 경유 (민감 필드 제거)
```

**`gridge_margin_krw` / `raw_payload` / `is_anthropic_passthrough` 는 고객에게 노출 금지** (PB-005-05). 고객 포털은 `v_transaction_customer` 뷰로 접근.

## View `v_transaction_customer`

```sql
CREATE VIEW v_transaction_customer AS
SELECT
  id, org_id, account_id, virtual_card_id, service_id,
  merchant_descriptor, amount_original_numeric, currency_code,
  customer_charge_krw AS amount_krw,   -- customer_charge 만 노출
  status, authorized_at, settled_at,
  invoice_id, billing_month
FROM transactions;
```

## 주요 쿼리 (고객)

```sql
-- 이번 달 결제 내역 (고객 포털)
SELECT * FROM v_transaction_customer
WHERE org_id = $1
  AND authorized_at >= date_trunc('month', now())
  AND status IN ('authorized','settled')
ORDER BY authorized_at DESC;
```

## 주요 쿼리 (콘솔 — Finance/Super)

```sql
-- Anthropic 패스스루 월 집계 (파트너십 재협상 자료)
SELECT date_trunc('month', authorized_at) AS month,
  SUM(gridge_cost_krw) AS total_cost,
  SUM(customer_charge_krw) AS total_passthrough,
  COUNT(DISTINCT org_id) AS customers
FROM transactions
WHERE is_anthropic_passthrough = TRUE AND status = 'settled'
GROUP BY month ORDER BY month DESC;

-- 거절 대응 큐
SELECT * FROM transactions
WHERE status = 'declined'
  AND authorized_at > now() - interval '24 hours'
ORDER BY authorized_at DESC;
```

## 참조

- 회계 분리 규칙: `rules/anthropic_passthrough.md` (PB-007)
- Immutable: `rules/immutable_ledger.md` (PB-005)
- 월말 정산: `tables/invoices.md` / `tables/credit_backs.md`
- 거절 SOP: `playbook/decline-response.md` (v0.20)
- 원본: `03_데이터_모델.md § 7 결제 원장`
