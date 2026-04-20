# Billing / Schemas / request_events — 테이블 본문

> 요청 타임라인 이벤트. 상태 변경·처리 단계 자동 기록. UI 체크리스트 데이터 소스.

---

## DDL

```sql
CREATE TABLE request_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_request_id UUID NOT NULL REFERENCES action_requests(id) ON DELETE CASCADE,
  
  -- 이벤트 분류
  event_type        TEXT NOT NULL,
  /* 값 예시:
     'submitted', 'assigned', 'approved', 'rejected',
     'progress_step_completed', 'vcn_issued', 'vcn_delivered',
     'customer_confirmed', 'status_changed',
     'completed', 'cancelled',
     'sla_assigned', 'sla_warning', 'sla_breached',
     'message_sent'
  */
  
  -- 이벤트 데이터
  event_data        JSONB DEFAULT '{}'::jsonb,
  
  -- 실행 주체
  actor_type        TEXT CHECK (actor_type IN ('customer','admin','system')),
  actor_id          UUID,
  actor_display_name TEXT,
  
  -- 표시
  description       TEXT,             -- UI 표시용 요약
  
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_request_events_request ON request_events(action_request_id, created_at);
CREATE INDEX idx_request_events_type ON request_events(event_type, created_at DESC);

-- Immutable
CREATE RULE request_events_no_update AS ON UPDATE TO request_events DO INSTEAD NOTHING;
CREATE RULE request_events_no_delete AS ON DELETE TO request_events DO INSTEAD NOTHING;
```

## 자동 기록 트리거 (추천)

`action_requests` 상태 변경 시 자동 생성:

```sql
CREATE OR REPLACE FUNCTION log_action_request_event() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO request_events (
      action_request_id, event_type, event_data,
      actor_type, actor_id, description
    ) VALUES (
      NEW.id,
      'status_changed',
      jsonb_build_object('from', OLD.status, 'to', NEW.status),
      COALESCE(current_setting('app.actor_type', true), 'system'),
      NULLIF(current_setting('app.actor_id', true), '')::uuid,
      format('상태: %s → %s', OLD.status, NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_action_request_event
  AFTER UPDATE ON action_requests
  FOR EACH ROW EXECUTE FUNCTION log_action_request_event();
```

## `event_data` 예시

### vcn_issued
```json
{
  "virtual_card_id": "uuid",
  "issuer": "shinhan",
  "last4": "4521",
  "monthly_limit_krw": 30000
}
```

### customer_confirmed
```json
{
  "confirmed_action": "vcn_registration_complete",
  "user_agent": "Mozilla/5.0..."
}
```

### sla_breached
```json
{
  "sla_deadline": "2026-05-15T14:00:00Z",
  "breach_at": "2026-05-15T16:30:00Z",
  "overdue_minutes": 150
}
```

## UI 에서의 활용

고객 포털 `/app/requests/[id]` 탭 1 (진행 상황) 의 타임라인:
```sql
SELECT event_type, description, actor_display_name, created_at
FROM request_events
WHERE action_request_id = $1
ORDER BY created_at ASC;
```

콘솔 `/console/requests/[id]` 체크리스트 (현재 완료된 단계 판단):
```sql
SELECT event_type
FROM request_events
WHERE action_request_id = $1
  AND event_type LIKE 'vcn_%' OR event_type = 'progress_step_completed'
ORDER BY created_at;
```

## 주요 쿼리

```sql
-- SLA 위반 감지 (배치)
INSERT INTO request_events (action_request_id, event_type, event_data, actor_type, description)
SELECT ar.id, 'sla_breached',
  jsonb_build_object(
    'sla_deadline', ar.sla_deadline,
    'breach_at', now(),
    'overdue_minutes', EXTRACT(EPOCH FROM (now() - ar.sla_deadline)) / 60
  ),
  'system',
  format('SLA 위반 (지연 %s분)', 
    EXTRACT(EPOCH FROM (now() - ar.sla_deadline)) / 60)
FROM action_requests ar
WHERE ar.sla_deadline < now()
  AND ar.status IN ('pending','in_progress')
  AND NOT EXISTS (
    SELECT 1 FROM request_events
    WHERE action_request_id = ar.id AND event_type = 'sla_breached'
  );
```

## 참조

- `action_requests`: `schemas/tables/action_requests.md`
- 메시지 스레드: `schemas/tables/request_messages.md`
- 고객 UI 타임라인: `screens/customer/requests.md § 탭 1`
- 콘솔 UI 체크리스트: `screens/console/request_detail.md § 처리 워크플로`
