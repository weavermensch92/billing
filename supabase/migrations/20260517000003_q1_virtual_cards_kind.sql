-- ============================================================
-- Gridge Billing v2.0 — M-2004
-- virtual_cards.workspace_id / subscription_id / card_kind (PRD §8.11)
--
-- 의존: 20260517000001_q1_vendor_workspaces.sql (M-2001)
--       subscriptions FK 는 M-2006 (Phase 2) 에서 ALTER 로 추가 — 본 PR 은 UUID 컬럼만.
--
-- 목적: 현재 virtual_cards.account_id 1:1 강제를 깨고, 세 종류 owner 허용.
--   - 'account_card'      : 기존 — 멤버×서비스 account 단위 카드 (Q1·Q2 호환)
--   - 'workspace_card'    : 워크스페이스 단위 카드 (Q1 주력 — 한 카드 = 한 워크스페이스)
--   - 'subscription_card' : 개인 구독 단위 카드 (Q3 신규)
-- ============================================================

-- ─── 1. 컬럼 추가 ──────────────────────────────────────────
ALTER TABLE billing.virtual_cards
  ADD COLUMN IF NOT EXISTS workspace_id    UUID REFERENCES billing.vendor_workspaces(id) ON DELETE RESTRICT,
  -- subscription_id 는 Phase 2 (M-2006 subscriptions 테이블 신설) 에서 FK 제약 추가.
  -- 본 PR 에서는 UUID 컬럼만 (target 테이블 부재 상태로 FK 걸면 마이그레이션 실패).
  ADD COLUMN IF NOT EXISTS subscription_id UUID,
  ADD COLUMN IF NOT EXISTS card_kind       TEXT NOT NULL DEFAULT 'account_card'
    CHECK (card_kind IN ('account_card','workspace_card','subscription_card'));

COMMENT ON COLUMN billing.virtual_cards.workspace_id IS
  'card_kind=workspace_card 일 때 vendor_workspaces FK. PRD §8.11 (Q1).';

COMMENT ON COLUMN billing.virtual_cards.subscription_id IS
  'card_kind=subscription_card 일 때 subscriptions FK (Phase 2 M-2006 에서 FK ADD). PRD §8.11 (Q3).';

COMMENT ON COLUMN billing.virtual_cards.card_kind IS
  '카드 소유 단위 분기. account_card / workspace_card / subscription_card.';


-- ─── 2. account_id NOT NULL 해제 (workspace/subscription card 는 NULL 허용) ──
ALTER TABLE billing.virtual_cards
  ALTER COLUMN account_id DROP NOT NULL;


-- ─── 3. CHECK 제약 — 정확히 1개 owner FK ─────────────────────
-- NOT VALID 로 기존 데이터 영향 없음 (모든 기존 row 는 account_card)
ALTER TABLE billing.virtual_cards
  DROP CONSTRAINT IF EXISTS virtual_cards_exactly_one_owner;

ALTER TABLE billing.virtual_cards
  ADD CONSTRAINT virtual_cards_exactly_one_owner
    CHECK (
      (card_kind = 'account_card'
         AND account_id IS NOT NULL
         AND workspace_id IS NULL
         AND subscription_id IS NULL)
      OR
      (card_kind = 'workspace_card'
         AND account_id IS NULL
         AND workspace_id IS NOT NULL
         AND subscription_id IS NULL)
      OR
      (card_kind = 'subscription_card'
         AND account_id IS NULL
         AND workspace_id IS NULL
         AND subscription_id IS NOT NULL)
    )
    NOT VALID;


-- ─── 4. 인덱스 ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_virtual_cards_workspace
  ON billing.virtual_cards(workspace_id)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_virtual_cards_subscription
  ON billing.virtual_cards(subscription_id)
  WHERE subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_virtual_cards_kind
  ON billing.virtual_cards(card_kind, status);
