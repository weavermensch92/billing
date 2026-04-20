# Billing / Schemas / am_assignments — 테이블 본문

> AM 고객 담당 매핑. Phase 0 Luna 1:N / Phase 1 이후 복수 AM.

---

## DDL

```sql
CREATE TABLE am_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  admin_user_id   UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  
  -- 역할 (복수 AM 지원)
  role            TEXT NOT NULL DEFAULT 'primary'
                  CHECK (role IN ('primary','secondary','backup')),
  
  -- 기간
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at   TIMESTAMPTZ,
  
  -- 메타
  assigned_by     UUID REFERENCES admin_users(id),
  notes           TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 활성 primary AM 은 1명 (partial unique index)
CREATE UNIQUE INDEX uniq_am_assignments_primary
  ON am_assignments(org_id)
  WHERE role = 'primary' AND unassigned_at IS NULL;

CREATE INDEX idx_am_assignments_am ON am_assignments(admin_user_id)
  WHERE unassigned_at IS NULL;
CREATE INDEX idx_am_assignments_org ON am_assignments(org_id)
  WHERE unassigned_at IS NULL;
```

## 역할 정의

| role | 설명 | 동시 활성 |
|---|---|---|
| `primary` | 주 담당자, 모든 요청 기본 배정 | 1명만 |
| `secondary` | 보조 담당, 주 담당 부재 시 백업 | N명 허용 |
| `backup` | 백업 (주/보조 모두 부재 시) | N명 허용 |

## Phase 별 활용

**Phase 0**: Luna 가 모든 Alpha 고객의 primary. assignments row 1개.

**Phase 1**: Luna + 신규 AM 1명 → secondary 배정. 고객 5~10개사 담당 분산.

**Phase 2**: AM 3~5명 + 신규 고객 자동 배정 룰 (`auto_assign_rules`, 향후).

## 자동 배정 (Phase 2+ 예고)

```sql
-- 신규 고객 등록 시 AM 자동 배정
INSERT INTO am_assignments (org_id, admin_user_id, role, assigned_by, notes)
VALUES (
  NEW.id,
  (SELECT id FROM admin_users 
    WHERE role = 'am' AND status = 'active'
    ORDER BY (SELECT COUNT(*) FROM am_assignments 
      WHERE admin_user_id = admin_users.id AND unassigned_at IS NULL) ASC
    LIMIT 1),
  'primary',
  (SELECT id FROM admin_users WHERE email = 'system@gridge.ai'),
  'auto-assigned (workload balancing)'
);
```

## 주요 쿼리

```sql
-- 콘솔 /console/home AM 뷰: 담당 고객사
SELECT o.*, am.role, am.assigned_at
FROM orgs o
JOIN am_assignments am ON am.org_id = o.id
WHERE am.admin_user_id = $current_am
  AND am.unassigned_at IS NULL
  AND o.status = 'active'
ORDER BY o.name;

-- 담당 AM 변경 (이관)
BEGIN;
  UPDATE am_assignments
  SET unassigned_at = now()
  WHERE org_id = $org AND role = 'primary' AND unassigned_at IS NULL;

  INSERT INTO am_assignments (org_id, admin_user_id, role, assigned_by, notes)
  VALUES ($org, $new_am, 'primary', $requester, '인수인계');
COMMIT;
```

## RLS

운영자 전용. RLS 없음 (admin Auth 서버 미들웨어).

## 참조

- `admin_users`: `schemas/tables/admin_users.md`
- 콘솔 AM 홈: `screens/console/home.md § AM 뷰`
- CSM 월간 리뷰: `playbook/phase0-day1-runbook.md § 일일 운영`
- 원본: `03_데이터_모델.md § 5-2 am_assignments`
