-- ============================================================
-- Gridge Billing MSP v2.0 — M-1009 slack_messages + payments_inbound
-- Q3 A: 슬랙 ✅ 리액션 + 화이트리스트
-- 5번 자동 포스팅 + 6번 발행 완료 신호 → wallet_charge active 전이
-- 의존: M-1001 wallet_charges, billing.orgs, billing.admin_users
-- ============================================================

-- ─── 1. slack_acknowledger_whitelist — ✅ 권한자 ─────────
CREATE TABLE IF NOT EXISTS billing.slack_acknowledger_whitelist (
  idx                 BIGSERIAL PRIMARY KEY,
  slack_user_id       TEXT NOT NULL UNIQUE,
  user_name           TEXT,
  user_email          TEXT,
  allowed_channels    TEXT[],                  -- NULL = 전체
  allowed_subjects    TEXT[],                  -- NULL = 전체
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  added_by            UUID REFERENCES billing.admin_users(id),
  added_at            TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  revoked_at          TIMESTAMPTZ,
  revoked_by          UUID REFERENCES billing.admin_users(id),
  revoked_reason      TEXT
);

CREATE INDEX idx_slack_whitelist_active
  ON billing.slack_acknowledger_whitelist(slack_user_id)
  WHERE active = TRUE AND revoked_at IS NULL;

COMMENT ON TABLE billing.slack_acknowledger_whitelist IS
  'Q3 A: ✅ 리액션 신호로 인정할 슬랙 user_id 목록. 채널·주제별 권한 제한 가능.';


-- ─── 2. slack_messages — 자동 포스팅 + ack 추적 ─────────
CREATE TABLE IF NOT EXISTS billing.slack_messages (
  idx                       BIGSERIAL PRIMARY KEY,
  id                        UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  channel_id                TEXT NOT NULL,
  message_ts                TEXT NOT NULL,            -- Slack message timestamp
  subject                   TEXT NOT NULL CHECK (subject IN (
                              'tax_invoice_request',  -- 5번 자동 포스팅
                              'charge_confirmation',  -- 충전 컨펌 알림
                              'anomaly_alert',        -- 이상감지
                              'manual'                -- 슈퍼어드민 수동
                            )),

  related_org_id            UUID REFERENCES billing.orgs(id) ON DELETE RESTRICT,
  related_wallet_charge_id  UUID REFERENCES billing.wallet_charges(id) ON DELETE RESTRICT,

  posted_at                 TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  posted_by                 TEXT NOT NULL DEFAULT 'system',   -- 'system' | admin_users.id::text
  posted_payload            JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 메시지 body·blocks

  status                    TEXT NOT NULL DEFAULT 'posted'
                              CHECK (status IN ('posted','acked','completed','superseded','failed')),

  -- Ack
  ack_emoji                 TEXT,
  acked_at                  TIMESTAMPTZ,
  acked_by_slack_user_id    TEXT,
  ack_payload               JSONB,                    -- Slack event 원본

  completed_at              TIMESTAMPTZ,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),

  UNIQUE (channel_id, message_ts)
);

CREATE INDEX idx_slack_messages_subject_status
  ON billing.slack_messages(subject, status, posted_at DESC);
CREATE INDEX idx_slack_messages_charge
  ON billing.slack_messages(related_wallet_charge_id)
  WHERE related_wallet_charge_id IS NOT NULL;

COMMENT ON TABLE billing.slack_messages IS
  '슬랙 채널 자동 포스팅 + ✅ ack 추적. message_ts ↔ wallet_charge_id 1:1.';


-- ─── 3. confirm_slack_ack — 화이트리스트 검증 + active 전이 ─
-- Q3 A 핵심 함수. 슬랙 webhook → 이 함수 호출.
-- 화이트리스트 통과 + 메시지 status='posted' + 채널·주제 일치 → acked + wallet 활성
CREATE OR REPLACE FUNCTION billing.confirm_slack_ack(
  p_channel_id     TEXT,
  p_message_ts     TEXT,
  p_emoji          TEXT,
  p_slack_user_id  TEXT,
  p_event_payload  JSONB DEFAULT '{}'::jsonb
) RETURNS TABLE (
  success          BOOLEAN,
  reason           TEXT,
  wallet_charge_id UUID
) AS $$
DECLARE
  v_msg            RECORD;
  v_whitelist_ok   BOOLEAN;
