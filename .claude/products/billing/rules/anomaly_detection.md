# Billing / Rules / Anomaly Detection — 이상 감지 룰

> **PB-012** — 거절 급증·미매칭·크로스 검증 불일치 등 이상 패턴 자동 감지 → `anomaly_events` INSERT. `anomaly_rules` 테이블로 규칙 중앙 관리.

---

## PB-012-01. 4가지 카테고리

| 카테고리 | 감지 대상 | 대응 주체 |
|---|---|---|
| **A. 거절 이상** | 단시간 내 거절 급증 / 단일 계정 반복 거절 | Ops (긴급) |
| **B. 결제 이상** | 평균 대비 급증 / 가맹점 매칭 실패 | Ops (분석) |
| **C. 교차 검증 이상** | AiOPS ↔ Billing 오차 (I-004) | Super |
| **D. 운영 이상** | VCN 만료 임박 누락 / 장기 미사용 계정 | AM / CSM |

## PB-012-02. anomaly_rules 스키마

```sql
CREATE TABLE anomaly_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code         TEXT UNIQUE NOT NULL,      -- 'decline_burst', 'payment_surge'
  category          TEXT NOT NULL CHECK (category IN ('decline','payment','cross_check','operational')),
  display_name      TEXT NOT NULL,
  
  -- 조건 (JSONB 로 유연하게)
  trigger_condition JSONB NOT NULL,
  /* 예시:
     {"count_threshold": 10, "time_window_minutes": 5, "status": "declined"}
     {"variance_pct_threshold": 20, "source": "aiops_billing"}
  */
  
  severity          TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  
  -- 자동 조치
  auto_actions      JSONB DEFAULT '[]'::jsonb,
  /* 예시:
     ["pause_vcn_issuance", "notify_super"]
  */
  
  -- 관리
  enabled           BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## PB-012-03. anomaly_events 스키마

```sql
CREATE TABLE anomaly_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID REFERENCES orgs(id) ON DELETE CASCADE,
  rule_id           UUID NOT NULL REFERENCES anomaly_rules(id),
  
  -- 감지 컨텍스트
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  detection_data    JSONB NOT NULL,       -- 감지 시점 데이터 스냅샷
  
  -- 관련 엔티티 (optional)
  account_id        UUID REFERENCES accounts(id),
  virtual_card_id   UUID REFERENCES virtual_cards(id),
  transaction_id    UUID REFERENCES transactions(id),
  
  -- 조치 상태
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','investigating','resolved','false_positive')),
  severity          TEXT NOT NULL,
  
  -- 해결
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID REFERENCES admin_users(id),
  resolution_note   TEXT,
  
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_anomaly_events_open ON anomaly_events(severity, detected_at DESC)
  WHERE status = 'open';
CREATE INDEX idx_anomaly_events_org ON anomaly_events(org_id, detected_at DESC);
```

## PB-012-04. 기본 시드 룰 (Phase 0 필수)

```sql
INSERT INTO anomaly_rules (rule_code, category, display_name, trigger_condition, severity, auto_actions) VALUES

-- A. 거절 이상
('decline_burst', 'decline', '거절 급증 (5분 내 10건+)',
  '{"count_threshold": 10, "time_window_minutes": 5, "status": "declined"}'::jsonb,
  'critical',
  '["pause_vcn_issuance", "notify_super", "prepare_customer_notice"]'::jsonb),

('repeated_decline_same_vcn', 'decline', '동일 VCN 반복 거절 (24h 3회+)',
  '{"count_threshold": 3, "time_window_hours": 24, "group_by": "virtual_card_id"}'::jsonb,
  'high',
  '["assign_to_ops"]'::jsonb),

-- B. 결제 이상
('payment_surge', 'payment', '일일 결제 전주 대비 200% 초과',
  '{"baseline": "previous_week_same_day", "multiplier_threshold": 2.0}'::jsonb,
  'high',
  '["notify_ops", "notify_customer_cfo"]'::jsonb),

('unmapped_merchant', 'payment', '가맹점 → 서비스 매칭 실패',
  '{"condition": "service_id IS NULL after 24h"}'::jsonb,
  'medium',
  '["queue_for_super", "block_invoice_inclusion"]'::jsonb),

-- C. 교차 검증 (I-004 연계)
('aiops_billing_gap', 'cross_check', 'AiOPS ↔ Billing 월 오차 20% 초과',
  '{"variance_pct_threshold": 20, "source": "aiops_vs_billing"}'::jsonb,
  'high',
  '["notify_super"]'::jsonb),

('anthropic_passthrough_mismatch', 'cross_check', 'Anthropic 패스스루 플래그 불일치',
  '{"condition": "service.vendor=Anthropic AND is_anthropic_passthrough=FALSE"}'::jsonb,
  'critical',
  '["notify_super", "pause_batch"]'::jsonb),

-- D. 운영 이상
('vcn_expiring_no_action', 'operational', 'VCN 만료 14일 이내, 갱신 요청 없음',
  '{"days_until_expiry": 14, "check": "no_pending_replace_request"}'::jsonb,
  'medium',
  '["notify_am"]'::jsonb),

