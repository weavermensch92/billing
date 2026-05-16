-- ============================================================
-- Gridge Billing MSP v2.0 — M-1010 환불 정책 (13.1)
-- A3 정책: 할인 회수 후 차액 환불 / 지원금(refundable=FALSE) 환수 거부
-- 의존: M-1001 wallet_charges, M-1009 payments_inbound
-- ============================================================

-- ─── 1. wallet_charges.refundable 컬럼 추가 ──────────────
ALTER TABLE billing.wallet_charges
  ADD COLUMN IF NOT EXISTS refundable BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN billing.wallet_charges.refundable IS
  'TRUE = 일반 충전 (A3 환불 가능). FALSE = 지원금·체험·보상 크레딧 (환수 불가).';


-- ─── 2. payments_outbound — 환불 출금 이력 (신규) ─────────
CREATE TABLE IF NOT EXISTS billing.payments_outbound (
  idx                BIGSERIAL PRIMARY KEY,
  id                 UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id             UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,
  wallet_charge_id   UUID NOT NULL REFERENCES billing.wallet_charges(id) ON DELETE RESTRICT,

  refund_amount_krw  BIGINT NOT NULL CHECK (refund_amount_krw > 0),
  discount_recouped_krw BIGINT NOT NULL DEFAULT 0 CHECK (discount_recouped_krw >= 0),
  -- 환불 산정 메타 (계산 식 보존, 회계 감사용)
  gross_used_krw     BIGINT NOT NULL,
  gross_remaining_krw BIGINT NOT NULL,

  tax_invoice_correction_id  TEXT,    -- 세무 시스템의 마이너스 세계 ID
  bank_tx_id         TEXT,
  source             TEXT NOT NULL DEFAULT 'manual'
                       CHECK (source IN ('manual','bank_webhook','reconciliation')),

  requested_by_member_id  UUID,         -- 고객 어드민 (members.id)
  approved_by_admin_id    UUID REFERENCES billing.admin_users(id),
  approved_at             TIMESTAMPTZ,
  processed_at            TIMESTAMPTZ,

  status             TEXT NOT NULL DEFAULT 'requested'
                       CHECK (status IN (
                         'requested',    -- 신청
                         'approved',     -- 슈퍼어드민 승인
                         'processing',   -- 처리 중 (세계·은행)
                         'completed',    -- 완료
                         'rejected'      -- 거부 (refundable=FALSE 등)
                       )),
  reject_reason      TEXT,
  note               TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

CREATE INDEX idx_payments_outbound_org
  ON billing.payments_outbound(org_id, created_at DESC);
CREATE INDEX idx_payments_outbound_status
  ON billing.payments_outbound(status, created_at);

COMMENT ON TABLE billing.payments_outbound IS
  '환불 출금 이력. wallet_charge 1건당 부분 환불 여러 번 가능. 마이너스 세계와 1:1.';


-- ─── 3. process_refund_a3 — A3 환불 산정·역기록 ──────────
-- 일반 충전: 잔여 net 환원 + 사용분 할인 회수 자동 산정
-- 지원금: EXCEPTION
CREATE OR REPLACE FUNCTION billing.process_refund_a3(
  p_wallet_charge_id UUID,
  p_requested_by     UUID,                  -- members.id (고객) 또는 admin_users.id (슈퍼)
  p_approved_by      UUID,                  -- admin_users.id (슈퍼어드민)
  p_note             TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_charge            RECORD;
  v_gross_remaining   BIGINT;
  v_gross_used        BIGINT;
  v_net_remaining     BIGINT;
  v_discount_recouped BIGINT;
  v_outbound_id       UUID;
BEGIN
  -- 1) 충전 조회 + 락
  SELECT * INTO v_charge
    FROM billing.wallet_charges
    WHERE id = p_wallet_charge_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_charge not found: %', p_wallet_charge_id;
  END IF;

  -- 2) 환불 가능 여부
  IF NOT v_charge.refundable THEN
    INSERT INTO billing.payments_outbound (
      org_id, wallet_charge_id, refund_amount_krw, discount_recouped_krw,
      gross_used_krw, gross_remaining_krw,
      requested_by_member_id, status, reject_reason, note
    ) VALUES (
      v_charge.org_id, p_wallet_charge_id, 1, 0,  -- 더미 1 (CHECK >0 충족)
      0, 0, p_requested_by, 'rejected',
      '지원금/체험 크레딧은 환수 불가 (refundable=FALSE)', p_note
    )
    RETURNING id INTO v_outbound_id;
    RAISE EXCEPTION 'wallet_charge % is non-refundable (grant/goodwill). outbound_id=%',
                    p_wallet_charge_id, v_outbound_id;
  END IF;

  IF v_charge.status NOT IN ('active','exhausted','expired') THEN
    RAISE EXCEPTION 'wallet_charge % status=% — only active/exhausted/expired refundable',
                    p_wallet_charge_id, v_charge.status;
  END IF;

  -- 3) 산정
  --    net_remaining = net - used
  --    gross_remaining = net_remaining / (1 - discount_rate)
  --    gross_used     = gross - gross_remaining
  --    discount_recouped = gross_used × discount_rate  (회계 감사용)
  v_net_remaining := v_charge.amount_krw_net - v_charge.amount_krw_used;

  IF v_net_remaining <= 0 THEN
    RAISE EXCEPTION 'wallet_charge % has no remaining balance', p_wallet_charge_id;
  END IF;

  IF v_charge.discount_rate >= 1 THEN
    RAISE EXCEPTION 'invalid discount_rate=%', v_charge.discount_rate;
  END IF;

  v_gross_remaining := ROUND(v_net_remaining / (1 - v_charge.discount_rate));
  v_gross_used      := v_charge.amount_krw_gross - v_gross_remaining;
  v_discount_recouped := ROUND(v_gross_used * v_charge.discount_rate);

  -- 4) wallet_charge 마감 (잔여 net을 used에 합산하여 exhausted 또는 별도 처리)
  --    환불은 잔여 잠금 효과 (이후 사용 불가). status='refunded' 처리.
  UPDATE billing.wallet_charges
    SET amount_krw_used = amount_krw_net,
        status = 'refunded',
        updated_at = billing.now_utc()
    WHERE id = p_wallet_charge_id;

  -- 5) wallet_ledger 역기록 (환불)
  INSERT INTO billing.wallet_ledger (
    org_id, charge_id, delta_krw, reason, detail
  ) VALUES (
    v_charge.org_id, p_wallet_charge_id, -v_net_remaining, 'refund',
    jsonb_build_object(
      'gross_used', v_gross_used,
      'gross_remaining', v_gross_remaining,
      'net_refunded', v_net_remaining,
      'discount_recouped', v_discount_recouped,
      'discount_rate', v_charge.discount_rate
    )
  );

  -- 6) payments_outbound INSERT (status=approved, 실제 입금은 별도 처리 후 completed)
  INSERT INTO billing.payments_outbound (
    org_id, wallet_charge_id,
    refund_amount_krw, discount_recouped_krw,
    gross_used_krw, gross_remaining_krw,
    requested_by_member_id, approved_by_admin_id, approved_at,
    status, note
  ) VALUES (
    v_charge.org_id, p_wallet_charge_id,
    v_net_remaining, v_discount_recouped,
    v_gross_used, v_gross_remaining,
    p_requested_by, p_approved_by, billing.now_utc(),
    'approved', p_note
  )
  RETURNING id INTO v_outbound_id;

  RETURN v_outbound_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.process_refund_a3 IS
  'A3 환불 산정·역기록. 지원금(refundable=FALSE)은 EXCEPTION. wallet_charge.status=refunded 전이.';


-- ─── 4. RLS ────────────────────────────────────────────────
ALTER TABLE billing.payments_outbound ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_outbound_org_read ON billing.payments_outbound
  FOR SELECT USING (org_id = billing.my_org_id());
CREATE POLICY payments_outbound_admin_all ON billing.payments_outbound
  FOR ALL USING (billing.is_admin_user());

CREATE TRIGGER trg_payments_outbound_updated_at
  BEFORE UPDATE ON billing.payments_outbound
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
