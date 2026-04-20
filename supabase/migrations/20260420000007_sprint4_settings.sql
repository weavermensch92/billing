-- ============================================================
-- Sprint 4 — 설정 · 오프보딩 · 월말 배치 지원
-- ============================================================

-- ─── export_jobs — 데이터 내보내기 작업 큐 ───────────────────
CREATE TABLE IF NOT EXISTS billing.export_jobs (
  idx               BIGSERIAL PRIMARY KEY,
  id                UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id            UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,
  requested_by      UUID NOT NULL REFERENCES billing.members(id),
  export_type       TEXT NOT NULL
                      CHECK (export_type IN ('full_zip','invoices_csv','transactions_csv','audit_csv','tax_invoices_pdf')),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','ready','failed','expired')),
  file_path         TEXT,           -- Supabase Storage 경로
  file_size_bytes   BIGINT,
  download_url      TEXT,
  download_count    INT NOT NULL DEFAULT 0,
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (billing.now_utc() + INTERVAL '7 days'),
  error_message     TEXT,
  auto_export_on_termination BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX idx_export_jobs_org  ON billing.export_jobs(org_id, created_at DESC);
CREATE INDEX idx_export_jobs_status ON billing.export_jobs(status)
  WHERE status IN ('pending','processing');

ALTER TABLE billing.export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner read export_jobs"
  ON billing.export_jobs FOR SELECT
  USING (
    org_id = billing.my_org_id()
    AND billing.my_role() = 'owner'
  );

CREATE POLICY "owner create export_jobs"
  ON billing.export_jobs FOR INSERT
  WITH CHECK (
    org_id = billing.my_org_id()
    AND billing.my_role() = 'owner'
    AND requested_by = billing.my_member_id()
  );

CREATE POLICY "admin read all export_jobs"
  ON billing.export_jobs FOR SELECT USING (billing.is_admin_user());

CREATE POLICY "admin update export_jobs"
  ON billing.export_jobs FOR UPDATE USING (billing.is_admin_user());

-- ─── 알림 이벤트 카탈로그 ─────────────────────────────────────
-- notification_preferences에 이벤트 타입 14종 시스템 기본값 seed
INSERT INTO billing.notification_preferences (org_id, member_id, scope, channel, event_type, enabled, config)
SELECT
  '00000000-0000-0000-0000-000000000000'::UUID,  -- 시스템 기본값 플레이스홀더
  NULL,
  'system',
  channel,
  event_type,
  enabled,
  '{}'::JSONB
FROM (VALUES
  -- 긴급: 모든 채널 ON
  ('payment_declined',          'email',  TRUE),
  ('payment_declined',          'slack',  TRUE),
  ('payment_declined',          'sms',    FALSE),
  ('vcn_suspended',             'email',  TRUE),
  ('vcn_suspended',             'slack',  TRUE),
  ('overdue_warning',           'email',  TRUE),
  ('overdue_warning',           'slack',  TRUE),

  -- 액션 필요: email + slack
  ('request_awaiting_customer', 'email',  TRUE),
  ('request_awaiting_customer', 'slack',  TRUE),
  ('request_completed',         'email',  TRUE),
  ('request_completed',         'slack',  FALSE),
  ('member_invited',            'email',  TRUE),

  -- 정보성: email만
  ('invoice_issued',            'email',  TRUE),
  ('invoice_issued',            'slack',  FALSE),
  ('tax_invoice_issued',        'email',  TRUE),
  ('creditback_applied',        'email',  TRUE),
  ('creditback_ending_soon',    'email',  TRUE),
  ('creditback_ending_soon',    'slack',  TRUE),  -- D-30 경고는 slack도
  ('limit_breach_approach',     'email',  TRUE),
  ('limit_breach_approach',     'slack',  FALSE),

  -- 업셀 (opt-out)
  ('upsell_signal',             'email',  FALSE),
  ('upsell_signal',             'slack',  FALSE)
) AS t(event_type, channel, enabled)
ON CONFLICT DO NOTHING;

-- 시스템 기본값 조회 뷰
CREATE OR REPLACE VIEW billing.v_notification_defaults
  WITH (security_invoker = true) AS
SELECT event_type, channel, enabled
FROM billing.notification_preferences
WHERE scope = 'system'
  AND org_id = '00000000-0000-0000-0000-000000000000'::UUID;

GRANT SELECT ON billing.v_notification_defaults TO anon, authenticated;

-- ─── 월말 배치 함수 (invoice_generation_batch) ───────────────
-- Phase 0 수동 실행 / Phase 1 pg_cron 자동화
CREATE OR REPLACE FUNCTION billing.generate_invoices_for_month(p_billing_month CHAR(7))
RETURNS TABLE(org_id UUID, invoice_id UUID, total_due_krw BIGINT) AS $$
DECLARE
  v_org RECORD;
  v_subtotal_before BIGINT;
  v_credit BIGINT;
  v_subtotal BIGINT;
  v_vat BIGINT;
  v_total BIGINT;
  v_month_seq INT;
  v_invoice_id UUID;
  v_is_final BOOLEAN;
BEGIN
  FOR v_org IN
    SELECT o.id, o.creditback_start_at, o.creditback_end_at
    FROM billing.orgs o
    WHERE o.status = 'active'
  LOOP
    -- 해당 월 settled 거래 합계 (고객 청구액 기준)
    SELECT COALESCE(SUM(customer_charge_krw), 0) INTO v_subtotal_before
    FROM billing.transactions
    WHERE org_id = v_org.id
      AND billing_month = p_billing_month
      AND status = 'settled';

    -- 크레딧백 계산 (월 순번, final 여부)
    IF v_org.creditback_start_at IS NOT NULL
       AND p_billing_month::DATE BETWEEN v_org.creditback_start_at AND COALESCE(v_org.creditback_end_at, '9999-12-31'::DATE)
    THEN
      v_month_seq := (EXTRACT(YEAR FROM p_billing_month::DATE) - EXTRACT(YEAR FROM v_org.creditback_start_at)) * 12
                   + (EXTRACT(MONTH FROM p_billing_month::DATE) - EXTRACT(MONTH FROM v_org.creditback_start_at)) + 1;
      v_is_final := (v_month_seq = 6);
      v_credit := ROUND(v_subtotal_before * 0.10);
    ELSE
      v_month_seq := 0;
      v_is_final := FALSE;
      v_credit := 0;
    END IF;

    v_subtotal := v_subtotal_before - v_credit;
    v_vat := ROUND(v_subtotal * 0.10);
    v_total := v_subtotal + v_vat;

    -- upsert invoice
    INSERT INTO billing.invoices (
      org_id, billing_month, status,
      subtotal_before_creditback, credit_amount, subtotal_krw, vat_krw, total_due_krw,
      requires_super_approval,
      due_date
    ) VALUES (
      v_org.id, p_billing_month, 'draft',
      v_subtotal_before, v_credit, v_subtotal, v_vat, v_total,
      v_total >= 10000000,   -- ≥ ₩10M 시 Super 승인 필요
      (p_billing_month || '-01')::DATE + INTERVAL '45 days'
    )
    ON CONFLICT (org_id, billing_month) DO UPDATE SET
      subtotal_before_creditback = EXCLUDED.subtotal_before_creditback,
      credit_amount              = EXCLUDED.credit_amount,
      subtotal_krw               = EXCLUDED.subtotal_krw,
      vat_krw                    = EXCLUDED.vat_krw,
      total_due_krw              = EXCLUDED.total_due_krw,
      requires_super_approval    = EXCLUDED.requires_super_approval,
      updated_at                 = billing.now_utc()
    WHERE billing.invoices.status = 'draft'
    RETURNING id INTO v_invoice_id;

    -- credit_backs 기록 (draft 청구서 생성 시)
    IF v_credit > 0 AND v_invoice_id IS NOT NULL THEN
      INSERT INTO billing.credit_backs (
        org_id, invoice_id, billing_month, month_seq,
        base_amount_krw, credit_amount_krw, is_final
      ) VALUES (
        v_org.id, v_invoice_id, p_billing_month, v_month_seq,
        v_subtotal_before, v_credit, v_is_final
      )
      ON CONFLICT (org_id, billing_month) DO NOTHING;
    END IF;

    org_id := v_org.id;
    invoice_id := v_invoice_id;
    total_due_krw := v_total;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.generate_invoices_for_month IS
  'Phase 0 수동 실행: SELECT * FROM billing.generate_invoices_for_month(''2026-04'');
   Phase 1 pg_cron: 매월 1일 00:30 KST 자동 실행 예정.';
