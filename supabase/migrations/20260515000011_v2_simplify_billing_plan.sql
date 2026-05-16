-- ============================================================
-- Gridge Billing MSP v2.0 — M-2002 BillingPlan 단일화
-- 'monthly' | 'weekly' | 'prepaid_monthly' → 'prepaid_v2' 단일
-- 의존: Phase 1 + M-2001 적용 후
-- ============================================================

-- 새 모델은 충전 선금제 단일 트랙이라 plan 컬럼 자체 의미 없음.
-- 즉시 DROP하면 외부 코드·UI·기존 쿼리 다 깨지므로 단계적:
--   1) CHECK 제약 일시 해제
--   2) 전 row 'prepaid_v2'로 통일
--   3) 새 CHECK = 'prepaid_v2' 1종만
--   4) DEFAULT 변경 + DEPRECATED 코멘트
-- 컬럼 자체 DROP은 별도 (UI·코드 정리 후 v2.1 권장)

-- ─── 1. 기존 CHECK 제약 식별 + DROP ──────────────────────
-- 주의: PostgreSQL 은 `CHECK (plan IN (...))` 를 내부적으로
--      `CHECK ((plan = ANY (ARRAY[...])))` 로 정규화 저장한다.
--      따라서 LIKE '%IN%' 패턴으로는 매칭 안 됨 → 컬럼명 기준으로 광범위 매칭.
--      v2 제약 자신은 제외하여 idempotent 재실행 안전.
DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class c     ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'billing'
      AND c.relname = 'orgs'
      AND con.contype = 'c'
      AND con.conname <> 'orgs_plan_check_v2'
      AND pg_get_constraintdef(con.oid) ILIKE '%plan%'
  LOOP
    EXECUTE format('ALTER TABLE billing.orgs DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;


-- ─── 2. 전 row 통일 ──────────────────────────────────────
UPDATE billing.orgs SET plan = 'prepaid_v2' WHERE plan IS DISTINCT FROM 'prepaid_v2';


-- ─── 3. 새 CHECK (단일값, idempotent) ────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c     ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'billing'
      AND c.relname = 'orgs'
      AND con.conname = 'orgs_plan_check_v2'
  ) THEN
    ALTER TABLE billing.orgs
      ADD CONSTRAINT orgs_plan_check_v2 CHECK (plan = 'prepaid_v2');
  END IF;
END $$;


-- ─── 4. DEFAULT 변경 + DEPRECATED ────────────────────────
ALTER TABLE billing.orgs ALTER COLUMN plan SET DEFAULT 'prepaid_v2';

COMMENT ON COLUMN billing.orgs.plan IS
  'DEPRECATED v2.0. 단일 선금제(prepaid_v2)로 통일. 컬럼 자체는 호환성 유지를 위해 잔존. UI·코드 정리 후 v2.1에서 DROP 예정.';