('long_unused_account', 'operational', '계정 90일 이상 미사용',
  '{"days_inactive": 90, "check": "no_settled_transactions"}'::jsonb,
  'low',
  '["suggest_csm_review"]'::jsonb),

('deposit_low', 'operational', '티어 3 예치금 월 예상액 30% 이하',
  '{"deposit_ratio_threshold": 0.30, "tier": "prepaid_monthly"}'::jsonb,
  'medium',
  '["notify_customer", "notify_am"]'::jsonb);
```

## PB-012-05. 자동 조치 (auto_actions)

`anomaly_events` INSERT 시 연동:

```typescript
async function handleAnomaly(event: AnomalyEvent, rule: AnomalyRule) {
  for (const action of rule.auto_actions) {
    switch (action) {
      case 'pause_vcn_issuance':
        await db.update('service_flags', { vcn_issuance_paused: true });
        break;
      case 'notify_super':
        await notifySlack('#gridge-super', formatAlert(event, rule));
        break;
      case 'notify_ops':
        await notifySlack('#gridge-ops', formatAlert(event, rule));
        break;
      case 'notify_am':
        const am = await getAMForOrg(event.org_id);
        await notifyAdmin(am.id, formatAlert(event, rule));
        break;
      case 'notify_customer':
        await notifyOwner(event.org_id, formatCustomerAlert(event, rule));
        break;
      case 'pause_batch':
        await db.update('service_flags', { invoice_batch_paused: true });
        break;
      case 'prepare_customer_notice':
        // AM 에게 준비 UI 표시
        break;
    }
  }
}
```

## PB-012-06. 콘솔 UI

`/console/payments/anomalies` — 이상 이벤트 큐:

```
┌────────────────────────────────────────────────┐
│ 🔴 Critical (2)   🟠 High (5)   🟡 Medium (8)   │
├────────────────────────────────────────────────┤
│ 🔴 Alpha Inc. - 거절 급증 (5분 내 15건)         │
│    감지: 2026-05-15 14:23                       │
│    자동 조치: VCN 발급 중단 / Super 알림        │
│    [상세]  [해결]  [false_positive 표시]       │
│                                                  │
│ 🔴 Beta Co. - Anthropic 패스스루 플래그 오류    │
│    감지: 2026-05-15 14:31                       │
│    자동 조치: 배치 일시 중지                    │
│    [상세]  [수정]                               │
└────────────────────────────────────────────────┘
```

## PB-012-07. 감지 주기

| 카테고리 | 감지 방식 | 주기 |
|---|---|---|
| A. 거절 | 실시간 (트랜잭션 INSERT 트리거) | 즉시 |
| B. 결제 (급증) | 배치 | 매 시간 |
| B. 결제 (미매칭) | 배치 | 일일 02:00 |
| C. 교차 검증 | 월말 배치 | M+1일 02:00 |
| D. 운영 | 일일 배치 | 매일 03:00 |

## PB-012-08. False Positive 관리

감지 룰 개선 주기:
- 분기마다 `status = 'false_positive'` 비율 검토
- 임계값 조정 (trigger_condition JSONB 수정)
- 학습 기반 룰 추가 (Phase 1 이후, ML 검토)

```sql
-- 분기별 false positive 율
SELECT r.rule_code, r.display_name,
  COUNT(*) FILTER (WHERE e.status = 'false_positive') * 100.0 / COUNT(*) AS fp_rate
FROM anomaly_rules r
JOIN anomaly_events e ON e.rule_id = r.id
WHERE e.detected_at >= now() - interval '3 months'
GROUP BY r.id
ORDER BY fp_rate DESC;
```

FP rate > 30% 규칙은 재검토 대상.

## PB-012-09. 자동 검증 체크리스트

- [ ] `anomaly_events` INSERT 시 `rule_id` 누락?
- [ ] critical 이벤트가 Super 알림 없이 조용히 처리?
- [ ] false_positive 로 표시 후 동일 패턴 재감지 룰 개선 없음?
- [ ] 자동 조치 (`pause_vcn_issuance` 등) 해제 메커니즘 없음?
- [ ] 교차 검증 (I-004) 결과가 anomaly_events 없이 독립 저장?

## PB-012-10. Phase 확장 계획

**Phase 0**: 룰 기반 (위 9개 시드)
**Phase 1**: 룰 + 간단 통계 (표준편차 기반 이상치)
**Phase 2**: 룰 + ML (학습 기반, 벤더 정책 변화 자동 적응)

## 참조

- `anomaly_events` / `anomaly_rules`: `schemas/INDEX.md § 6 이상 감지`
- 거절 대응 SOP: `playbook/decline-response.md`
- 교차 검증: `integrations/billing-aiops.md` (I-004)
- 월말 배치: `playbook/month-end-close.md § 02:00 교차 검증`
- 콘솔 UI: `screens/console/anomalies.md` (v0.22)
- 원본: `02_시스템_아키텍처.md § 8 이상 감지 엔진`
