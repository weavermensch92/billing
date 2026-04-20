# Billing / Schemas / action_requests — 테이블 본문

> 고객 요청 (Service-First 워크플로 핵심). 모든 계정 변경은 이 테이블 경유. 부모·자식 관계로 일괄 처리.

---

## DDL

```sql
CREATE TABLE action_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  parent_id         UUID REFERENCES action_requests(id) ON DELETE CASCADE,  -- 자식 요청

  -- 요청 주체
  requested_by      UUID NOT NULL REFERENCES members(id),
  target_member_id  UUID REFERENCES members(id),                 -- 대상 멤버 (본인 or 타인)
  target_account_id UUID REFERENCES accounts(id),                -- 대상 계정 (있으면)

  -- 요청 유형 (5종 + bulk)
  action_type       TEXT NOT NULL CHECK (action_type IN (
    'new_account',        -- 신규 계정 요청
    'terminate_account',  -- 계정 해지
    'limit_change',       -- 한도 변경
    'vcn_replace',        -- VCN 재발급
    'decline_response',   -- 결제 거절 대응
    'bulk_terminate'      -- 오프보딩 일괄 (부모)
  )),

  -- 요청 내용 (JSONB)
  request_data      JSONB NOT NULL,
  /* 예시:
     new_account: { service_id, monthly_limit_krw, reason }
     limit_change: { new_limit_krw, reason }
     bulk_terminate: { target_member_id, account_count }
  */

  -- 상태 워크플로
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','in_progress',
                                       'awaiting_customer','completed','rejected','cancelled')),
  progress_state    JSONB DEFAULT '{}'::jsonb,   -- 중간 상태 (예: vcn_issued, delivered)

  -- 처리
  assigned_to       UUID REFERENCES admin_users(id),
  approved_at       TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  rejected_at       TIMESTAMPTZ,
  rejection_reason  TEXT,

  -- SLA
  sla_deadline      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_action_requests_org_status ON action_requests(org_id, status, created_at DESC);
CREATE INDEX idx_action_requests_assigned ON action_requests(assigned_to, status)
  WHERE status IN ('pending','in_progress');
CREATE INDEX idx_action_requests_parent ON action_requests(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_action_requests_sla ON action_requests(sla_deadline)
  WHERE status NOT IN ('completed','rejected','cancelled');
```

## 상태 전이

```
pending ─▶ approved ─▶ in_progress ─▶ awaiting_customer ─▶ completed
   │          │            │                                     
   │          │            └──▶ rejected (처리 중 문제)           
   │          │                                                   
   │          └──▶ cancelled (고객 취소)                          
   │                                                              
   └──▶ rejected (접수 즉시 반려)                                  
```

- `pending`: 접수, AM 검토 대기
- `approved`: AM 승인, 처리 시작 전
- `in_progress`: VCN 발급 중 등 처리 중
- `awaiting_customer`: VCN 발급 완료, 고객이 외부 서비스에 등록 대기
- `completed`: 완료 (고객 "교체 완료" 클릭 또는 첫 결제 성공)

## 5종 요청 타입별 워크플로

### `new_account` — 신규 계정
```
pending → AM 검토 → approved → VCN 발급 (PB-002) → awaiting_customer → completed
```

### `terminate_account` — 해지
```
pending → approved → VCN suspend (7일 유예) → in_progress → revoked → completed
```

### `limit_change` — 한도 변경
```
pending → AM 검토 (증액 Super 필요 여부 판단) → approved → VCN 한도 수정 → completed
```

### `vcn_replace` — 재발급
```
pending → approved → 신규 VCN 발급 → awaiting_customer (고객 등록) → 구 VCN revoke → completed
```

### `decline_response` — 거절 대응
```
pending → Ops 분석 → approved (원인별 조치) → completed
```

### `bulk_terminate` — 오프보딩 (부모)
```
pending
  ├─ 자식 action_requests × N (각 계정마다 terminate_account)
  │
  └─ 모든 자식 completed → 부모 completed
     + members.status = 'offboarded'
     + Supabase Auth 비활성
```

## RLS

```sql
ALTER TABLE action_requests ENABLE ROW LEVEL SECURITY;

-- 본인 요청 조회
CREATE POLICY "action_requests_self_select"
  ON action_requests FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM members WHERE auth_user_id = auth.uid() AND status = 'active')
    AND (
      requested_by = (SELECT id FROM members WHERE auth_user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM members WHERE auth_user_id = auth.uid() AND role IN ('owner','admin')
      )
    )
  );

-- 신규 요청 (본인 것만)
CREATE POLICY "action_requests_insert"
  ON action_requests FOR INSERT
  WITH CHECK (
    org_id IN (SELECT org_id FROM members WHERE auth_user_id = auth.uid() AND status = 'active')
    AND requested_by = (SELECT id FROM members WHERE auth_user_id = auth.uid())
  );
```

## 관련 테이블

- `request_messages` — 요청 스레드 메시지 (고객 ↔ AM)
- `request_events` — 타임라인 이벤트 (상태 변경 자동 기록)
- `sla_policies` — 요청 타입별 SLA 기한

## 주요 쿼리

```sql
-- 대기 큐 (콘솔 /console/requests)
SELECT ar.*, o.name, m.name AS requester_name
FROM action_requests ar
JOIN orgs o ON o.id = ar.org_id
JOIN members m ON m.id = ar.requested_by
WHERE ar.status = 'pending'
ORDER BY ar.created_at;

-- 고객 진행 중 요청 (/app/requests)
SELECT ar.*,
  (SELECT COUNT(*) FROM request_messages WHERE action_request_id = ar.id) AS message_count
FROM action_requests ar
WHERE ar.org_id = $1
  AND ar.status NOT IN ('completed','cancelled','rejected')
  AND ar.parent_id IS NULL
ORDER BY ar.created_at DESC;

-- SLA 임박 (콘솔 알림)
SELECT * FROM action_requests
WHERE status IN ('pending','in_progress')
  AND sla_deadline < now() + interval '4 hours'
ORDER BY sla_deadline;
```

## 참조

- VCN 연결: `tables/virtual_cards.md` + `rules/vcn.md`
- 오프보딩: `rules/offboarding.md` (PB-011, v0.19 확장)
- 고객 요청 UI: `screens/customer/requests.md` (v0.19)
- 콘솔 요청 큐: `screens/console/requests.md` (v0.19)
- 원본: `03_데이터_모델.md § 8 요청 워크플로`
