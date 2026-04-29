-- ============================================================
-- pg_cron 스케줄 등록 (Phase 1 자동화)
-- Supabase Dashboard → Database → Extensions 에서 pg_cron 활성화 필요
-- ============================================================

-- pg_cron 확장 활성화 (Supabase 관리자 권한 필요)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── 1. monthly invoice 배치 wrapper ─────────────────────
-- 매일 KST 00:30 (UTC 15:30) 실행하되, KST 기준 1일인 경우만 지난달 invoice 생성.
-- 이 방식으로 pg_cron의 요일 기반 cron 표현을 피함 (UTC 기준 월말일이 30/31일 가변이라 어려움).
CREATE OR REPLACE FUNCTION billing.run_monthly_invoice_batch()
RETURNS INT AS $$
DECLARE
  v_kst_today DATE;
  v_target_month CHAR(7);
  v_count INT;
BEGIN
  v_kst_today := (billing.now_utc() AT TIME ZONE 'Asia/Seoul')::DATE;

  -- KST 기준 1일이 아니면 skip
  IF EXTRACT(DAY FROM v_kst_today) != 1 THEN
    RETURN 0;
  END IF;

  -- 지난달 YYYY-MM
  v_target_month := TO_CHAR(v_kst_today - INTERVAL '1 month', 'YYYY-MM');

  -- 지난달 invoice 생성 (draft)
  SELECT COUNT(*) INTO v_count FROM billing.generate_invoices_for_month(v_target_month);
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.run_monthly_invoice_batch IS
  '매일 실행하되 KST 기준 매월 1일에만 지난달 draft invoice 생성. pg_cron 매일 UTC 15:30 호출 대상.';

-- ─── 2. pg_cron 스케줄 등록 ───────────────────────────────
-- 중복 등록 방지: 이미 있는 job은 unschedule 후 재등록

-- 2-1. VCN 자동 폐기 — 매일 KST 02:00 (UTC 17:00 전날)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-auto-revoke-vcn') THEN
    PERFORM cron.unschedule('billing-auto-revoke-vcn');
  END IF;
  PERFORM cron.schedule(
    'billing-auto-revoke-vcn',
    '0 17 * * *',  -- 매일 UTC 17:00 = KST 02:00
    $job$SELECT billing.auto_revoke_expired_vcns();$job$
  );
EXCEPTION WHEN undefined_table THEN
  -- pg_cron 미활성 환경 (Supabase Dashboard에서 수동 활성화 필요)
  RAISE NOTICE 'pg_cron extension not enabled. Please enable in Supabase Dashboard → Database → Extensions.';
END $$;

-- 2-2. Monthly invoice 배치 — 매일 KST 00:30 (UTC 15:30)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-monthly-invoice') THEN
    PERFORM cron.unschedule('billing-monthly-invoice');
  END IF;
  PERFORM cron.schedule(
    'billing-monthly-invoice',
    '30 15 * * *',  -- 매일 UTC 15:30 = KST 00:30 (wrapper가 KST 1일만 실행)
    $job$SELECT billing.run_monthly_invoice_batch();$job$
  );
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'pg_cron extension not enabled. Monthly invoice batch must be triggered manually.';
END $$;

-- ─── 3. 관리 뷰 ──────────────────────────────────────────
CREATE OR REPLACE VIEW billing.v_cron_jobs
  WITH (security_invoker = true) AS
SELECT
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname LIKE 'billing-%';

COMMENT ON VIEW billing.v_cron_jobs IS
  '등록된 billing 관련 cron job 조회. Supabase Console에서 참조.';
