# Integrations / Billing ↔ AiOPS — 데이터 파이프라인

> **I-004** — AiOPS 사용량 snapshot ↔ Billing 실결제 transactions 매칭 + Anthropic 패스스루 교차 검증 + MSP대행 billing model 진화.

---

## I-004-01. 관계 정의

| 제품 | 역할 | 데이터 소유 |
|---|---|---|
| **AiOPS** | AI 사용 **관측** (프롬프트·토큰·비용 추정) | `aiops.logs`, `aiops.usage_snapshots` |
| **Billing** | AI 서비스 **결제·청구** (실제 카드 승인) | `billing.transactions`, `billing.invoices` |

AiOPS 는 "누가 AI 를 얼마나 썼는가" → **추정 비용**
Billing 은 "그릿지가 얼마를 대지급 했는가" → **확정 원가**

두 축의 데이터는 **독립적으로 수집**되며 월말에 **교차 검증**.

## I-004-02. 가능한 조합 (상호 배타 아님)

| 고객 조합 | 예시 | 통합 효과 |
|---|---|---|
| AiOPS 만 | AI 현황 보고 싶은 고객 | 추정 비용만 표시 |
| Billing 만 | 결제 관리만 원하는 고객 | 실결제 원장 |
| **AiOPS + Billing** | 풀 스택 관리 | 추정 vs 실제 비교 / 이상 감지 정확도 ↑ |

**핵심**: 한 고객사가 두 제품 모두 계약 시 `org_id` 공유 (동일 Gridge 조직).

## I-004-03. 데이터 파이프라인

### A. AiOPS → Billing 방향 (사용량 → 결제 매칭)

```
[AiOPS logs] 프롬프트·토큰 수집 (실시간)
      │
      ▼
[AiOPS usage_snapshots] 일일 집계 (03:00 배치)
      │
      ▼ (MSP대행 고객만, org.billing_enabled=TRUE)
[Billing bridge] 사용량 → 예상 비용 산출
      │
      ▼
[Billing usage_snapshots] 저장 (account_id 별)
      │
      ▼
[고객 포털 /app/billing] 이번 달 예상 비용 표시
```

### B. Billing → AiOPS 방향 (실결제 → 사용량 검증)

```
[Billing transactions] 카드 승인 수신 (실시간)
      │
      ▼ (월말 배치 M+1일 02:00)
[교차 검증 엔진] AiOPS 추정 vs Billing 실결제 대조
      │
      ├─ 오차 ≤ 5% → OK (정상)
      ├─ 5% < 오차 ≤ 20% → 경고 (CSM 검토)
      └─ 오차 > 20% → 이상 이벤트 (anomaly_events INSERT)
      │
      ▼
[운영 콘솔 /console/super/cross-check] 월별 대조 리포트
```

## I-004-04. MSP대행 Billing Model 진화 (3 Phase)

**Phase 0 (현재)**:
- AiOPS: 고객이 자기 API 키 (Mode C) / 그릿지 관리 키 (Mode A)
- Billing: 고객 VCN 결제 (재판매)
- 두 제품 별개 계약

**Phase 1 (v0.20+)**:
- `org_contracts.aiops_bridge_enabled = TRUE` 신규 플래그
- AiOPS 프록시를 거치는 모든 API 호출 → Billing transactions 자동 기록
- 고객은 **하나의 세금계산서** 로 AiOPS 비용 + 일반 AI 서비스 비용 통합 수신
- Anthropic API 만 패스스루, 나머지는 원가 재판매

**Phase 2 (향후)**:
- Billing 이 MSP 주 계약, AiOPS 는 "비용 분석 모듈" 로 내장
- 업셀 전환율 측정 표준화

## I-004-05. Anthropic 패스스루 교차 검증 (PB-007)

AiOPS `aiops.logs` 의 Anthropic API 호출 → Billing `transactions.is_anthropic_passthrough = TRUE` 일치 여부 검증:

