-- ============================================================
-- Gridge Billing MSP v2.0 — M-1012 그림자 멤버 24h 검수 (13.6)
-- f3: 발견 시 accounts INSERT (pending_approval) + 24h 후 자동 active (관대 모드)
-- 의존: M-1004 member_sync (shadow_member_findings)
-- ============================================================

-- ─── 1. accounts.approval_status 컬럼 ────────────────────
ALTER TABLE billing.accounts
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'active'
    CHECK (approval_status IN ('active','pending_approval','rejected')),
  ADD COLUMN IF NOT EXISTS pending_approval_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_member_id  UUID,   -- 고객 어드민
  ADD COLUMN IF NOT EXISTS approval_decided_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_accounts_pending_approval
  ON billing.accounts(org_id, pending_approval_until)
  WHERE approval_status = 'pending_approval';

COMMENT ON COLUMN billing.accounts.approval_status IS
  '24h 검수 모드 (f3). pending_approval = 그림자 자동 등록 직후 24h 검수 대기. 미응답 시 자동 active.';
COMMENT ON COLUMN billing.accounts.pending_approval_until IS
  '24h 검수 데드라인. 도래 시 cron이 자동 active 전이 (관대 모드).';


-- ─── 2. register_shadow_member_pending — 24h 검수로 자동 등록 ─
-- 1h sync 잡이 그림자 발견 시 호출. accounts INSERT (pending) + finding 연결.
CREATE OR REPLACE FUNCTION billing.register_shadow_member_pending(
  p_finding_id          UUID,
  p_vendor              TEXT,
  p_vendor_user_id      TEXT,
  p_vendor_user_email   TEXT,
  p_org_id              UUID,
  p_default_team_id     UUID DEFAULT NULL    -- NULL이면 미할당 팀
) RETURNS UUID AS $$
DECLARE
  v_account_id      UUID;
  v_team_id         UUID := p_default_team_id;
BEGIN
  -- 미할당 팀 찾기
  IF v_team_id IS NULL THEN
    SELECT id INTO v_team_id
      FROM billing.teams
      WHERE org_id = p_org_id AND is_unassigned = TRUE
      LIMIT 1;
  END IF;

  -- accounts INSERT (pending)
  INSERT INTO billing.accounts (
    org_id, provider, provider_user_id,
    email, status,
    approval_status, pending_approval_until
  ) VALUES (
    p_org_id, p_vendor, p_vendor_user_id,
    p_vendor_user_email,
    'active',                       -- 운영 상태는 active (사용량 매핑 정상)
    'pending_approval',             -- 검수 상태는 pending
    billing.now_utc() + INTERVAL '24 hours'
  )
  RETURNING id INTO v_account_id;

  -- shadow_member_findings 연결
  UPDATE billing.shadow_member_findings
    SET registered_account_id = v_account_id,
        assigned_team_id = v_team_id,
        resolution = 'auto_registered',
        resolved_at = billing.now_utc(),
        updated_at = billing.now_utc()
    WHERE id = p_finding_id;

  RETURN v_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.register_shadow_member_pending IS
  '그림자 멤버 24h 검수 자동 등록. accounts.approval_status=pending_approval로 INSERT.';


-- ─── 3. approve_shadow_member — 고객 어드민 결정 ─────────
CREATE OR REPLACE FUNCTION billing.approve_shadow_member(
  p_account_id   UUID,
  p_decision     TEXT,                  -- 'approve' | 'reject'
  p_by_member_id UUID,
  p_note         TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_account RECORD;
BEGIN
  IF p_decision NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'decision must be approve or reject';
  END IF;

  SELECT * INTO v_account FROM billing.accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_account.approval_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'account % not in pending_approval (current=%)',
                    p_account_id, v_account.approval_status;
  END IF;

  UPDATE billing.accounts
    SET approval_status = CASE WHEN p_decision = 'approve' THEN 'active' ELSE 'rejected' END,
        approved_by_member_id = p_by_member_id,
        approval_decided_at = billing.now_utc(),
        pending_approval_until = NULL,
        updated_at = billing.now_utc()
    WHERE id = p_account_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 4. daily_auto_approve_pending — 24h 만료 자동 active ─
-- 관대 모드 디폴트: 24h 미응답 → 자동 'active'
-- (Phase 2에 엄격 모드 옵션 검토)
CREATE OR REPLACE FUNCTION billing.daily_auto_approve_pending()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE billing.accounts
    SET approval_status = 'active',
        approval_decided_at = billing.now_utc(),
        pending_approval_until = NULL,
        updated_at = billing.now_utc()
    WHERE approval_status = 'pending_approval'
      AND pending_approval_until IS NOT NULL
      AND pending_approval_until <= billing.now_utc();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.daily_auto_approve_pending IS
  '24h 만료된 pending_approval account 자동 active 전이. 관대 모드 디폴트.';

-- ─── 4.5 accounts 테이블에 그림자 검수용 컬럼 5개 보장 ───
ALTER TABLE billing.accounts
  ADD COLUMN IF NOT EXISTS provider               TEXT,
  ADD COLUMN IF NOT EXISTS provider_user_id       TEXT,
  ADD COLUMN IF NOT EXISTS email                  TEXT,
  ADD COLUMN IF NOT EXISTS approval_status        TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS pending_approval_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_accounts_approval_status
  ON billing.accounts(approval_status)
  WHERE approval_status = 'pending_approval';


-- ─── 5. v_pending_approvals 뷰 ───────────────────────────
CREATE OR REPLACE VIEW billing.v_pending_approvals
WITH (security_invoker = true) AS
SELECT
  a.id AS account_id,
  a.org_id,
  a.provider AS vendor,
  a.provider_user_id AS vendor_user_id,
  a.email,
  a.created_at,
  a.pending_approval_until,
  EXTRACT(EPOCH FROM (a.pending_approval_until - billing.now_utc()))::INT / 3600 AS hours_until_auto_approve
FROM billing.accounts a
WHERE a.approval_status = 'pending_approval';

COMMENT ON VIEW billing.v_pending_approvals IS
  '24h 검수 대기 중인 그림자 멤버 자동 등록. 고객 어드민 대시보드.';


-- ─── 6. 사용량 매핑 — pending account 처리 정책 ──────────
-- usage_allocations에서 account.approval_status='rejected' 멤버 사용량은
-- 미할당 팀 + allocation_basis='default_unassigned'로 처리.
-- (M-1008 함수 호출 시 호출자가 status 체크. SQL 변경은 호출자 lib에서.)
-- 여기서는 명시 코멘트만.

COMMENT ON COLUMN billing.accounts.approval_status IS
  'active = 정상 / pending_approval = 24h 검수 / rejected = 사용량 매핑 X (미할당 처리). allocate_invoice_item_single 호출자(lib/billing/usage-allocator.ts)가 rejected 체크.';