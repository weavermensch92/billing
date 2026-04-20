# Billing / Screens / Customer / data_export — `/app/settings/data-export`

> 데이터 내보내기. Owner 전용. 전체 ZIP 또는 부분 CSV. 해지 시 필수 기능.

---

## 목적

고객이 조직 내 모든 Billing 데이터를 본인 소유로 확보. 규정 준수 + 해지 시 데이터 주권.

## 레이아웃

```
┌──────────────────────────────────────────────────┐
│ 데이터 내보내기                                    │
│                                                    │
│ Alpha Inc. 의 모든 Billing 데이터를 ZIP 으로         │
│ 다운로드할 수 있습니다.                            │
├──────────────────────────────────────────────────┤
│ 📦 전체 데이터 ZIP                                  │
│ 조직 정보 + 멤버 + 계정 + VCN 메타 + 결제 + 청구서 │
│ + 요청 내역 + 감사 로그 (전체 기간)                │
│                                                    │
│ 예상 파일 크기: ~25 MB                             │
│ 예상 소요 시간: 2~5분                              │
│                                                    │
│ [전체 ZIP 생성 요청]                               │
├──────────────────────────────────────────────────┤
│ 📄 부분 CSV (유형별)                                │
│                                                    │
│ [결제 내역 CSV]      기간 선택 ▾                    │
│ [청구서 CSV]         기간 선택 ▾                    │
│ [감사 로그 CSV]      기간 선택 ▾                    │
│ [요청 내역 CSV]      기간 선택 ▾                    │
├──────────────────────────────────────────────────┤
│ 📋 내보내기 이력 (5)                                │
│                                                    │
│ 2026-05-10  전체 ZIP      ✅ 완료   [다운로드]     │
│ 2026-04-01  결제 CSV      ✅ 완료   [다운로드]     │
│ 2026-03-15  전체 ZIP      ⌛ 만료 (7일 경과)        │
│ ...                                                │
└──────────────────────────────────────────────────┘
```

## 전체 ZIP 구조

```
gridge-billing-export-{org}-{timestamp}.zip
├── organization/
│   ├── org.json
│   ├── contracts.json
│   └── members.json
├── accounts/
│   ├── accounts.json
│   └── virtual_cards_metadata.json  (전체 번호 제외!)
├── transactions/
│   ├── 2026-04.csv
│   ├── 2026-05.csv
│   └── ...
├── invoices/
│   ├── INV-2026-04-001.pdf
│   ├── INV-2026-05-001.pdf
│   └── invoices.json
├── requests/
│   └── requests.json
├── audit_logs/
│   └── audit_logs.csv
└── README.md  (구조 설명 + 생성 일시)
```

### 포함 안 되는 것 (민감)
- **VCN 전체 번호** — 카드사만 보유
- **`gridge_margin_krw`, `raw_payload`** — 내부 전용
- **`csm_notes`, `internal_notes`** — `internal_only` visibility
- **전체 admin 의 사적 정보** — AM 이름만, 이메일 제외

## 처리 플로우

```
[Owner 클릭 → 확인 다이얼로그]
      ↓
[export_jobs INSERT (type, org_id, requested_by)]
      ↓
[audit_logs INSERT (visibility='both', action='data_export_requested')]
      ↓
[비동기 큐 작업]
  - org 데이터 조회 (RLS 적용)
  - ZIP 생성 (Node.js yazl 또는 archiver)
  - Supabase Storage 업로드
  - Pre-signed URL 생성 (7일 유효)
      ↓
[export_jobs UPDATE (status='ready', file_url, expires_at)]
      ↓
[이메일 발송 + 고객 포털 알림]
      ↓
[고객 다운로드 → export_jobs UPDATE (downloaded_at)]
      ↓
[audit_logs INSERT (action='data_export_downloaded')]
      ↓
[7일 후 자동 삭제 → export_jobs UPDATE (status='expired')]
```

## `export_jobs` 테이블 (v0.24+ 작성)

```sql
CREATE TABLE export_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES orgs(id),
  requested_by   UUID NOT NULL REFERENCES members(id),
  export_type    TEXT CHECK (export_type IN ('full_zip','transactions_csv','invoices_csv','audit_csv','requests_csv')),
  filter_params  JSONB,                      -- 기간 등
  
  status         TEXT CHECK (status IN ('queued','processing','ready','failed','expired')),
  file_url       TEXT,                       -- Pre-signed URL
  file_size_bytes BIGINT,
  
  created_at     TIMESTAMPTZ DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  downloaded_at  TIMESTAMPTZ
);
```

## CSV 부분 내보내기

각 CSV 는 기간 필터 + 포맷 고정:

### 결제 내역 CSV
```csv
transaction_id,date,merchant,member,service,amount_krw,currency,status
txn_abc,2026-05-14,Anthropic,Alice,Claude Team,45000,KRW,settled
...
```

### 청구서 CSV
```csv
invoice_number,billing_month,subtotal_krw,vat_krw,total_krw,status,paid_at
INV-2026-04-001,2026-04,6930000,693000,7623000,paid,2026-05-15
...
```

## 권한

- **Owner 만**. Admin / Member 는 사이드바 숨김.
- 보안 이유: 전체 데이터 집합은 법정 책임자 (Owner) 만 접근.

## 빈도 제한

- 전체 ZIP: 주 1회 (rate limit)
- 부분 CSV: 일 3회
- 초과 시 경고 메시지

## 알림

```
✉️ 이메일 자동 발송:
  - 요청 접수 확인
  - 생성 완료 + 다운로드 링크
  - 7일 만료 D-1 경고
  - 만료 알림

🔔 고객 포털 배너:
  "데이터 내보내기 준비 완료! 7일 안에 다운로드해주세요."
```

## 해지 시 자동 트리거

`orgs.status = 'terminating'` 전환 시 자동으로 **전체 ZIP 생성 요청** (가능한 시점의 전체 데이터).

```sql
-- 트리거
CREATE OR REPLACE FUNCTION auto_export_on_termination() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'terminating' AND OLD.status = 'active' THEN
    INSERT INTO export_jobs (org_id, requested_by, export_type, status)
    VALUES (
      NEW.id,
      (SELECT id FROM members WHERE org_id = NEW.id AND role = 'owner' LIMIT 1),
      'full_zip',
      'queued'
    );
    -- Owner 에게 알림
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_export_on_termination
  AFTER UPDATE ON orgs
  FOR EACH ROW EXECUTE FUNCTION auto_export_on_termination();
```

## Sprint 우선순위

**Sprint 4 필수** (해지 프로세스와 연계). 또한 Alpha NPS 높이는 가치 — "내 데이터 내가 가진다" 신뢰.

## 참조

- `export_jobs` (v0.24+): 추후 작성
- 해지 시 자동 export: `playbook/termination.md § D+30 완전 삭제`
- 감사 로그: `screens/customer/audit_log.md`
- 내보내기 감사: `rules/audit_visibility.md` (PB-010)
- 데이터 주권: `products/billing/CLAUDE.md § 7-4`
