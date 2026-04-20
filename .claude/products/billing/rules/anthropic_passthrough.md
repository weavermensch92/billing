# Billing / Rules / Anthropic Passthrough — 파트너십 할인 패스스루

> **PB-007** — Anthropic Partner Network 승인 후 API 매입가 10% 할인을 고객에게 패스스루. 시스템이 자동 분리 회계 + 파트너십 재협상 자료 자동 생성.

---

## PB-007-01. 전략적 배경

Anthropic Services Partner 승인 의미:
1. Claude API 매입가 **10% 할인** → 고객 패스스루
2. 리셀러 모델의 **"정식 공식 재판매자" 지위**
3. 기타 서비스 (OpenAI · Google) 유사 협상 레버리지

**Anthropic 사용 비중 높은 고객일수록 Gridge 실질 CAC 감소**. 고객 세그먼테이션 핵심 기준.

## PB-007-02. 회계 구조 (필드 설계)

```sql
-- transactions 테이블
is_anthropic_passthrough BOOLEAN DEFAULT FALSE

-- 금액 3필드 분리
gridge_cost_krw        BIGINT   -- Gridge 매입가 (할인 후)
customer_charge_krw    BIGINT   -- 고객 청구가 (할인 전 원가 기준)
gridge_margin_krw      BIGINT   -- 차액 (패스스루: 할인 금액 = 고객 혜택)
```

## PB-007-03. 패스스루 계산 로직

**일반 서비스 (non-passthrough)**:
```
원가: $100 → KRW ₩130,000
고객 청구: ₩130,000 (그대로)
Gridge 마진: ₩0 (크레딧백 6개월간 -10% → -₩13,000 CAC)
```

**Anthropic 패스스루**:
```
원가: $100 (파트너 10% 할인) → Gridge 지불 ₩117,000
고객 청구: ₩130,000 (할인 전 원가 기준)  ← ❓

→ 아니. 패스스루 의미는 할인을 고객에게 전달:
고객 청구: ₩117,000 (할인 후 가격 그대로 전달)
Gridge 마진: ₩0
is_anthropic_passthrough: TRUE
```

**+ 크레딧백 6개월간 중첩**:
```
고객 청구: ₩117,000 × 0.9 = ₩105,300 (실효 할인 19%)
Gridge CAC: (₩117,000 - ₩105,300) = ₩11,700
```

Anthropic 사용량 많을수록 Gridge 가 크레딧백으로 태우는 금액 ↓ (매입 원가 자체가 낮아서).

## PB-007-04. 자동 분리 처리 (트리거)

결제 이벤트 수신 시:

```typescript
async function processTransaction(rawPayment: CardIssuerWebhook) {
  const service = await getServiceByMerchant(rawPayment.merchant_descriptor);
  
  const isAnthropicPassthrough = (
    service.vendor === 'Anthropic' 
    && await isActivePartner()   // 파트너십 활성 체크
  );
  
  const gridgeCost = isAnthropicPassthrough
    ? rawPayment.amount_krw  // 이미 할인 적용된 매입가
    : rawPayment.amount_krw;
    
  const customerCharge = isAnthropicPassthrough
    ? gridgeCost  // 할인가 그대로 전달
    : gridgeCost;  // 일반 원가
    
  await db.insert('transactions', {
    ...rawPayment,
    gridge_cost_krw: gridgeCost,
    customer_charge_krw: customerCharge,
    gridge_margin_krw: customerCharge - gridgeCost,  // 패스스루면 0
    is_anthropic_passthrough: isAnthropicPassthrough,
  });
}
```

## PB-007-05. 파트너십 재협상 자료 자동 생성

