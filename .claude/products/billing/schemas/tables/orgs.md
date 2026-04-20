# Billing / Schemas / orgs — 테이블 본문

> 고객사 (조직) 마스터. 모든 Billing 도메인의 최상위 FK 앵커.

---

## DDL

```sql
CREATE TABLE orgs (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT NOT NULL,
  business_registration_no  TEXT NOT NULL,         -- 사업자등록번호 (변경 불가)
  representative_name       TEXT,
  address                   TEXT,
  billing_email             TEXT NOT NULL,
  additional_billing_emails TEXT[],                -- 회계팀 CC

  status                    TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','suspended','terminating','terminated')),

  -- 조직 단위 설정
  timezone                  TEXT NOT NULL DEFAULT 'Asia/Seoul',
  currency                  TEXT NOT NULL DEFAULT 'KRW',
  locale                    TEXT NOT NULL DEFAULT 'ko-KR',

  -- 보안 / 연동
  slack_workspace_id        TEXT,
  notification_webhook_url  TEXT,

  -- 메타
  metadata                  JSONB DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_orgs_business_reg ON orgs(business_registration_no);
CREATE INDEX idx_orgs_status ON orgs(status) WHERE status = 'active';
```

## 핵심 필드 설명

- **`business_registration_no`** — 사업자등록번호. **변경 불가** (M&A 등 사업자 변경은 Super 전용 위험 액션 `service.code_migrate` 로만 가능).
- **`status`** 전이:
  - `active` → `terminating` (해지 협의 시작, D-30)
  - `terminating` → `terminated` (D+0, VCN 전수 정지)
  - `suspended` (일시 중지, 연체 등)
- **`billing_email`** — 세금계산서 발송 주 수신자. `additional_billing_emails` 는 회계팀 공유용.

## RLS

```sql
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;

-- 고객 포털: 본인 소속 조직만
CREATE POLICY "orgs_member_select"
  ON orgs FOR SELECT
  USING (
    id IN (
      SELECT org_id FROM members
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- Owner 만 조직 정보 수정
CREATE POLICY "orgs_owner_update"
  ON orgs FOR UPDATE
  USING (
    id IN (
      SELECT org_id FROM members
      WHERE auth_user_id = auth.uid() AND role = 'owner' AND status = 'active'
    )
  );
```

**운영 콘솔**: 별도 Admin Auth (RLS 적용 X, 서버에서 `admin_users.role` 검증).

## 감사

- INSERT: super 전용 (`/console/orgs/new`)
- UPDATE: owner 또는 super → `audit_logs` 자동 기록
- DELETE: **금지** (해지 프로세스 D+30 후 CASCADE 삭제)

## 주요 쿼리

```sql
-- 활성 고객 전체
SELECT * FROM orgs WHERE status = 'active' ORDER BY name;

-- 사업자번호 중복 체크 (신규 등록 시)
SELECT id FROM orgs WHERE business_registration_no = $1;

-- 해지 예정 (D-30 이내)
SELECT o.*, oc.terminated_at
FROM orgs o JOIN org_contracts oc ON oc.org_id = o.id
WHERE o.status = 'terminating'
  AND oc.terminated_at < now() + interval '30 days';
```

## 참조

- 리셀러 구조: `rules/reseller.md` (PB-001)
- 해지 프로세스: `playbook/termination.md` (v0.20)
- org_contracts: `tables/org_contracts.md`
- 원본: `03_데이터_모델.md § 5 조직·멤버`
