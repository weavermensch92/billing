# Billing / Schemas / overdue_actions — 테이블 본문

> 연체 조치 이력. D+1 이상 연체 시 단계별 대응 추적.

---

## DDL

```sql
CREATE TABLE overdue_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- 단계
  step            TEXT NOT NULL CHECK (step IN (
    'reminder_d_plus_1',      -- D+1 친절한 알림
    'reminder_d_plus_7',      -- D+7 경고
    'warning_d_plus_14',      -- D+14 VCN 중지 예고
    'suspension_d_plus_30',   -- D+30 VCN 일시 중지
    'termination_d_plus_60'   -- D+60 계약 해지 검토
  )),
  
  -- 실행
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_by     UUID REFERENCES admin_users(id),
  auto_executed   BOOLEAN DEFAULT FALSE,
  
  -- 통지
  notification_sent_at TIMESTAMPTZ,
  notification_channels JSONB DEFAULT '[]'::jsonb,  -- ['email', 'slack', 'sms']
  
  -- 결과
  resolved_at     TIMESTAMPTZ,           -- 연체 해소된 시점
  resolved_by     UUID REFERENCES admin_users(id),
  notes           TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_overdue_actions_invoice ON overdue_actions(invoice_id, executed_at DESC);
CREATE INDEX idx_overdue_actions_open ON overdue_actions(executed_at)
  WHERE resolved_at IS NULL;
```

## 단계별 액션

### D+1 `reminder_d_plus_1` — 친절한 알림
- 이메일: "청구서 납부 기한이 어제 지났습니다. 확인 부탁드립니다."
- 고객 포털 배너
- 자동 실행

### D+7 `reminder_d_plus_7` — 경고
- 이메일: "7일째 미납 상태입니다. 담당 AM 에게 연락드리겠습니다."
- Luna 가 Slack Connect 채널로 직접 연락
- 자동 실행 + 수동 Luna follow-up

### D+14 `warning_d_plus_14` — VCN 중지 예고
- 이메일 + SMS (Owner)
- "14일 이내 납부되지 않을 경우 VCN 일시 중지됩니다."
- Luna + Finance 수동 판단 (고객 특수 사정 감안)

### D+30 `suspension_d_plus_30` — VCN 일시 중지
- 모든 VCN `status = 'suspended'`
- 신규 결제 불가
- 기존 결제 자동 중지 (카드사 API)
- Super 승인 필요 (Luna 제안 → 위버 승인)

### D+60 `termination_d_plus_60` — 계약 해지 검토
- 법무·재무 자문
- 해지 프로세스 개시 (`termination.md` D-30 시작)
- Super 전권

## 연체 감지 배치 (일일 03:00)

```sql
-- 각 단계 자동 감지
INSERT INTO overdue_actions (invoice_id, org_id, step, auto_executed)
SELECT 
  i.id, i.org_id,
  CASE
    WHEN i.due_date + 1 = CURRENT_DATE THEN 'reminder_d_plus_1'
    WHEN i.due_date + 7 = CURRENT_DATE THEN 'reminder_d_plus_7'
    WHEN i.due_date + 14 = CURRENT_DATE THEN 'warning_d_plus_14'
    WHEN i.due_date + 30 = CURRENT_DATE THEN 'suspension_d_plus_30'
    WHEN i.due_date + 60 = CURRENT_DATE THEN 'termination_d_plus_60'
  END AS step,
  CASE
    WHEN i.due_date + 30 = CURRENT_DATE THEN FALSE  -- D+30은 Super 승인 필요
    ELSE TRUE
  END AS auto_executed
FROM invoices i
WHERE i.status = 'issued'
  AND i.due_date < CURRENT_DATE
  AND i.due_date IN (
    CURRENT_DATE - 1, CURRENT_DATE - 7, CURRENT_DATE - 14, 
    CURRENT_DATE - 30, CURRENT_DATE - 60
  )
  AND NOT EXISTS (
    SELECT 1 FROM overdue_actions oa 
    WHERE oa.invoice_id = i.id 
      AND oa.step = CASE ...
  );
```

## 콘솔 UI

`/console/billing/overdue`:
```
┌──────────────────────────────────────────────┐
│ 연체 관리                                       │
├──────────────────────────────────────────────┤
│ Alpha Inc. - INV-2026-03-001 - ₩8,019,000    │
│ 납부기한: 2026-04-15 · D+30 (D-30 VCN 중지)    │
│                                                 │
│ 진행 이력:                                      │
│ ✅ D+1 알림 자동 발송 (04-16)                   │
│ ✅ D+7 경고 자동 발송 (04-22)                   │
│ ✅ D+14 VCN 중지 예고 (04-29, Luna 수동 확인)   │
│ 🟡 D+30 VCN 중지 제안 (오늘)                    │
│    ⚠️ Super 승인 필요                           │
│    [중지 실행]  [유예 승인]  [결제 확인]        │
└──────────────────────────────────────────────┘
```

## 해소 시 기록

고객이 납부 확인:
```sql
UPDATE overdue_actions
SET resolved_at = now(),
    resolved_by = $finance_id,
    notes = '납부 확인 완료'
WHERE invoice_id = $1 AND resolved_at IS NULL;

-- invoice 상태도 갱신
UPDATE invoices SET status = 'paid', paid_at = now() WHERE id = $1;
```

## 참조

- `invoices`: `schemas/tables/invoices.md`
- 월말 마감: `playbook/month-end-close.md`
- 해지 프로세스: `playbook/termination.md`
- 원본: `03_데이터_모델.md § 9-7 overdue_actions`