```sql
-- 월말 배치: Anthropic 일치율
WITH aiops_anthropic AS (
  SELECT org_id, SUM(estimated_cost_krw) AS aiops_total
  FROM aiops.logs
  WHERE provider = 'anthropic'
    AND created_at >= date_trunc('month', now() - interval '1 month')
    AND created_at < date_trunc('month', now())
  GROUP BY org_id
),
billing_anthropic AS (
  SELECT org_id, SUM(customer_charge_krw) AS billing_total
  FROM billing.transactions
  WHERE is_anthropic_passthrough = TRUE
    AND billing_month = date_trunc('month', now() - interval '1 month')::date
  GROUP BY org_id
)
SELECT
  o.name, a.aiops_total, b.billing_total,
  ROUND(100.0 * ABS(a.aiops_total - b.billing_total) / NULLIF(b.billing_total, 0), 1) AS variance_pct
FROM orgs o
LEFT JOIN aiops_anthropic a ON a.org_id = o.id
LEFT JOIN billing_anthropic b ON b.org_id = o.id
WHERE a.aiops_total IS NOT NULL OR b.billing_total IS NOT NULL
ORDER BY variance_pct DESC;
```

**경고 임계**: `variance_pct > 20%` → 로그 누락 / 프록시 우회 / Anthropic 파트너십 플래그 오류 중 하나.

## I-004-06. 교차 이상 감지

**AiOPS 에서 급증 감지 + Billing 에서 미반영** 시나리오:
```
AiOPS: 지난 주 대비 토큰 사용 300% 증가
Billing: 같은 기간 결제 금액 변화 없음
      ↓
추정: 프록시를 거치지 않은 우회 사용 / 크레딧 소진
      ↓
[anomaly_events INSERT (severity='high', type='aiops_billing_gap')]
      ↓
[콘솔 알림] Super + 담당 AM
```

**Billing 에서 이상 결제 + AiOPS 로그 없음**:
```
Billing: 특정 서비스 이번 주 결제 +500% (₩2M → ₩12M)
AiOPS: 같은 서비스 사용량 변화 없음
      ↓
추정: 결제 오류 / 중복 청구 / 가맹점 사기
      ↓
[거절 대응 큐 에스컬레이션]
```

## I-004-07. 데이터 모델 신규 필드

```sql
-- billing.transactions 확장
ALTER TABLE billing.transactions ADD COLUMN aiops_log_count INT;  -- 매칭된 AiOPS 로그 수
ALTER TABLE billing.transactions ADD COLUMN aiops_estimated_krw BIGINT;  -- AiOPS 추정
ALTER TABLE billing.transactions ADD COLUMN variance_pct NUMERIC(5,2);  -- 실결제 대비 오차

-- billing.org_contracts 확장
ALTER TABLE billing.org_contracts ADD COLUMN aiops_bridge_enabled BOOLEAN DEFAULT FALSE;
```

## I-004-08. 업셀 시그널 자동 생성

AiOPS 도입 시점 → Billing 도입 제안:
- AiOPS 고객의 월 추정 비용이 **₩500만 초과** 3개월 연속
- 즉, 법인카드 관리 복잡도 임계점 도달
- `upsell_signals INSERT (type='billing_upsell', source_product='aiops')`

Billing 도입 시점 → AiOPS 도입 제안:
- Billing 고객이 월 ₩300만 이상 결제 + AI 서비스 8개 이상
- 즉, "누가 얼마나 쓰는지 궁금할" 시점
- `upsell_signals INSERT (type='aiops_upsell', source_product='billing')`

## I-004-09. 보안 / 격리

- AiOPS 데이터는 고객 데이터 (프롬프트 포함) → **Billing 테이블에 혼합 저장 금지**
- Billing 에는 **추정 비용 수치만** 저장 (프롬프트 원문 X)
- 해지 시: AiOPS / Billing 각각 D+30 삭제 (서로 독립)

## I-004-10. 자동 검증 체크리스트

- [ ] AiOPS 가 Billing 의 `gridge_margin_krw` 에 접근 가능?
- [ ] Billing 이 AiOPS 의 프롬프트 원문에 접근 가능?
- [ ] `aiops_bridge_enabled = FALSE` 인데 bridge 파이프라인 실행?
- [ ] Anthropic 패스스루 플래그 불일치 (AiOPS 는 anthropic, Billing 은 일반)?
- [ ] 교차 이상 감지가 단일 제품의 데이터만으로 트리거?

## 참조

- AiOPS 데이터 모델: `products/aiops/schemas/INDEX.md`
- Billing transactions: `products/billing/schemas/tables/transactions.md`
- Anthropic 패스스루: `products/billing/rules/anthropic_passthrough.md` (PB-007)
- Mode D 정의: `05_infra_mode.md § 12` (G-091)
- AiOPS → Wiring (기존): `integrations/aiops-wiring.md` (I-001)
