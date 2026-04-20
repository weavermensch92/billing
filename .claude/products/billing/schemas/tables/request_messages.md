# Billing / Schemas / request_messages — 테이블 본문

> 요청 스레드 메시지. 고객 ↔ AM 대화. `action_requests` 자식.

---

## DDL

```sql
CREATE TABLE request_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_request_id   UUID NOT NULL REFERENCES action_requests(id) ON DELETE CASCADE,
  
  -- 발신자
  sender_type         TEXT NOT NULL CHECK (sender_type IN ('customer','admin','system')),
  sender_id           UUID,                -- members.id 또는 admin_users.id
  sender_display_name TEXT,
  
  -- 메시지
  body                TEXT NOT NULL,
  message_type        TEXT DEFAULT 'text'
                      CHECK (message_type IN ('text','system_update','attachment')),
  
  -- 읽음 상태 (양쪽 각각)
  read_by_customer_at TIMESTAMPTZ,
  read_by_admin_at    TIMESTAMPTZ,
  
  -- 시스템 메시지 메타데이터
  system_event_type   TEXT,                -- 'status_changed', 'vcn_issued', ...
  system_event_data   JSONB,
  
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_request_messages_request ON request_messages(action_request_id, created_at);
CREATE INDEX idx_request_messages_unread_customer ON request_messages(action_request_id)
  WHERE read_by_customer_at IS NULL AND sender_type = 'admin';
CREATE INDEX idx_request_messages_unread_admin ON request_messages(action_request_id)
  WHERE read_by_admin_at IS NULL AND sender_type = 'customer';
```

## 메시지 유형

### `text` (일반)
고객 또는 AM 이 입력한 자유 텍스트.

### `system_update` (자동)
상태 변경 시 자동 생성:
```sql
INSERT INTO request_messages (
  action_request_id, sender_type, sender_display_name,
  message_type, body, system_event_type, system_event_data
) VALUES (
  $1, 'system', 'Gridge',
  'system_update', 
  'AM 검토 완료되었습니다.',
  'status_changed',
  '{"from": "pending", "to": "approved"}'::jsonb
);
```

### `attachment` (파일)
Phase 1+ (현재 미구현). 1Password 공유 링크 등.

## RLS

```sql
ALTER TABLE request_messages ENABLE ROW LEVEL SECURITY;

-- 해당 요청 접근 가능한 사람만
CREATE POLICY "request_messages_via_action_request"
  ON request_messages FOR SELECT
  USING (
    action_request_id IN (
      SELECT id FROM action_requests
      WHERE org_id IN (
        SELECT org_id FROM members
        WHERE auth_user_id = auth.uid() AND status = 'active'
      )
      AND (
        requested_by = (SELECT id FROM members WHERE auth_user_id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM members 
          WHERE auth_user_id = auth.uid() AND role IN ('owner','admin')
        )
      )
    )
  );
```

## 주요 쿼리

```sql
-- 스레드 조회
SELECT * FROM request_messages
WHERE action_request_id = $1
ORDER BY created_at ASC;

-- 고객 측 unread 카운트
SELECT COUNT(*) FROM request_messages
WHERE action_request_id = $1
  AND read_by_customer_at IS NULL
  AND sender_type = 'admin';

-- 읽음 처리
UPDATE request_messages 
SET read_by_customer_at = now()
WHERE action_request_id = $1 
  AND read_by_customer_at IS NULL;
```

## 참조

- `action_requests`: `schemas/tables/action_requests.md`
- 고객 UI: `screens/customer/requests.md § 탭 2 메시지 스레드`
- 콘솔 UI: `screens/console/request_detail.md § 우: 메시지 스레드`
