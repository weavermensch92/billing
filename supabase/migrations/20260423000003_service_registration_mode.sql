-- ============================================================
-- services.registration_api_mode
-- 서비스별 카드 등록 자동화 경로 분류
-- ============================================================

ALTER TABLE billing.services
  ADD COLUMN IF NOT EXISTS registration_api_mode TEXT NOT NULL DEFAULT 'extension_assist'
    CHECK (registration_api_mode IN (
      'admin_api',         -- 벤더 Admin API 직결 (Anthropic Admin API, OpenAI Enterprise)
      'extension_assist',  -- Gridge Chrome Extension 으로 클립보드 복사 (Stripe iframe)
      'manual',            -- AM 1Password 수동 공유 (ChatGPT Plus 같은 conditional)
      'browser_bot'        -- Playwright 서버 자동화 (Phase 1+)
    ));

COMMENT ON COLUMN billing.services.registration_api_mode IS
  'VCN 등록 자동화 경로. new_account executor + 콘솔 체크리스트가 이 값에 따라 분기.';

-- ─── 플랜 별 지원 매트릭스 (고객이 조회 가능한 뷰) ──────────
CREATE OR REPLACE VIEW billing.v_service_automation_matrix
  WITH (security_invoker = true) AS
SELECT
  id AS service_id,
  name,
  vendor,
  tos_review_status,
  registration_api_mode,
  CASE registration_api_mode
    WHEN 'admin_api'        THEN '완전 자동 (서버 API 직결)'
    WHEN 'browser_bot'      THEN '서버 자동화 (Playwright)'
    WHEN 'extension_assist' THEN '반자동 (Chrome 확장 복사)'
    WHEN 'manual'           THEN '수동 (AM 1Password)'
  END AS automation_level,
  is_anthropic_partnership,
  is_active
FROM billing.services;

GRANT SELECT ON billing.v_service_automation_matrix TO anon, authenticated;

-- ─── 기존 seed 업데이트 — 팀/Enterprise 우선 admin_api ─────
-- Anthropic 파트너십 서비스 우선 admin_api
UPDATE billing.services SET registration_api_mode = 'admin_api'
  WHERE vendor = 'anthropic' AND tos_review_status = 'approved';

-- OpenAI Enterprise / Team 은 admin_api (Phase 1에서 실제 연동)
UPDATE billing.services SET registration_api_mode = 'admin_api'
  WHERE vendor = 'openai' AND name ILIKE '%team%'
     OR vendor = 'openai' AND name ILIKE '%enterprise%';

-- Cursor Business — Phase 1 에서 admin_api 확인 전까지 extension
UPDATE billing.services SET registration_api_mode = 'extension_assist'
  WHERE vendor = 'cursor';

-- GitHub Copilot Business — extension_assist (GitHub 결제 페이지 Stripe 사용)
UPDATE billing.services SET registration_api_mode = 'extension_assist'
  WHERE vendor = 'github';

-- Perplexity / Windsurf / 기타 일반 서비스 — extension_assist
UPDATE billing.services SET registration_api_mode = 'extension_assist'
  WHERE vendor IN ('perplexity', 'codeium');

-- ChatGPT Plus (개인, conditional) — manual 강제
UPDATE billing.services SET registration_api_mode = 'manual'
  WHERE name = 'ChatGPT Plus';

-- Lovable (pending) — manual
UPDATE billing.services SET registration_api_mode = 'manual'
  WHERE vendor = 'lovable';