월 1회 배치 (매월 1일 05:00):
```sql
-- partnership_report_monthly 뷰
CREATE VIEW v_anthropic_partnership_monthly AS
SELECT
  date_trunc('month', authorized_at) AS month,
  COUNT(*) AS passthrough_transaction_count,
  SUM(gridge_cost_krw) AS total_anthropic_cost_krw,
  SUM(customer_charge_krw) AS total_customer_passthrough_krw,
  COUNT(DISTINCT org_id) AS active_customers,
  -- 예상 파트너십 없을 때 원가 (10% 역산)
  SUM(gridge_cost_krw) / 0.9 AS estimated_list_price_krw
FROM transactions
WHERE is_anthropic_passthrough = TRUE
  AND status = 'settled'
GROUP BY date_trunc('month', authorized_at);
```

6개월 누적 → Anthropic 재협상 자료:
- 월 평균 매출 볼륨
- 고객사 수
- 성장 추이
- "할인율 15% 요청" 근거 자동 생성

## PB-007-06. KPI 모니터링

| 지표 | 목표 |
|---|---|
| Anthropic 패스스루 비중 (매출 기준) | 30% 이상 |
| 전체 고객 중 Anthropic 사용자 비율 | 70% 이상 |
| Anthropic 월 매입 볼륨 | 매월 증가 |

Finance 대시보드 `v_finance_mtd` 에 노출:
```sql
SUM(CASE WHEN is_anthropic_passthrough THEN customer_charge_krw ELSE 0 END) AS anthropic_revenue
```

## PB-007-07. 고객 UI 노출 원칙

**고객 포털**:
- 청구서 라인 아이템에 "Anthropic 파트너 할인 적용" 라벨
- 크레딧백과 **분리 표시** (구분 가능)

**금지**:
- Gridge 마진 / 파트너십 할인율 수치 고객 노출 (PB-005 내부·외부 정보 분리)
- 파트너십 재협상 대시보드 (`v_anthropic_partnership_monthly`) 고객 접근

## PB-007-08. 파트너십 상태 변경 대응

**파트너십 승인 전 (현재)**:
- `is_anthropic_passthrough` 필드는 준비되어 있으나 항상 FALSE
- Anthropic 결제도 일반 서비스와 동일 처리

**파트너십 승인 시점**:
- 배포: `feature_flag: anthropic_passthrough = ON` 활성화
- 기존 Anthropic 거래 소급 적용 없음 (승인 이후 신규만)
- 고객 전체 이메일 통지: "Anthropic 할인 혜택 시작"

**파트너십 해지 시 (리스크)**:
- `feature_flag` OFF
- 이후 거래는 일반 원가 처리
- 기존 할인은 유지 (소급 복구 없음)

## PB-007-09. 타 벤더 확장 설계

Anthropic 성공 후 OpenAI / Google 등 동일 구조 복제:

```sql
-- 확장 필드
is_openai_passthrough     BOOLEAN DEFAULT FALSE
is_google_passthrough     BOOLEAN DEFAULT FALSE
passthrough_vendor        TEXT  -- 'anthropic' / 'openai' / 'google' / NULL
passthrough_discount_rate NUMERIC(4,3)  -- 할인율 기록
```

초기 v0.18 은 Anthropic 단일. v0.20+ 다중 벤더 리팩토링 검토.

## PB-007-10. 자동 검증 체크리스트

- [ ] `is_anthropic_passthrough = TRUE` 인데 vendor ≠ Anthropic?
- [ ] 패스스루 거래의 `gridge_margin_krw ≠ 0`?
- [ ] 고객 포털에 `gridge_margin_krw` 값 노출?
- [ ] 파트너십 비활성인데 `is_anthropic_passthrough = TRUE` 거래 신규 생성?
- [ ] `v_anthropic_partnership_monthly` 뷰에 고객 접근 권한 부여?

## 참조

- `transactions` 테이블: `schemas/INDEX.md § 결제 원장`
- `v_finance_mtd` 뷰: `schemas/tables/invoices.md` (v0.19)
- 크레딧백과의 관계: `rules/creditback.md § PB-004-10`
- 회계 분리 엔진: PB-009 (v0.19)
- 파트너십 신청 상태: 사용자 메모리 `Anthropic Partner Network · Services Partner track 신청 제출`
- 원본 기획: `01_서비스_정의.md § 4-5 Anthropic 파트너십` + `10-7 원칙`
