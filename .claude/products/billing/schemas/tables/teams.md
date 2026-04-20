# Billing / Schemas / teams — 테이블 본문

> 조직 내 팀 (부서). 선택 기능. 팀별 지출 집계 / 권한 위임 기반.

---

## DDL

```sql
CREATE TABLE teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  
  -- 팀 관리자 (optional, members.id)
  manager_id    UUID REFERENCES members(id),
  
  -- 팀 예산 한도 (선택적)
  monthly_budget_krw BIGINT,
  
  -- 통계 (배치 갱신)
  active_members_count INT DEFAULT 0,
  
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (org_id, name)
);

CREATE INDEX idx_teams_org ON teams(org_id);
CREATE INDEX idx_teams_manager ON teams(manager_id) WHERE manager_id IS NOT NULL;
```

## 사용 시나리오

### 시나리오 1: 팀별 지출 집계
```sql
SELECT t.name, t.monthly_budget_krw,
  COALESCE(SUM(tx.customer_charge_krw), 0) AS mtd_spent,
  ROUND(100.0 * SUM(tx.customer_charge_krw) / NULLIF(t.monthly_budget_krw, 0), 0) AS usage_pct
FROM teams t
JOIN members m ON m.team_id = t.id AND m.status = 'active'
JOIN accounts a ON a.member_id = m.id
JOIN v_transaction_customer tx ON tx.account_id = a.id
WHERE t.org_id = $1
  AND tx.authorized_at >= date_trunc('month', now())
GROUP BY t.id, t.name, t.monthly_budget_krw
ORDER BY mtd_spent DESC;
```

### 시나리오 2: 팀 예산 초과 경고
```sql
SELECT t.name, t.monthly_budget_krw, mtd.spent
FROM teams t
JOIN LATERAL (
  SELECT SUM(tx.customer_charge_krw) AS spent
  FROM members m 
  JOIN accounts a ON a.member_id = m.id
  JOIN v_transaction_customer tx ON tx.account_id = a.id
  WHERE m.team_id = t.id
    AND tx.authorized_at >= date_trunc('month', now())
) mtd ON TRUE
WHERE t.org_id = $1
  AND t.monthly_budget_krw IS NOT NULL
  AND mtd.spent > t.monthly_budget_krw * 0.80;  -- 80% 초과 경고
```

## RLS

```sql
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- 조직원 모두 팀 정보 조회 (이름 / 관리자 / 멤버수)
CREATE POLICY "teams_member_select"
  ON teams FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM members
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- monthly_budget_krw 는 Owner/Admin 만
-- (View 레벨에서 필드 제외 or 별도 쿼리)
```

## 참조

- `members.team_id`: `schemas/tables/members.md`
- 고객 포털 팀 UI: `screens/customer/org_members.md § 팀` (v0.24+)
- 원본: `03_데이터_모델.md § 5-6 teams`
