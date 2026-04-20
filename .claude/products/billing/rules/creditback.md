# Billing / Rules / Creditback — 10% 크레딧백

> **PB-004** — 최초 6개월 원가 −10% 크레딧백. "다음 달 청구서 공제" 방식. 매출 할인으로 회계 처리 (선급금 아님).

---

## PB-004-01. 지급 방식 (절대 규칙)

**방식**: M월의 모든 결제 합계 → M+1월 초 발행 청구서에서 10% 공제.

- 회계상 **매출 할인**으로 처리
- **선급금·환급 아님** (현금흐름 영향 없음)
- M6(6개월차) 결제분도 M7 청구서에서 공제 (**마지막 공제**)
- M7 결제분부터 공제 없음

## PB-004-02. 계약서 명시 문구

```
크레딧백은 계약 개시일 기준 6개월간 발생한 결제액에 한함.
크레딧백은 다음 달 청구서에서 공제되는 매출 할인이며, 현금 환급이 아님.
```

고객 계약서 / 서비스 약관 / 포털 FAQ 일관 반영.

## PB-004-03. 장점 (설계 근거)

1. **현금흐름 영향 없음** — 선지급 구조 아님
2. **매달 청구서에 "AI Cost Optimization −₩XXX" 라인 노출** → 매달 가치 체감
3. **6개월째 이 라인 사라지는 순간** = 재계약 대화 타이밍

## PB-004-04. 계산 로직

```typescript
function calcCreditback(orgId: string, billingMonth: Date): number {
  // 대상 월의 settled 결제 전체
  const monthlyTotal = sumTransactions({
    org_id: orgId,
    billing_month: billingMonth,
    status: 'settled',
  });
  
  // 크레딧백 기간 내인지 확인
  const contract = getOrgContract(orgId);
  if (billingMonth > contract.creditback_end_date) {
    return 0;  // 종료됨
  }
  
  return Math.floor(monthlyTotal * 0.10);
}
```

## PB-004-05. 6개월 경계 처리

`org_contracts.creditback_end_date` 기준:
- `contract_start_date` = 2026-05-01
- `creditback_end_date` = 2026-11-01 (6개월 후)
- M6 = 2026-10월 결제 → 2026-11월 청구서에서 공제 (마지막)
- M7 = 2026-11월 결제 → 공제 없음

**final_creditback_applied** 플래그:
```sql
ALTER TABLE org_contracts ADD COLUMN final_creditback_applied BOOLEAN DEFAULT FALSE;
```

M6 청구 시 자동 `TRUE` 설정 + 고객 포털 배너 "마지막 크레딧백이 적용되었습니다".

## PB-004-06. 종료 전 고객 커뮤니케이션

자동 배치 (매일):
- **종료 60일 전**: `upsell_signals` INSERT (type='renewal_risk') → CSM 피드
- **종료 30일 전**: 고객 포털 크레딧백 페이지 오렌지 경고 + Owner 이메일
- **M6 청구서 발행 시**: `final_creditback_applied = TRUE` 표시 (내부)
- **종료 후**: 자동 연장 모드 (해지 없음) → CSM 재협상

## PB-004-07. 크레딧백 테이블

```sql
CREATE TABLE credit_backs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES orgs(id),
  invoice_id        UUID NOT NULL REFERENCES invoices(id),
  billing_month     DATE NOT NULL,
  transactions_total_krw  BIGINT NOT NULL,  -- 대상 월 결제 합계
  credit_amount_krw       BIGINT NOT NULL,  -- 10% 값
  rate                    NUMERIC(4,3) DEFAULT 0.100,
  is_final                BOOLEAN DEFAULT FALSE,
  created_at              TIMESTAMPTZ DEFAULT now()
);

-- immutable
CREATE RULE credit_backs_no_update AS ON UPDATE TO credit_backs DO INSTEAD NOTHING;
CREATE RULE credit_backs_no_delete AS ON DELETE TO credit_backs DO INSTEAD NOTHING;
```

수정 금지 (PB-005 immutable ledger).

## PB-004-08. 세금계산서 표기

청구서 PDF 라인 아이템:
```
원가 합계:            ₩9,000,000
AI Cost Optimization: -₩900,000
공급가액:             ₩8,100,000
VAT (10%):           ₩810,000
총 청구액:           ₩8,910,000
```

세금계산서 공급가액 = **크레딧백 적용 후** 금액 (매출 할인 반영).
VAT 는 **할인 후 공급가액의 10%**.

**세무 리스크 체크**: 회계사 자문 완료 (playbook § 9-2 세무 자문 리스트).

## PB-004-09. 7개월차 이후 BM (미확정)

Phase 0 계약서에는 다음만 명시:
- 7개월차 이후 0% 수수료 (원가 그대로)
- **별도 협의** 조항 (향후 BM 조정 가능성 열어둠)

v0.20 이후 Finance 실무 데이터 기반으로 7개월차 BM 정책 결정.

## PB-004-10. Anthropic 패스스루와의 관계

Anthropic 파트너십 10% 할인 고객 패스스루 → 크레딧백과 **별개 계산**:
- 크레딧백 = 고객사 전체 결제 × 10% (6개월간)
- 패스스루 할인 = Anthropic 매입가 할인 전체 고객 전달 (무기한)

두 할인이 중첩되면 Anthropic 사용량 많은 고객일수록 실효 할인율 ↑.
상세: `rules/anthropic_passthrough.md` (PB-007).

## PB-004-11. 자동 검증 체크리스트

- [ ] 크레딧백을 선급금으로 회계 처리?
- [ ] M6 월 결제의 크레딧백이 M7 청구서에 **미적용**?
- [ ] M7 월 결제에 크레딧백 **잘못 적용**?
- [ ] `credit_backs` 레코드 UPDATE / DELETE 시도?
- [ ] VAT 계산이 할인 전 금액 기준 (세법 위반)?

## 참조

- 6개월 종료 → 재계약 트리거: `rules/vendor_compliance.md` + CSM 노트 (v0.19)
- `org_contracts`, `credit_backs`, `invoices`: `schemas/INDEX.md`
- Immutable 원칙: `rules/immutable_ledger.md` (PB-005)
- 세무 자문: `playbook/legal-tax-review.md` (v0.20) § 9-2
- 원본 기획: `01_서비스_정의.md § 6-2 크레딧백 지급 방식`
