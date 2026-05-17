-- ============================================================
-- Gridge Billing v2.0 — Phase 1.5 (Gateway 통합)
-- M-2050 + M-2051 + M-2055
--
-- 목적: PR #18~22 의 Gridge AI Gateway 트랙을 vendor_workspaces 모델로 흡수.
--   - M-2050 services.category 확장 + 'gridge_gateway' row INSERT
--   - M-2055 gridge_self_org seed (upstream admin token 소유 org)
--   - M-2051 ensure_gateway_workspace 함수 (고객 org 별 게이트웨이 워크스페이스
--           lazy 생성)
--
-- PRD §8.7 참조 — kind 컬럼 신설 대신 기존 services.category 확장으로 통합
-- (의미 중복 회피).
-- ============================================================

-- ─── M-2050: services.category 확장 ───────────────────────
-- 기존: subscription | api | agent_credit | other
-- 추가: gridge_gateway (그릿지 자체 게이트웨이 경유 → upstream 재호출)
ALTER TABLE billing.services
  DROP CONSTRAINT IF EXISTS services_category_check;

ALTER TABLE billing.services
  ADD CONSTRAINT services_category_check
  CHECK (category IN ('subscription','api','agent_credit','other','gridge_gateway'));

COMMENT ON COLUMN billing.services.category IS
  'M-2050 확장. subscription/api/agent_credit/other/gridge_gateway. gridge_gateway = api.gridge.ai 경유 + upstream 벤더 재호출 (마진 재청구).';


-- ─── Gridge AI Gateway 서비스 row ──────────────────────────
-- 고정 UUID 사용 (다른 마이그레이션에서 참조)
INSERT INTO billing.services (
  id,
  name,
  vendor,
  category,
  tos_review_status,
  pricing_policy,
  is_active
) VALUES (
  '00000000-0000-0000-0000-000000005101'::uuid,
  'Gridge AI Gateway',
  'gridge',
  'gridge_gateway',
  'approved',
  'passthrough',
  TRUE
) ON CONFLICT (id) DO NOTHING;


-- ─── M-2055: gridge_self_org seed ──────────────────────────
-- 그릿지 자체 법인 org (upstream admin token 의 소유 워크스페이스가 속함).
-- is_internal=TRUE 로 일반 고객 RLS 에서 제외.

ALTER TABLE billing.orgs
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN billing.orgs.is_internal IS
  'M-2055. TRUE = 그릿지 내부 운영용 org (upstream 결제 권한 소유). 일반 고객 RLS 에서 제외.';

CREATE INDEX IF NOT EXISTS idx_orgs_internal
  ON billing.orgs(is_internal)
  WHERE is_internal = TRUE;

-- gridge_self_org row (고정 UUID)
-- business_reg_no 는 그릿지 실제 법인 번호로 운영 단계에서 교체 가능.
-- plan/infra_mode/billing_mode/status 는 DEFAULT 사용 (v2 simplify_billing_plan 으로
-- plan CHECK 가 'prepaid_v2' 단일값이 됐기 때문에 명시값 INSERT 시 충돌 회피).
INSERT INTO billing.orgs (
  id,
  name,
  business_reg_no,
  credit_limit_krw,
  is_internal
) VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Gridge (internal)',
  'gridge-self-internal',
  0,                      -- 자체 운영 — 한도 없음
  TRUE
) ON CONFLICT (id) DO NOTHING;


-- ─── M-2051: ensure_gateway_workspace 함수 ─────────────────
-- 고객 org 별로 게이트웨이 워크스페이스 1개를 lazy 생성.
-- gridge_api_keys 발급 시 또는 사용량 기록 시 호출.
CREATE OR REPLACE FUNCTION billing.ensure_gateway_workspace(p_org_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = billing, public
AS $$
DECLARE
  v_ws_id      UUID;
  v_service_id UUID := '00000000-0000-0000-0000-000000005101'::uuid;
BEGIN
  -- 1. 기존 워크스페이스 찾기
  SELECT id INTO v_ws_id
  FROM billing.vendor_workspaces
  WHERE org_id = p_org_id
    AND service_id = v_service_id
    AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_ws_id IS NOT NULL THEN
    RETURN v_ws_id;
  END IF;

  -- 2. 없으면 생성
  -- vendor_workspace_id 는 내부 식별자 ('gw-<org_uuid>' 형식)
  INSERT INTO billing.vendor_workspaces (
    org_id,
    service_id,
    vendor_workspace_id,
    display_name,
    status
  ) VALUES (
    p_org_id,
    v_service_id,
    'gw-' || REPLACE(p_org_id::text, '-', ''),
    'Gridge AI Gateway',
    'active'
  )
  RETURNING id INTO v_ws_id;

  RETURN v_ws_id;
END;
$$;

COMMENT ON FUNCTION billing.ensure_gateway_workspace(UUID) IS
  'M-2051. 고객 org 의 Gridge AI Gateway 워크스페이스를 lazy 생성. 멱등.';

-- 권한: authenticated 가 직접 호출하지 않음 (서버 라우트에서 service_role 로 호출).
REVOKE EXECUTE ON FUNCTION billing.ensure_gateway_workspace(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.ensure_gateway_workspace(UUID) TO service_role;


-- ─── orgs RLS 보강 — is_internal 격리 ─────────────────────
-- 일반 고객은 자기 org 만 보지만, 혹시 모를 leakage 방지로 명시적으로
-- is_internal=FALSE 만 허용하는 정책 추가 (admin 은 별도 정책 유지).
DO $$
BEGIN
  -- 기존 my_org_id() 기반 정책이 있다면 이미 격리되므로 추가 정책은 보강용.
  -- 정책 이름 충돌 회피 — 없으면 생성, 있으면 skip.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'billing'
      AND tablename = 'orgs'
      AND policyname = 'orgs_exclude_internal_from_customer'
  ) THEN
    CREATE POLICY orgs_exclude_internal_from_customer
      ON billing.orgs
      FOR SELECT
      USING (
        is_internal = FALSE
        OR billing.is_admin_user()
      );
  END IF;
END $$;
