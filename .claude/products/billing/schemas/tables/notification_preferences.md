# Billing / Schemas / notification_preferences — 테이블 본문

> 알림 채널 × 이벤트 유형별 on/off 설정. `/app/settings/notifications` UI 의 데이터 저장소.

---

## DDL

```sql
CREATE TABLE notification_preferences (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  member_id      UUID REFERENCES members(id) ON DELETE CASCADE,
  
  -- 키: 채널 × 이벤트 유형
  channel        TEXT NOT NULL CHECK (channel IN ('email','slack','sms','push')),
  event_type     TEXT NOT NULL,
  /* 값 예시:
     'vcn_issued', 'payment_declined', 'invoice_issued',
     'request_awaiting_customer', 'creditback_ending_d30',
     'message_from_am', 'overdue_warning_d14',
     'member_invited', 'weekly_usage_report', 'service_tos_changed'
  */
  
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Owner 조직 기본값 (신규 멤버 적용)
  is_org_default BOOLEAN DEFAULT FALSE,
  
  -- 메타
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (org_id, member_id, channel, event_type)
);

CREATE INDEX idx_notification_prefs_member ON notification_preferences(member_id) 
  WHERE is_org_default = FALSE;
CREATE INDEX idx_notification_prefs_org_default ON notification_preferences(org_id) 
  WHERE is_org_default = TRUE;
```

## 조회 로직 (알림 전송 시)

```sql
-- Alice 에게 VCN 발급 완료 이메일 보낼까?
SELECT COALESCE(
  -- 1순위: 본인 설정
  (SELECT enabled FROM notification_preferences
    WHERE member_id = $alice_id 
      AND channel = 'email' 
      AND event_type = 'vcn_issued'),
  -- 2순위: 조직 기본값
  (SELECT enabled FROM notification_preferences
    WHERE org_id = $org_id AND is_org_default = TRUE
      AND channel = 'email' 
      AND event_type = 'vcn_issued'),
  -- 3순위: 시스템 기본값 (하드코딩)
  TRUE
) AS should_send;
```

## 기본값 상수 (시스템 레벨)

```typescript
// 코드 상수, 각 이벤트의 기본값
const DEFAULT_NOTIFICATIONS = {
  email: {
    vcn_issued: true,
    payment_declined: true,          // 끄기 어려움 (UX 경고)
    invoice_issued: true,
    request_awaiting_customer: true,
    creditback_ending_d30: true,
    message_from_am: true,
    member_invited: false,
    weekly_usage_report: true,
    service_tos_changed: true,
  },
  slack: {
    payment_declined: true,
    message_from_am: true,
    request_awaiting_customer: true,
    invoice_issued: false,           // 이메일이면 충분
  },
  sms: {
    payment_declined: false,         // 사전 동의 필요
    vcn_suspended: true,
    overdue_warning_d14: true,
  }
};
```

## Owner 조직 기본값 일괄 적용

```sql
-- Owner 가 [일괄 적용] 클릭
BEGIN;

-- 1. 조직 기본값 업서트
INSERT INTO notification_preferences (org_id, member_id, channel, event_type, enabled, is_org_default)
VALUES ($org, NULL, 'email', 'vcn_issued', TRUE, TRUE)
ON CONFLICT (org_id, member_id, channel, event_type) 
  DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();

-- 2. 기존 멤버 전체 적용 (선택)
UPDATE notification_preferences np
SET enabled = (SELECT enabled FROM notification_preferences
               WHERE org_id = np.org_id AND is_org_default = TRUE
                 AND channel = np.channel AND event_type = np.event_type),
    updated_at = now()
WHERE np.org_id = $org AND np.member_id IS NOT NULL;

COMMIT;
```

## RLS

```sql
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- 본인 설정 (read + write)
CREATE POLICY "notification_prefs_self"
  ON notification_preferences FOR ALL
  USING (
    member_id = (SELECT id FROM members WHERE auth_user_id = auth.uid())
  );

-- Owner: 조직 기본값 read + write
CREATE POLICY "notification_prefs_org_default_owner"
  ON notification_preferences FOR ALL
  USING (
    is_org_default = TRUE
    AND org_id IN (
      SELECT org_id FROM members
      WHERE auth_user_id = auth.uid() AND role = 'owner'
    )
  );
```

## 참조

- UI: `screens/customer/notifications.md`
- Service-First 예외 (본인 영역): `rules/service_first.md § PB-008-09`
- 감사 (본인 설정 변경 = customer_only): `rules/audit_visibility.md § PB-010-03`
