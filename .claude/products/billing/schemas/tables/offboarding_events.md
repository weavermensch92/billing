# Billing / Schemas / offboarding_events — 테이블 본문

> 멤버 오프보딩 이벤트 기록. PB-011 부모 action_request 와 1:1 매칭.

---

## DDL

```sql
CREATE TABLE offboarding_events (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  member_id                  UUID NOT NULL REFERENCES members(id),
  initiated_by               UUID NOT NULL REFERENCES members(id),
  
  -- 부모 action_request 연결
  parent_request_id          UUID REFERENCES action_requests(id) ON DELETE SET NULL,
  
  -- 시작 시점 스냅샷
  initiated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  affected_accounts_count    INT NOT NULL,
  affected_accounts_summary  JSONB NOT NULL,
  /* 예시:
     [
       {"account_id": "...", "service_code": "svc_claude_team", "action": "terminate"},
       {"account_id": "...", "service_code": "svc_anthropic_api", "action": "transfer", "new_member_id": "..."},
       {"account_id": "...", "service_code": "svc_lovable", "action": "retain", "reason": "..."}
     ]
  */
  
  -- 진행 상태 (부모 action_request status 와 동기화)
  completion_stats           JSONB,
  /* 
     {"completed": 3, "pending": 2, "failed": 0, "cancelled": 0}
  */
  
  -- 완료
  completed_at               TIMESTAMPTZ,
  cancelled_at               TIMESTAMPTZ,
  cancellation_reason        TEXT,
  
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_offboarding_events_org ON offboarding_events(org_id, initiated_at DESC);
CREATE INDEX idx_offboarding_events_member ON offboarding_events(member_id);
CREATE INDEX idx_offboarding_events_incomplete ON offboarding_events(initiated_at)
  WHERE completed_at IS NULL AND cancelled_at IS NULL;
```

## 라이프사이클

```
[고객 wizard 제출]
      ↓
[action_requests INSERT parent_id=NULL, type='bulk_terminate']
[offboarding_events INSERT parent_request_id=...]
[action_requests INSERT 자식 N개 parent_id=부모id]
      ↓
[AM 승인 → 각 자식 처리]
      ↓
[각 자식 completed]
      ↓
[모든 자식 completed]
  - 부모 action_requests.status = 'completed'
  - offboarding_events.completed_at = now()
  - members.status = 'offboarded'
  - Supabase Auth 비활성화
```

## RLS

```sql
ALTER TABLE offboarding_events ENABLE ROW LEVEL SECURITY;

-- Owner/Admin 만 (민감)
CREATE POLICY "offboarding_events_admin_select"
  ON offboarding_events FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM members
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner','admin')
        AND status = 'active'
    )
  );
```

## 주요 쿼리

```sql
-- 진행 중 오프보딩
SELECT oe.*, m.name AS member_name
FROM offboarding_events oe
JOIN members m ON m.id = oe.member_id
WHERE oe.org_id = $1 AND oe.completed_at IS NULL;

-- 월별 오프보딩 통계 (CSM 가치 어필)
SELECT 
  date_trunc('month', initiated_at) AS month,
  COUNT(*) AS offboardings,
  SUM(affected_accounts_count) AS total_accounts,
  AVG(EXTRACT(EPOCH FROM (completed_at - initiated_at)) / 86400) AS avg_days
FROM offboarding_events
WHERE org_id = $1 AND completed_at IS NOT NULL
GROUP BY month
ORDER BY month DESC;
```

## 참조

- 오프보딩 규칙: `rules/offboarding.md` (PB-011)
- 부모 action_requests: `schemas/tables/action_requests.md`
- 고객 UI (3단계 wizard): `screens/customer/org_members_offboarding.md`
- 원본: `03_데이터_모델.md § 5-5 offboarding`