BEGIN
  -- 1. 메시지 조회 + 락
  SELECT * INTO v_msg FROM billing.slack_messages
    WHERE channel_id = p_channel_id AND message_ts = p_message_ts
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'message_not_found'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- 2. 이미 처리됨?
  IF v_msg.status IN ('acked','completed','superseded') THEN
    RETURN QUERY SELECT FALSE, ('already_'||v_msg.status)::TEXT, v_msg.related_wallet_charge_id;
    RETURN;
  END IF;

  -- 3. 화이트리스트 검증 (채널·주제 일치 포함)
  SELECT EXISTS (
    SELECT 1 FROM billing.slack_acknowledger_whitelist w
    WHERE w.slack_user_id = p_slack_user_id
      AND w.active = TRUE
      AND w.revoked_at IS NULL
      AND (w.allowed_channels IS NULL OR p_channel_id = ANY(w.allowed_channels))
      AND (w.allowed_subjects IS NULL OR v_msg.subject = ANY(w.allowed_subjects))
  ) INTO v_whitelist_ok;

  IF NOT v_whitelist_ok THEN
    RETURN QUERY SELECT FALSE, 'not_whitelisted'::TEXT, v_msg.related_wallet_charge_id;
    RETURN;
  END IF;

  -- 4. 메시지 acked 전이
  UPDATE billing.slack_messages
    SET status = 'acked',
        ack_emoji = p_emoji,
        acked_at = billing.now_utc(),
        acked_by_slack_user_id = p_slack_user_id,
        ack_payload = p_event_payload,
        updated_at = billing.now_utc()
    WHERE id = v_msg.id;

  -- 5. 관련 wallet_charge가 있고 pending이면 active 전이 + 세금계산서 발행 시각 기록
  IF v_msg.subject = 'tax_invoice_request' AND v_msg.related_wallet_charge_id IS NOT NULL THEN
    UPDATE billing.wallet_charges
      SET status = 'active',
          tax_invoice_issued_at = billing.now_utc(),
          slack_message_ts = p_message_ts,
          updated_at = billing.now_utc()
      WHERE id = v_msg.related_wallet_charge_id
        AND status = 'pending';

    UPDATE billing.slack_messages
      SET status = 'completed', completed_at = billing.now_utc()
      WHERE id = v_msg.id;
  END IF;

  RETURN QUERY SELECT TRUE, 'ok'::TEXT, v_msg.related_wallet_charge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.confirm_slack_ack IS
  'Q3 A: 슬랙 ✅ 리액션 처리. 화이트리스트 검증 → wallet_charge active + tax_invoice_issued_at 기록.';


-- ─── 4. payments_inbound — 입금 확인 ─────────────────────
-- 고객이 그릿지 계좌로 입금한 사실을 기록 (수동 또는 은행 webhook).
-- wallet_charge.status active 와 입금 사실은 별개 (입금 확인이 먼저면 컨펌 보조 자료).
CREATE TABLE IF NOT EXISTS billing.payments_inbound (
  idx                     BIGSERIAL PRIMARY KEY,
  id                      UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id                  UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,

  wallet_charge_id        UUID REFERENCES billing.wallet_charges(id) ON DELETE RESTRICT,
                                                                       -- NULL 가능 (충전 신청 전 선입금)
  amount_krw              BIGINT NOT NULL CHECK (amount_krw > 0),
  paid_at                 TIMESTAMPTZ NOT NULL,                        -- 실 입금 시각

  source                  TEXT NOT NULL DEFAULT 'manual'
                            CHECK (source IN ('manual','bank_webhook','reconciliation')),
  bank_tx_id              TEXT,                       -- 은행 거래 식별자 (있다면)
  bank_meta               JSONB NOT NULL DEFAULT '{}'::jsonb,

  confirmed_by            UUID REFERENCES billing.admin_users(id),
  confirmed_at            TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  note                    TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc()
);

CREATE INDEX idx_payments_inbound_org
  ON billing.payments_inbound(org_id, paid_at DESC);
CREATE INDEX idx_payments_inbound_charge
  ON billing.payments_inbound(wallet_charge_id)
  WHERE wallet_charge_id IS NOT NULL;

COMMENT ON TABLE billing.payments_inbound IS
  '고객 입금 확인 이력. wallet_charge 와 별개 트랙 (실 입금과 충전 신청은 매칭 후 1:1).';


-- ─── 5. RLS ────────────────────────────────────────────────
ALTER TABLE billing.slack_acknowledger_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.slack_messages               ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.payments_inbound             ENABLE ROW LEVEL SECURITY;

-- slack_* 는 슈퍼어드민만 (내부 운영 데이터)
CREATE POLICY slack_whitelist_admin_all ON billing.slack_acknowledger_whitelist
  FOR ALL USING (billing.is_admin_user());
CREATE POLICY slack_messages_admin_all ON billing.slack_messages
  FOR ALL USING (billing.is_admin_user());

-- payments_inbound: 슈퍼어드민 + 자기 Org만 read (고객은 자기 입금 이력 확인 가능)
CREATE POLICY payments_inbound_org_read ON billing.payments_inbound
  FOR SELECT USING (org_id = billing.my_org_id());
CREATE POLICY payments_inbound_admin_all ON billing.payments_inbound
  FOR ALL USING (billing.is_admin_user());

CREATE TRIGGER trg_slack_messages_updated_at
  BEFORE UPDATE ON billing.slack_messages
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();
