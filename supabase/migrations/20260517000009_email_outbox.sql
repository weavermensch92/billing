-- ============================================================
-- Gridge Billing v2.0 — email_outbox (PR B)
--
-- 트랜잭션 메일 발송 큐. lib/email/client.ts (PR A) 의 sendEmail 을
-- 호출하는 큐 처리기 (lib/email/outbox.ts) 가 본 테이블을 사용.
--
-- 큐 모델:
--   - INSERT 시점: status='pending'
--   - 큐 처리기: pending 중 next_retry_at <= now() 가져와 Resend 호출
--   - 성공: status='sent', sent_at 기록, message_id 저장
--   - 실패: attempts++ + last_error + next_retry_at 갱신 (exponential backoff)
--   - max_attempts (5) 도달: status='failed' (재시도 중단)
--
-- 백오프 정책 (lib 측 결정):
--   try 1 → 1m
--   try 2 → 5m
--   try 3 → 30m
--   try 4 → 1h
--   try 5 → 6h (마지막)
-- ============================================================

CREATE TABLE IF NOT EXISTS billing.email_outbox (
  idx           BIGSERIAL PRIMARY KEY,
  id            UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- 발송 페이로드 (sendEmail 입력과 매칭)
  to_addrs      TEXT[] NOT NULL CHECK (array_length(to_addrs, 1) >= 1),
  from_addr     TEXT,                            -- NULL = EMAIL_FROM env 사용
  reply_to      TEXT,
  bcc_addrs     TEXT[],
  subject       TEXT NOT NULL CHECK (length(subject) > 0),
  body_html     TEXT,
  body_text     TEXT,
  tags          JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- 분류 / 추적 (선택 — dispatcher 가 채움)
  event_type    TEXT,                            -- 예: 'member_invited' / 'invoice_issued'
  org_id        UUID REFERENCES billing.orgs(id) ON DELETE SET NULL,
  ref_table     TEXT,                            -- 예: 'invoices' / 'members'
  ref_id        UUID,                            -- 참조 row id

  -- 상태 / 재시도
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','failed','cancelled')),
  attempts      INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts  INT NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  last_error    TEXT,
  message_id    TEXT,                            -- Resend 응답 id

  created_at    TIMESTAMPTZ NOT NULL DEFAULT billing.now_utc(),
  sent_at       TIMESTAMPTZ,

  -- 본문은 둘 중 하나 이상
  CHECK (body_html IS NOT NULL OR body_text IS NOT NULL)
);

COMMENT ON TABLE billing.email_outbox IS
  '트랜잭션 메일 발송 큐. PR B (lib/email/outbox.ts) 가 처리. PR A 의 sendEmail 호출.';

-- 큐 polling 인덱스 (pending + due now)
CREATE INDEX IF NOT EXISTS idx_email_outbox_pending
  ON billing.email_outbox (next_retry_at)
  WHERE status = 'pending';

-- 운영 모니터링 인덱스
CREATE INDEX IF NOT EXISTS idx_email_outbox_failed
  ON billing.email_outbox (created_at DESC)
  WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS idx_email_outbox_event
  ON billing.email_outbox (event_type, created_at DESC)
  WHERE event_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_outbox_org
  ON billing.email_outbox (org_id, created_at DESC)
  WHERE org_id IS NOT NULL;

-- updated_at 트리거 불필요 (status 전이는 lib 측에서 명시적 시각 갱신)

-- RLS: 운영자 (admin_users) 만 접근. 고객은 본인 메일 발송 이력 확인 불가.
-- 추후 고객 노출이 필요하면 별도 정책 추가.
ALTER TABLE billing.email_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_outbox_admin_all
  ON billing.email_outbox
  FOR ALL
  USING (billing.is_admin_user());
