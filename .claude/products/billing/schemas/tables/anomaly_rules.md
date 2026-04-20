# Billing / Schemas / anomaly_rules — 테이블 본문

> 이상 감지 룰 정의. PB-012. 중앙 관리 + 런타임 조정.

---

## DDL

```sql
CREATE TABLE anomaly_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code         TEXT UNIQUE NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('decline','payment','cross_check','operational')),
  display_name      TEXT NOT NULL,
  description       TEXT,
  
  -- 조건 (JSONB)
  trigger_condition JSONB NOT NULL,
  
  severity          TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  
  -- 자동 조치
  auto_actions      JSONB DEFAULT '[]'::jsonb,
  
  -- 관리
  enabled           BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_anomaly_rules_enabled ON anomaly_rules(enabled, category);
```

## 초기 시드 (PB-012-04 기반 9개)

| rule_code | category | severity |
|---|---|---|
| `decline_burst` | decline | critical |
| `repeated_decline_same_vcn` | decline | high |
| `payment_surge` | payment | high |
| `unmapped_merchant` | payment | medium |
| `aiops_billing_gap` | cross_check | high |
| `anthropic_passthrough_mismatch` | cross_check | critical |
| `vcn_expiring_no_action` | operational | medium |
| `long_unused_account` | operational | low |
| `deposit_low` | operational | medium |

전체 DDL 시드 SQL: `rules/anomaly_detection.md § PB-012-04`.

## 룰 조건 (`trigger_condition`) 패턴

### 카운트 기반
```json
{"count_threshold": 10, "time_window_minutes": 5, "status": "declined"}
```

### 비율 기반
```json
{"baseline": "previous_week_same_day", "multiplier_threshold": 2.0}
```

### 조건 문자열
```json
{"condition": "service.vendor='Anthropic' AND is_anthropic_passthrough=FALSE"}
```

### 복합
```json
{
  "deposit_ratio_threshold": 0.30,
  "tier": "prepaid_monthly",
  "check_frequency": "daily"
}
```

## `auto_actions` 열거값

| action | 효과 |
|---|---|
| `pause_vcn_issuance` | 신규 VCN 발급 중단 (`service_flags`) |
| `pause_batch` | 월말 배치 일시 중지 |
| `notify_super` | Super 긴급 Slack |
| `notify_ops` | Ops Slack |
| `notify_am` | 담당 AM Slack |
| `notify_customer` | 고객 Owner 이메일 |
| `notify_customer_cfo` | 고객 CFO (billing_email) 이메일 |
| `assign_to_ops` | Ops 큐에 자동 배정 |
| `queue_for_super` | Super 승인 큐 |
| `block_invoice_inclusion` | 청구서 라인 아이템 포함 차단 |
| `prepare_customer_notice` | 고객 통지 템플릿 미리 작성 (AM UI) |
| `suggest_csm_review` | CSM 리뷰 노트 생성 |

## 룰 수정 절차

Super 전용 (`/console/super/anomaly-rules`):
1. `enabled = FALSE` 로 비활성화 → 영향 모니터링
2. `trigger_condition` 수정 → 테스트 데이터로 dry-run
3. `enabled = TRUE` 재활성
4. `audit_logs` 자동 기록 (visibility='internal_only')

## 주요 쿼리

```sql
-- 활성 룰 전체
SELECT * FROM anomaly_rules WHERE enabled = TRUE ORDER BY severity, rule_code;

-- 카테고리별 룰 적중 통계 (지난 달)
SELECT ar.category, ar.rule_code,
  COUNT(ae.id) AS detections,
  COUNT(ae.id) FILTER (WHERE ae.status = 'resolved') AS resolved,
  COUNT(ae.id) FILTER (WHERE ae.status = 'false_positive') AS fp
FROM anomaly_rules ar
LEFT JOIN anomaly_events ae ON ae.rule_id = ar.id
  AND ae.detected_at >= now() - interval '30 days'
WHERE ar.enabled = TRUE
GROUP BY ar.category, ar.rule_code
ORDER BY detections DESC;
```

## 참조

- 이상 감지 규칙: `rules/anomaly_detection.md` (PB-012)
- 이벤트 테이블: `schemas/tables/anomaly_events.md`
- 초기 시드 SQL: `rules/anomaly_detection.md § PB-012-04`
