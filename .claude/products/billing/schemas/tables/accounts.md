# Billing / Schemas / accounts — 테이블 본문

> 멤버 × 서비스 계정. "Alice 의 Claude Team 계정" = 1 row.

---

## DDL

```sql
CREATE TABLE accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  member_id          UUID NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  service_id         UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,

  -- 계정 식별
  vendor_account_id  TEXT,                      -- 벤더 내부 사용자 ID (있으면)
  vendor_workspace_id TEXT,                      -- Workspace 소속 시

  -- 상태
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','active','suspended','terminating','terminated')),

  -- 한도 설정
  monthly_limit_krw  BIGINT NOT NULL,           -- 계정별 월 한도
  per_txn_limit_krw  BIGINT,                    -- 건당 한도 (NULL=무제한)

  -- 라이프사이클
  requested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at       TIMESTAMPTZ,               -- 첫 결제 성공 시
  terminated_at      TIMESTAMPTZ,

  -- 설정
  auto_renew         BOOLEAN DEFAULT TRUE,
  metadata           JSONB DEFAULT '{}'::jsonb,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, member_id, service_id)        -- 한 멤버가 같은 서비스 중복 계정 금지
);

CREATE INDEX idx_accounts_org_status ON accounts(org_id, status);
CREATE INDEX idx_accounts_member ON accounts(member_id, status);
CREATE INDEX idx_accounts_service ON accounts(service_id, status);
```

## 상태 전이

```
pending ──(VCN 발급 완료, 고객 등록)──▶ active
           (첫 결제 성공)                │
                                         ├──▶ suspended (일시)
                                         │
                                         └──▶ terminating
                                              (VCN suspend, 7일 유예)
                                                │
                                                ▼
                                           terminated
                                           (VCN revoked, auto_renew=FALSE)
```

## RLS

```sql
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- 본인 계정 조회
CREATE POLICY "accounts_self_select"
  ON accounts FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM members WHERE auth_user_id = auth.uid() AND status = 'active'
    )
    AND (
      member_id = (SELECT id FROM members WHERE auth_user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM members
        WHERE auth_user_id = auth.uid() AND role IN ('owner','admin')
      )
    )
  );
```

Member 는 본인 계정만. Owner/Admin 은 조직 전체.

## 주요 쿼리

```sql
-- 이번 달 계정별 지출
SELECT a.id, m.name, s.display_name,
  COALESCE(SUM(t.customer_charge_krw), 0) AS month_charge
FROM accounts a
JOIN members m ON m.id = a.member_id
JOIN services s ON s.id = a.service_id
LEFT JOIN transactions t ON t.account_id = a.id
  AND t.authorized_at >= date_trunc('month', now())
  AND t.status IN ('authorized','settled')
WHERE a.org_id = $1 AND a.status = 'active'
GROUP BY a.id, m.name, s.display_name;
```

## 참조

- VCN 연결: `tables/virtual_cards.md`
- 오프보딩 일괄: `rules/offboarding.md` (PB-011, v0.19)
- 계정 요청 플로우: `screens/customer/requests.md` (v0.19)
- 원본: `03_데이터_모델.md § 6-3 accounts`
