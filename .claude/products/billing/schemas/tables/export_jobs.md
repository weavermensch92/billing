# Billing / Schemas / export_jobs — 테이블 본문

> 데이터 내보내기 작업 큐. 고객 포털 `/app/settings/data-export` 에서 요청 → 비동기 처리 → 7일 유효 URL.

---

## DDL

```sql
CREATE TABLE export_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  requested_by   UUID NOT NULL REFERENCES members(id),
  
  -- 타입
  export_type    TEXT NOT NULL CHECK (export_type IN (
    'full_zip', 
    'transactions_csv', 
    'invoices_csv',
    'audit_csv', 
    'requests_csv'
  )),
  
  -- 필터 (기간 등)
  filter_params  JSONB DEFAULT '{}'::jsonb,
  /* 예시:
     {"from": "2026-01-01", "to": "2026-05-01"}
  */
  
  -- 상태
  status         TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','processing','ready','failed','expired')),
  error_message  TEXT,
  
  -- 결과 파일
  file_url       TEXT,                  -- Pre-signed Supabase Storage URL
  file_size_bytes BIGINT,
  file_checksum  TEXT,                  -- SHA-256
  
  -- 타임스탬프
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at     TIMESTAMPTZ,           -- 처리 시작
  completed_at   TIMESTAMPTZ,           -- 처리 완료
  expires_at     TIMESTAMPTZ,           -- 다운로드 링크 만료 (7일)
  downloaded_at  TIMESTAMPTZ,           -- 첫 다운로드 시점
  downloaded_count INT DEFAULT 0
);

CREATE INDEX idx_export_jobs_org ON export_jobs(org_id, created_at DESC);
CREATE INDEX idx_export_jobs_status ON export_jobs(status, created_at) 
  WHERE status IN ('queued','processing');
CREATE INDEX idx_export_jobs_requester ON export_jobs(requested_by, created_at DESC);
```

## 처리 플로우

```
[고객 요청] POST /api/export-jobs
      ↓
[INSERT (status='queued', expires_at=now()+interval '7 days')]
      ↓
[audit_logs INSERT (visibility='both', action='data_export_requested')]
      ↓
[비동기 워커]
  status = 'processing'
  started_at = now()
      ↓
  export_type 별 처리:
    full_zip: 전체 RLS 적용 쿼리 → 각 테이블별 CSV/JSON → ZIP archive
    transactions_csv: v_transaction_customer + 필터
    invoices_csv: invoices + 필터
    audit_csv: v_audit_customer + 필터
    requests_csv: action_requests + 필터
      ↓
  Supabase Storage 업로드
  Pre-signed URL 생성 (7일 TTL)
      ↓
  UPDATE status='ready', file_url, file_size_bytes, completed_at
      ↓
[이메일 발송 + 고객 포털 알림]
  "데이터 내보내기 완료, 7일 이내 다운로드"
      ↓
[고객 다운로드]
  GET /api/export-jobs/:id/download
  → downloaded_at, downloaded_count++
  → audit_logs INSERT (action='data_export_downloaded')
      ↓
[7일 후 자동 만료]
  status = 'expired'
  Storage 파일 삭제
```

## 실패 처리

```sql
-- 워커가 실패 시
UPDATE export_jobs
SET status = 'failed',
    error_message = 'ZIP generation failed: out of memory',
    completed_at = now()
WHERE id = $1;

-- 고객 포털 실패 알림
-- Finance / Super 에게 내부 Slack 알림
```

**실패 후 재시도**: 고객이 다시 요청 → 신규 job INSERT (기존 실패 건 유지).

## 빈도 제한 (중복 방지)

```sql
-- 신규 요청 시 체크
SELECT COUNT(*) FROM export_jobs
WHERE org_id = $1
  AND requested_by = $2
  AND export_type = 'full_zip'
  AND created_at > now() - interval '1 week'
  AND status != 'failed';

-- 전체 ZIP: 주 1회 제한
-- 부분 CSV: 일 3회 제한
```

## RLS

```sql
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;

-- Owner 만 접근
CREATE POLICY "export_jobs_owner_select"
  ON export_jobs FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM members
      WHERE auth_user_id = auth.uid()
        AND role = 'owner'
        AND status = 'active'
    )
  );
```

## 해지 시 자동 트리거

`orgs.status = 'terminating'` 전환 시:
```sql
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
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_export_on_termination
  AFTER UPDATE ON orgs
  FOR EACH ROW EXECUTE FUNCTION auto_export_on_termination();
```

## 보관 정책

- `status='ready'` 파일: 7일 후 Storage 삭제 (자동)
- `export_jobs` row: **영구 보관** (다운로드 이력 감사 증빙)
- `expires_at` 지난 row 는 `status='expired'` 로 상태만 전환

## 참조

- 고객 UI: `screens/customer/data_export.md`
- 가시성 규칙 (audit): `rules/audit_visibility.md` (PB-010)
- 해지 자동 트리거: `playbook/termination.md § D+0 해지 확정`
- 원본: `03_데이터_모델.md § 13 감사·내보내기`
