# Billing / Playbook / Smart Bill — 세금계산서 SaaS 연동

> Smart Bill 세금계산서 발행 SaaS. Phase 0 수동 포털, Phase 1 API 자동.

---

## 계약 구조

- **서비스**: Smart Bill (Biz) — 법인 세금계산서 발행 전문
- **요금제**: 월 건수 기반 (200건 이하 저가)
- **필수 준비**: 법인 인증서 + 전자서명 등록

## 설정 초기화

### 1. 법인 정보 등록
공급자 정보 (Gridge):
- 사업자등록번호: `123-45-67890` (예시)
- 상호: `주식회사 소프트스퀘어드` (Gridge 법인명)
- 대표자: 위버 (CEO)
- 주소 / 업종 / 업태 자동 입력

### 2. 공급받는자 매핑 (고객사별)
```sql
-- 고객사 온보딩 시 Smart Bill에도 등록
-- 수동 (Phase 0) 또는 API (Phase 1)
{
  "supplier_biz_no": "123-45-67890",
  "customer_biz_no": "098-76-54321",    -- orgs.business_registration_no
  "customer_name": "Alpha Inc.",
  "customer_ceo": "홍길동",
  "customer_address": "서울 ...",
  "billing_email": "accounting@alpha.co.kr"
}
```

## Phase 0 수동 발행 (월말 15:00)

### 절차

```
[Finance] Smart Bill 웹 포털 로그인
      ↓
[해당 월 청구서 리스트 열람] (Gridge 콘솔에서 export)
      ↓
[for each invoice where status='issued' AND tax_invoice_status='pending']
      │
      ├─ Smart Bill [신규 세금계산서 발행] 버튼
      ├─ 공급받는자: 고객사 사업자번호 입력 → 자동 조회
      ├─ 공급가액: invoices.subtotal_krw
      ├─ VAT: invoices.vat_krw (10%)
      ├─ 품목: "AI 서비스 통합 관리 ({billing_month}월)"
      ├─ [발행] 클릭 → 전자서명 → 완료
      └─ 발행된 세금계산서 번호 Gridge 콘솔에 수동 입력
           UPDATE invoices SET tax_invoice_id = 'SB-2026-05-...',
                               tax_invoice_issued_at = now(),
                               tax_invoice_status = 'issued'
           WHERE id = '{invoice_id}';
```

### 주의점 (실패 일반 원인)

**사업자번호 오류**:
- 하이픈 유무 체크 (Smart Bill 은 하이픈 없이)
- 10자리 숫자 검증

**이메일 오류**:
- 고객사 빌링 이메일 유효성 (도메인 확인)
- 여러 이메일 추가 등록 (회계팀 CC)

**공급받는자 정보 자동 조회 실패**:
- 국세청 DB 미등록 (신설 법인 등)
- 수동 입력 모드 전환

## 수정 발행

**원칙**: 발행 후 수정 불가 → 취소 후 재발행.

```
[잘못된 세금계산서 발견]
      ↓
[Smart Bill] 해당 세금계산서 → [취소] 버튼
      ↓
[연속 거래번호 유지 규정 준수]
  (세무당국 규정: 동일 공급가액으로 즉시 재발행)
      ↓
[신규 세금계산서 발행]
      ↓
[Gridge 콘솔] 반영
  UPDATE invoices SET tax_invoice_status = 'cancelled' WHERE id = '{old_id}';
  INSERT (또는 UPDATE) tax_invoice_id = '{new_id}';
```

## Phase 1 API 자동화

### 연동 API

```typescript
// 월말 발행 배치
async function issueTaxInvoice(invoice) {
  const response = await fetch('https://api.smartbill.co.kr/v1/tax-invoices', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SMARTBILL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      supplier_biz_no: GRIDGE_BIZ_NO,
      customer_biz_no: invoice.org.business_registration_no,
      supply_amount: invoice.subtotal_krw,
      vat_amount: invoice.vat_krw,
      total_amount: invoice.total_due_krw,
      items: [{
        name: `AI 서비스 통합 관리 (${invoice.billing_month})`,
        quantity: 1,
        unit_price: invoice.subtotal_krw,
      }],
      billing_email: invoice.org.billing_email,
      issue_date: new Date().toISOString().split('T')[0],
    }),
  });
  
  if (!response.ok) {
    throw new SmartBillError(await response.text());
  }
  
  const { tax_invoice_id, pdf_url } = await response.json();
  
  // invoices 업데이트
  await db.update('invoices', invoice.id, {
    tax_invoice_id,
    tax_invoice_issued_at: new Date(),
    tax_invoice_status: 'issued',
  });
  
  return { tax_invoice_id, pdf_url };
}
```

### 실패 처리

| 에러 | 원인 | 대응 |
|---|---|---|
| 400: 사업자번호 오류 | 잘못된 BRN | 고객 정보 확인 후 수정 |
| 401: 인증 실패 | API 키 만료 | Smart Bill 계정 재인증 |
| 429: Rate Limit | 월 건수 초과 | 요금제 상향 or 다음 날 발행 |
| 503: Smart Bill 다운 | 서비스 장애 | 수동 발행 전환 + "2영업일 내 개별 송부" 고지 |

## 서비스 다운 대응

```
[Smart Bill API 호출 실패] (503)
      ↓
[Gridge] tax_invoice_status = 'pending'
      ↓
[고객 이메일 자동 발송]
  "이번 달 세금계산서는 시스템 점검으로 2영업일 내 개별 송부 예정"
      ↓
[Finance Slack 알림]
      ↓
[Finance 수동 발행] (서비스 복구 후)
```

## KPI

- **세금계산서 자동 발행률**: 100% (Phase 1 목표)
- **발행 지연** (정상 스케줄 대비): < 2시간
- **오류 발행**: 0건 (수정 발행 추적)
- **월 건수**: 요금제 범위 내 유지

## 월간 정산 체크

매월 말일 Finance 가 확인:
- [ ] 발행된 세금계산서 수 = `SELECT COUNT(*) FROM invoices WHERE tax_invoice_status = 'issued'`
- [ ] 국세청 홈택스 전자세금계산서 목록 일치
- [ ] 미발행 청구서 없음
- [ ] 수정 발행 건의 연속 거래번호 규정 준수

## 참조

- `invoices.tax_invoice_*` 필드: `schemas/tables/invoices.md`
- 월말 마감 전체 절차: `playbook/month-end-close.md`
- 세무 자문: `playbook/legal-tax-review.md § 9-2`
- 원본: `07_운영_플레이북.md § 7-3 Smart Bill 실무`
