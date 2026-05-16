-- ============================================================
-- Gridge Billing MSP v2.0 — M-2001 credit_backs 폐기
-- 크레딧백 모델 → 선금 + 즉시 할인 모델로 전환에 따른 데이터·정책 폐기
-- 의존: Phase 1 M-1001 wallet_charges 적용 후 실행
-- ============================================================

-- ─── 1. archive — 기존 credit_backs를 보존 테이블로 RENAME ─
-- 즉시 DROP 안 함. 분석·감사 필요 시 _archive_ 테이블에서 조회 가능.
-- 이관 시 정합성: credit_backs 의미(6개월 정기 환원)와 wallet_charges 의미(충전 잔액)는
-- 1:1 대응 안 됨. 따라서 자동 이관 X. 보존만.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'billing' AND tablename = 'credit_backs'
  ) THEN
    -- RLS 정책 먼저 DROP (CASCADE 회피)
    DROP POLICY IF EXISTS "owner admin can read credit_backs" ON billing.credit_backs;
    DROP POLICY IF EXISTS "admin can read all credit_backs"   ON billing.credit_backs;

    -- 보존 테이블로 RENAME
    ALTER TABLE billing.credit_backs RENAME TO _archive_credit_backs_v1;

    COMMENT ON TABLE billing._archive_credit_backs_v1 IS
      'v1 크레딧백 원장 (DEPRECATED). v2.0부터 wallet_charges + discount_policies로 대체. 감사·이력 보존용.';
  END IF;
END $$;


-- ─── 2. 인덱스도 함께 RENAME (PostgreSQL은 보통 자동, 안전 차원에서 명시) ─
DO $$
DECLARE
  v_idx_name TEXT;
BEGIN
  FOR v_idx_name IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'billing' AND tablename = '_archive_credit_backs_v1'
      AND indexname NOT LIKE '_archive_%'
  LOOP
    EXECUTE format('ALTER INDEX billing.%I RENAME TO %I', v_idx_name, '_archive_' || v_idx_name);
  END LOOP;
END $$;


-- ─── 3. archive 테이블 정책 — 슈퍼어드민만 read ──────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'billing' AND tablename = '_archive_credit_backs_v1'
  ) THEN
    EXECUTE 'ALTER TABLE billing._archive_credit_backs_v1 ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY archive_credit_backs_admin_read ON billing._archive_credit_backs_v1
             FOR SELECT USING (billing.is_admin_user())';
    -- INSERT/UPDATE/DELETE는 정책 부재 = 차단
  END IF;
END $$;


-- ─── 4. 어휘 정합 코멘트 ──────────────────────────────────
COMMENT ON SCHEMA billing IS
  'v2.0 — 충전 선금제 + Org별 할인율 + 벤더 청구서 진리원천. v1 credit_backs는 _archive_credit_backs_v1로 보존.';
