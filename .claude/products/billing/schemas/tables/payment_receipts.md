# Billing / Schemas / payment_receipts — 테이블 본문

> 수납 영수증. Immutable. 오픈뱅킹 매칭 (Phase 1) / 수동 확인 (Phase 0).

---

## DDL

```sql
CREATE TABLE payment_receipts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  invoice_id            UUID REFERENCES invoices(id) ON DELETE RESTRICT,
  
  -- 수납 정보
  amount_krw            BIGINT NOT NULL,
  received_at           TIMESTAMPTZ NOT NULL,
  
  -- 송금인
  payer_name            TEXT NOT NULL,
  payer_bank            TEXT,
  payer_account         TEXT,         -- 마스킹 (예: "1005-***-1234")
  
  -- 매칭
  match_confidence      TEXT CHECK (match_confidence IN ('auto','manual','unmatched')),
  matched_by            UUID REFERENCES admin_users(id),
  matched_at            TIMESTAMPTZ,
  
  -- 원본 (오픈뱅킹 페이로드)
  raw_payload           JSONB,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_receipts_invoice ON payment_receipts(invoice_id);
CREATE INDEX idx_payment_receipts_unmatched ON payment_receipts(received_at DESC)
  WHERE match_confidence = 'unmatched';

-- Immutable (PB-005)
CREATE RULE payment_receipts_no_update AS ON UPDATE TO payment_receipts 
  WHERE OLD.amount_krw IS DISTINCT FROM NEW.amount_krw 
    OR OLD.received_at IS DISTINCT FROM NEW.received_at
  DO INSTEAD NOTHING;
CREATE RULE payment_receipts_no_delete AS ON DELETE TO payment_receipts DO INSTEAD NOTHING;
```

## Phase 0 수동 매칭

Finance 가 매일 아침:
1. 은행 앱 에서 입금 내역 확인
2. `/console/billing/receipts/new` → 입력 폼
3. `invoice_id` 선택 (또는 unmatched 로 저장)
4. 매칭 시: `invoices.status = 'paid'`, `paid_at = received_at`

## Phase 1 오픈뱅킹 자동 매칭

```typescript
// 오픈뱅킹 웹훅
async function handleBankWebhook(payload: BankWebhook) {
  // 1. payment_receipts INSERT
  const receipt = await db.insert('payment_receipts', {
    ...payload,
    match_confidence: 'unmatched',
  });
  
  // 2. 매칭 시도: 같은 org, 예상 금액, ±3일 내
  const candidate = await db.selectOne(`
    SELECT i.* FROM invoices i
    JOIN orgs o ON o.id = i.org_id
    WHERE i.status = 'issued'
      AND i.total_due_krw = $1
      AND i.billing_month BETWEEN $2 - interval '3 days' AND $2
      AND o.name ILIKE $3
  `, [payload.amount_krw, payload.received_at, `%${payload.payer_name}%`]);
  
  if (candidate) {
    await db.update('payment_receipts', receipt.id, {
      invoice_id: candidate.id,
      match_confidence: 'auto',
      matched_at: new Date(),
    });
    await db.update('invoices', candidate.id, {
      status: 'paid',
      paid_at: payload.received_at,
    });
  }
  // 매칭 실패 시 Finance 수동 확인 큐로
}
```

## 참조

- `invoices`: `schemas/tables/invoices.md`
- Immutable: `rules/immutable_ledger.md` (PB-005)
- 월말 마감 수납: `playbook/month-end-close.md § M+15일 납부 기한`
- 원본: `03_데이터_모델.md § 9-5 payment_receipts`
