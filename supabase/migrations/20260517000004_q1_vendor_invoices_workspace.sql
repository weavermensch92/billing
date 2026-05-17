-- ============================================================
-- Gridge Billing v2.0 — M-2005
-- vendor_invoices.workspace_id (UUID FK) + source_type
--
-- 목적:
--   - 청구서를 vendor_workspaces (M-2001) 와 UUID FK 로 연결.
--     기존 (vendor, vendor_workspace_id) TEXT 매칭은 raw_payload 보존용
--     이지만, 1급 시민 식별자는 workspace_id UUID 로 승격.
--   - source_type 분기:
--       workspace_invoice    — 워크스페이스 단위 청구 (Q1, 기본)
--       account_invoice      — account 단위 청구 (워크스페이스 매칭 실패 fallback)
--       subscription_invoice — 개인 구독 단위 (Q3, M-2006 이후 사용)
--   - 백필: M-2001 의 backfill 과 동일 매칭 로직.
--     매칭 실패 row 는 source_type='account_invoice' 로 다운그레이드 +
--     workspace_id NULL. Super 가 콘솔에서 사후 정리.
--
-- 의존: M-2001 (vendor_workspaces), 20260515000003 (vendor_invoices)
-- 후속: M-2006 subscriptions + subscription_invoice 활성화
-- ============================================================

-- ─── 1. 컬럼 추가 ─────────────────────────────────────────
ALTER TABLE billing.vendor_invoices
  ADD COLUMN IF NOT EXISTS workspace_id UUID
    REFERENCES billing.vendor_workspaces(id) ON DELETE RESTRICT;

ALTER TABLE billing.vendor_invoices
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL
    DEFAULT 'workspace_invoice'
    CHECK (source_type IN (
      'workspace_invoice',     -- Q1: vendor_workspaces 단위 청구
      'account_invoice',       -- Q2 fallback: 워크스페이스 매칭 실패
      'subscription_invoice'   -- Q3: 개인 구독 (M-2006 이후)
    ));

COMMENT ON COLUMN billing.vendor_invoices.workspace_id IS
  'M-2005. vendor_workspaces FK. source_type=workspace_invoice 면 NOT NULL.';
COMMENT ON COLUMN billing.vendor_invoices.source_type IS
  'M-2005. 청구서 소유 단위. workspace_invoice (Q1 기본) / account_invoice (fallback) / subscription_invoice (Q3).';


-- ─── 2. 백필 — vendor_workspaces 매칭 ─────────────────────
-- 매칭 키: (org_id, vendor_workspace_id) + services.vendor 일치 확인.
-- M-2001 의 backfill 이 동일 키로 vendor_workspaces row 를 생성했으므로
-- 정상 케이스는 모두 매칭됨.
DO $$
DECLARE
  v_matched   INT := 0;
  v_unmatched INT := 0;
  v_rec       RECORD;
  v_ws_id     UUID;
BEGIN
  FOR v_rec IN
    SELECT vi.id, vi.org_id, vi.vendor, vi.vendor_workspace_id
    FROM billing.vendor_invoices vi
    WHERE vi.workspace_id IS NULL
      AND vi.vendor_workspace_id IS NOT NULL
      AND vi.vendor_workspace_id <> ''
  LOOP
    -- (org_id, services.vendor, vendor_workspace_id) 조합으로 매칭
    SELECT vw.id INTO v_ws_id
    FROM billing.vendor_workspaces vw
    JOIN billing.services s ON s.id = vw.service_id
    WHERE vw.org_id = v_rec.org_id
      AND s.vendor = v_rec.vendor
      AND vw.vendor_workspace_id = v_rec.vendor_workspace_id
    ORDER BY vw.created_at ASC
    LIMIT 1;

    IF v_ws_id IS NOT NULL THEN
      UPDATE billing.vendor_invoices
        SET workspace_id = v_ws_id,
            source_type  = 'workspace_invoice'
        WHERE id = v_rec.id;
      v_matched := v_matched + 1;
    ELSE
      -- 매칭 실패 → account_invoice 로 다운그레이드 (workspace_id NULL 유지)
      UPDATE billing.vendor_invoices
        SET source_type = 'account_invoice'
        WHERE id = v_rec.id;
      v_unmatched := v_unmatched + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'M-2005 backfill: % matched, % unmatched (downgraded to account_invoice)',
    v_matched, v_unmatched;
END $$;


-- ─── 3. CHECK — source_type ↔ workspace_id 정합성 ───────
-- workspace_invoice 면 workspace_id NOT NULL.
-- 다른 source_type 은 workspace_id 자유 (NULL 허용).
-- NOT VALID 로 추가 → 즉시 백필 row 검증 → 통과하면 VALIDATE.
ALTER TABLE billing.vendor_invoices
  ADD CONSTRAINT vendor_invoices_source_workspace_consistency
  CHECK (
    (source_type = 'workspace_invoice' AND workspace_id IS NOT NULL)
    OR (source_type <> 'workspace_invoice')
  ) NOT VALID;

ALTER TABLE billing.vendor_invoices
  VALIDATE CONSTRAINT vendor_invoices_source_workspace_consistency;


-- ─── 4. 인덱스 ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_workspace_period
  ON billing.vendor_invoices(workspace_id, billing_period_start DESC)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_invoices_source_type
  ON billing.vendor_invoices(source_type, fetched_at DESC);


-- ─── 5. Immutable 트리거 갱신 ─────────────────────────────
-- workspace_id 와 source_type 은 사후 수정 가능 (Super 가 매칭 실패 row 정리).
-- 즉 immutable 컬럼 목록에 추가하지 않음. 기존 트리거 그대로 유지.
-- 단, workspace_id 가 한 번 설정되면 다른 workspace 로 옮기는 것은 위험 →
-- 별도 가드 트리거: NULL → UUID 이동만 허용, UUID → 다른 UUID 변경 차단.

CREATE OR REPLACE FUNCTION billing.protect_vendor_invoice_workspace_id()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.workspace_id IS NOT NULL
     AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION
      'vendor_invoices.workspace_id cannot be reassigned once set (was %, new %)',
      OLD.workspace_id, NEW.workspace_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vendor_invoices_workspace_lock ON billing.vendor_invoices;
CREATE TRIGGER trg_vendor_invoices_workspace_lock
  BEFORE UPDATE ON billing.vendor_invoices
  FOR EACH ROW
  EXECUTE FUNCTION billing.protect_vendor_invoice_workspace_id();


-- ─── 6. 정합 검증 뷰 — workspace 단위 집계 ────────────────
-- 청구서 ↔ vendor_workspaces 매칭 현황. Super 콘솔에서 미할당 row 식별.
CREATE OR REPLACE VIEW billing.v_vendor_invoices_unlinked
WITH (security_invoker = true) AS
SELECT
  vi.id,
  vi.org_id,
  vi.vendor,
  vi.vendor_workspace_id      AS external_workspace_id,
  vi.billing_period_start,
  vi.billing_period_end,
  vi.total_krw,
  vi.source_type,
  vi.fetched_at
FROM billing.vendor_invoices vi
WHERE vi.workspace_id IS NULL
  AND vi.source_type = 'account_invoice'
ORDER BY vi.fetched_at DESC;

COMMENT ON VIEW billing.v_vendor_invoices_unlinked IS
  'M-2005. vendor_workspaces 매칭 실패 청구서. Super 가 콘솔에서 워크스페이스 생성 후 수동 연결.';
