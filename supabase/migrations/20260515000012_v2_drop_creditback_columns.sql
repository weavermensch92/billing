-- ============================================================
-- Gridge Billing MSP v2.0 — M-2003 creditback 컬럼 정리
-- orgs / org_contracts / invoices 의 크레딧백 관련 컬럼 DROP
-- 의존: Phase 1 + M-2001 + M-2002 적용 후
-- ============================================================

-- 새 모델은 크레딧백 개념 없음. 즉시 할인은 wallet_charges.discount_rate에 스냅샷.
-- 6개월 정책은 discount_policies. 따라서 v1 컬럼 정리.

-- ─── 1. orgs.creditback_* 컬럼 DROP ──────────────────────
ALTER TABLE billing.orgs
  DROP COLUMN IF EXISTS creditback_start_at,
  DROP COLUMN IF EXISTS creditback_end_at;


-- ─── 2. org_contracts.creditback_* 컬럼 DROP ─────────────
-- 단, 기존 데이터에서 default_discount_rate를 채워야 함 (이관 후 DROP)
-- 이관: org_contracts.creditback_rate → orgs.default_discount_rate
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'billing'
      AND table_name = 'org_contracts'
      AND column_name = 'creditback_rate'
  ) THEN
    -- 이관: 가장 최근 active 계약의 creditback_rate를 orgs.default_discount_rate로
    UPDATE billing.orgs o
      SET default_discount_rate = COALESCE(oc.creditback_rate, 0.10)
      FROM billing.org_contracts oc
      WHERE oc.org_id = o.id
        AND oc.idx = (
          SELECT MAX(idx) FROM billing.org_contracts
          WHERE org_id = o.id
        );
  END IF;
END $$;

ALTER TABLE billing.org_contracts
  DROP COLUMN IF EXISTS creditback_rate,
  DROP COLUMN IF EXISTS creditback_months,
  DROP COLUMN IF EXISTS creditback_start_at,
  DROP COLUMN IF EXISTS final_creditback_applied;


-- ─── 3. invoices.subtotal_before_creditback / credit_amount DROP ─
-- 이관: subtotal_krw = subtotal_before_creditback - credit_amount (이미 P1에서 이렇게 계산됨)
-- 따라서 subtotal_krw 그대로 두고 두 컬럼만 DROP

ALTER TABLE billing.invoices
  DROP COLUMN IF EXISTS subtotal_before_creditback,
  DROP COLUMN IF EXISTS credit_amount;


-- ─── 4. 검증 ─────────────────────────────────────────────
-- 위 DROP이 모두 성공했는지 마이그레이션 후 별도 SELECT로 확인 권장:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_schema = 'billing'
--       AND column_name LIKE 'creditback%' OR column_name LIKE '%creditback%';
-- 결과 0 row가 정상.


-- ─── 5. 어휘 일관성 — invoices 컬럼 코멘트 갱신 ──────────
COMMENT ON COLUMN billing.invoices.subtotal_krw IS
  '청구 소계 (할인 적용 후). v2.0부터 wallet_charge.discount_rate 스냅샷이 청구 시점에 이미 반영됨.';
COMMENT ON COLUMN billing.invoices.total_due_krw IS
  '최종 청구액 (subtotal + VAT). v2.0 청구 모델에서는 vendor_invoices 기반 마진 + 사용량 분배 결과.';
