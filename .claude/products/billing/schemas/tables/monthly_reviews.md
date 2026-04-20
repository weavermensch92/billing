# Billing / Schemas / monthly_reviews — 테이블 본문

> 월간 리뷰 세션. AM 이 고객사 월 1회 미팅 추적. 자동 집계 데이터 + 액션 아이템 + 업셀 시그널 연계.

---

## DDL

```sql
CREATE TABLE monthly_reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- 일정
  review_period    DATE NOT NULL,            -- 리뷰 대상 월 (2026-04-01)
  scheduled_at     TIMESTAMPTZ NOT NULL,
  duration_minutes INT DEFAULT 30,
  
  -- 담당
  assigned_to      UUID NOT NULL REFERENCES admin_users(id),
  
  -- 참여자
  customer_participants UUID[],              -- members.id[]
  gridge_participants   UUID[],              -- admin_users.id[]
  
  -- 준비 (Before meeting)
  auto_summary_data JSONB,                   -- 자동 집계 스냅샷
  /* 예시:
     {
       "monthly_revenue_krw": 7300000,
       "mom_change_pct": 12,
       "decline_rate_pct": 0.7,
       "sla_compliance_pct": 98,
       "signals_detected": ["wiring_upsell_high", "aiops_bundle_medium"]
     }
  */
  
  prep_notes       TEXT,
  prepared_talking_points JSONB DEFAULT '[]'::jsonb,
  
  -- 실행 (During meeting)
  started_at       TIMESTAMPTZ,
  meeting_notes    TEXT,                     -- 실시간 메모
  
  -- 완료 (After meeting)
  completed_at     TIMESTAMPTZ,
  completed_by     UUID REFERENCES admin_users(id),
  outcome_summary  TEXT,                     -- 3~5줄 요약
  
  -- 후속 액션
  action_items     JSONB DEFAULT '[]'::jsonb,
  /* 예시:
     [
       {"title": "VCN 해외결제 허용 건", "assigned_to": "...", "due": "2026-05-20"},
       {"title": "Wiring 제안서 송부", "assigned_to": "...", "due": "2026-05-25"}
     ]
  */
  
  -- 다음 리뷰
  next_review_scheduled_at TIMESTAMPTZ,
  
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (org_id, review_period)
);

CREATE INDEX idx_monthly_reviews_assigned ON monthly_reviews(assigned_to, scheduled_at DESC);
CREATE INDEX idx_monthly_reviews_upcoming ON monthly_reviews(scheduled_at)
  WHERE completed_at IS NULL AND scheduled_at >= now();
```

## auto_summary_data 자동 생성

리뷰 준비 단계 (미팅 1~3일 전 자동 트리거):

```sql
UPDATE monthly_reviews
SET auto_summary_data = jsonb_build_object(
  'monthly_revenue_krw', (
    SELECT SUM(customer_charge_krw) FROM transactions
    WHERE org_id = $org AND billing_month = $period
      AND status IN ('authorized','settled')
  ),
  'mom_change_pct', (
    SELECT ROUND(100.0 * (this_month - prev_month) / NULLIF(prev_month, 0), 1)
    FROM (SELECT SUM(customer_charge_krw) AS this_month FROM transactions
          WHERE org_id = $org AND billing_month = $period AND status = 'settled') t1,
         (SELECT SUM(customer_charge_krw) AS prev_month FROM transactions
          WHERE org_id = $org AND billing_month = $period - interval '1 month' AND status = 'settled') t2
  ),
  'decline_rate_pct', (
    SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status='declined') / NULLIF(COUNT(*), 0), 1)
    FROM transactions WHERE org_id = $org AND billing_month = $period
  ),
  'sla_compliance_pct', (
    SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE completed_at <= sla_deadline) / NULLIF(COUNT(*), 0), 1)
    FROM action_requests WHERE org_id = $org 
      AND created_at >= $period AND created_at < $period + interval '1 month'
  ),
  'signals_detected', (
    SELECT jsonb_agg(signal_type || '_' || confidence_level)
    FROM upsell_signals 
    WHERE org_id = $org AND status = 'new'
  ),
  'pending_action_items_from_last_review', (
    SELECT COUNT(*) FROM monthly_reviews prev_mr,
      jsonb_array_elements(prev_mr.action_items) ai
    WHERE prev_mr.org_id = $org AND prev_mr.review_period = $period - interval '1 month'
      AND (ai->>'completed')::boolean IS DISTINCT FROM TRUE
  )
)
WHERE id = $review_id;
```

## prepared_talking_points 자동 생성 (PW-006 유사 — 추천 대화)

```json
[
  {
    "order": 1,
    "type": "open",
    "content": "지난 한 달 잘 사용하셨나요?"
  },
  {
    "order": 2,
    "type": "issue_follow_up",
    "content": "5월 13일 거절 1건 발생 원인 + 재발 방지 조치 보고",
    "source": "transactions.declined"
  },
  {
    "order": 3,
    "type": "upsell",
    "content": "Wiring 도입 관심 탐색 대화",
    "source": "upsell_signals.wiring_high"
  },
  {
    "order": 4,
    "type": "proactive_notice",
    "content": "크레딧백 종료 3개월 전 예고 (2026-10-01)"
  },
  {
    "order": 5,
    "type": "open",
    "content": "개선 요청이나 이슈는?"
  }
]
```

## 월간 리뷰 완료 플로우

```
[담당 AM 이 [CSM 노트로 확정] 클릭]
      ↓
1. monthly_reviews.completed_at = now()
2. csm_notes INSERT (note_type='monthly_review', body=meeting_notes)
3. action_items 파싱 → 각각 처리:
   - action_request 생성 (VCN 증액 등)
   - follow_up 알림 스케줄
4. upsell_signals 상태 업데이트 (언급된 시그널 → 'discussed')
5. 다음 월간 리뷰 자동 예약 (+1 month)
```

## 콘솔 UI 연계

- `/console/home` AM 뷰: 담당 리뷰 카드
- `/console/csm/reviews`: 전체 리뷰 리스트 + 준비 노트
- `/console/orgs/[id]`: overview 탭에 최근 리뷰 표시

## 참조

- CSM 리뷰 UI: `screens/console/csm/reviews.md`
- `csm_notes`: `schemas/tables/csm_notes.md`
- `upsell_signals`: `schemas/tables/upsell_signals.md`
- 업셀 전환 (I-005): `integrations/billing-wiring.md`
- 원본: `03_데이터_모델.md § 15 CSM·월간리뷰`
