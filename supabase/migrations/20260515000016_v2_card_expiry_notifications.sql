-- ============================================================
-- Gridge Billing MSP v2.0 — M-1013 카드 만료 알림 (13.4)
-- 자동 발급 X. 알림(D-30/D-7/D-0) + AM·슈퍼어드민이 SOP로 고객사 전화 푸시.
-- 의존: billing.cards (P1) 또는 billing.vcns (실제 카드 스키마)
-- ============================================================

-- ─── 1. card_expiry_notifications — 알림 큐 ──────────────
-- daily cron이 만료 임박 카드 식별 → 알림 큐 INSERT
-- 실제 발송(이메일·슬랙·전화)은 lib에서 처리
CREATE TABLE IF NOT EXISTS billing.card_expiry_notifications (
  idx               BIGSERIAL PRIMARY KEY,
  id                UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  org_id            UUID NOT NULL REFERENCES billing.orgs(id) ON DELETE RESTRICT,

  card_id           UUID NOT NULL,        -- billing.cards 또는 billing.vcns 참조 (스키마 의존, FK 미지정)
  card_label        TEXT,                 -- 식별용 (vendor·workspace·마스킹)
  card_expires_at   DATE NOT NULL,

  notification_type TEXT NOT NULL CHECK (notification_type IN (
                      'D-30','D-7','D-0','past_due'
                    )),

  status            TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','sent','failed','acknowledged')),
  target_audience   TEXT[] NOT NULL,       -- ['super_admin','org_admin','am']
  channels          TEXT[] NOT NULL,       -- ['email','slack','dashboard','phone']

  sent_at           TIMESTAMPTZ,
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_by   UUID,

  detail            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),

  UNIQUE (card_id, notification_type)     -- 같은 카드 같은 D-N 중복 방지
);

CREATE INDEX idx_card_expiry_pending
  ON billing.card_expiry_notifications(status, created_at)
  WHERE status = 'queued';
CREATE INDEX idx_card_expiry_org
  ON billing.card_expiry_notifications(org_id, card_expires_at);

COMMENT ON TABLE billing.card_expiry_notifications IS
  '카드 만료 알림 큐. cron이 D-30/D-7/D-0 시점에 row INSERT. 발송은 lib/notifications/ 처리.';


-- ─── 2. detect_expiring_cards — 알림 대상 식별 + 큐 INSERT ─
-- pg_cron 매일 호출
CREATE OR REPLACE FUNCTION billing.detect_expiring_cards()
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
  v_card  RECORD;
BEGIN
  -- D-30: 30일 후 만료
  -- D-7:  7일 후 만료
  -- D-0:  오늘 만료
  -- past_due: 이미 만료됐는데 회전 안 됨

  -- 실제 카드 테이블 명은 환경 의존. 가정: billing.vcns(id, org_id, expires_at, status, label)
  -- 환경에 cards가 있으면 그 테이블을 대신 사용.
  -- 본 함수는 vcns 가정. 다른 스키마면 ADAPT.

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'billing' AND table_name = 'vcns'
  ) THEN
    -- vcns 테이블 없음 (다른 환경) → 0 반환
    RETURN 0;
  END IF;

  FOR v_card IN
    EXECUTE $f$
      SELECT id, org_id, expires_at, COALESCE(label, 'VCN') AS label
        FROM billing.vcns
        WHERE status = 'active'
          AND expires_at IS NOT NULL
          AND (
            expires_at = (CURRENT_DATE + INTERVAL '30 days')::DATE OR
            expires_at = (CURRENT_DATE + INTERVAL '7 days')::DATE  OR
            expires_at = CURRENT_DATE OR
            expires_at < CURRENT_DATE
          )
    $f$
  LOOP
    DECLARE
      v_type TEXT;
    BEGIN
      v_type := CASE
        WHEN v_card.expires_at = (CURRENT_DATE + INTERVAL '30 days')::DATE THEN 'D-30'
        WHEN v_card.expires_at = (CURRENT_DATE + INTERVAL '7 days')::DATE  THEN 'D-7'
        WHEN v_card.expires_at = CURRENT_DATE THEN 'D-0'
        ELSE 'past_due'
      END;

      INSERT INTO billing.card_expiry_notifications (
        org_id, card_id, card_label, card_expires_at,
        notification_type, target_audience, channels
      ) VALUES (
        v_card.org_id, v_card.id, v_card.label, v_card.expires_at,
        v_type,
        CASE v_type
          WHEN 'D-30' THEN ARRAY['super_admin','org_admin']
          WHEN 'D-7'  THEN ARRAY['super_admin','org_admin','am']     -- AM 푸시 추가
          WHEN 'D-0'  THEN ARRAY['super_admin','org_admin','am']     -- 전화 푸시 트리거
          ELSE ARRAY['super_admin','am']                              -- past_due: 긴급
        END,
        CASE v_type
          WHEN 'D-30' THEN ARRAY['email','dashboard']
          WHEN 'D-7'  THEN ARRAY['email','slack','dashboard']
          WHEN 'D-0'  THEN ARRAY['email','slack','dashboard','phone']
          ELSE ARRAY['email','slack','dashboard','phone']
        END
      )
      ON CONFLICT (card_id, notification_type) DO NOTHING;

      v_count := v_count + 1;
    END;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION billing.detect_expiring_cards IS
  '매일 호출. 만료 임박 카드를 식별해서 알림 큐에 INSERT. 실제 발송은 lib에서.';


-- ─── 3. mark_notification_sent — 발송 후 호출 ────────────
CREATE OR REPLACE FUNCTION billing.mark_notification_sent(
  p_notification_id UUID,
  p_success         BOOLEAN DEFAULT TRUE,
  p_detail          JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $$
BEGIN
  UPDATE billing.card_expiry_notifications
    SET status = CASE WHEN p_success THEN 'sent' ELSE 'failed' END,
        sent_at = billing.now_utc(),
        detail = detail || p_detail
    WHERE id = p_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 4. RLS ────────────────────────────────────────────────
ALTER TABLE billing.card_expiry_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY card_expiry_org_read ON billing.card_expiry_notifications
  FOR SELECT USING (org_id = billing.my_org_id());
CREATE POLICY card_expiry_admin_all ON billing.card_expiry_notifications
  FOR ALL USING (billing.is_admin_user());


-- ─── 5. 운영 SOP 코멘트 (시스템 외) ──────────────────────
COMMENT ON TABLE billing.card_expiry_notifications IS
  '카드 만료 알림 큐.

   SOP:
   - D-30 알림 → AM 대시보드 확인, 슈퍼어드민 알림
   - D-7 알림  → AM이 고객사에 직접 메시지·이메일 (전화 준비)
   - D-0 알림  → AM 또는 슈퍼어드민이 고객사 전화 푸시 (필수)
   - past_due  → 슈퍼어드민 긴급 처리 + 고객사 즉시 통화

   ※ 자동 카드 발급 X. 회전은 슈퍼어드민의 D4 수동 트리거로만.';
