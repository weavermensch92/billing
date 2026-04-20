# Billing / Schemas / members — 테이블 본문

> 고객사 소속 사용자. Owner / Admin / Member 3단 권한.

---

## DDL

```sql
CREATE TABLE members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  auth_user_id    UUID UNIQUE,                       -- Supabase Auth 연결
  team_id         UUID REFERENCES teams(id) ON DELETE SET NULL,

  -- 기본 정보
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,

  -- 역할
  role            TEXT NOT NULL CHECK (role IN ('owner','admin','member')),

  -- 상태
  status          TEXT NOT NULL DEFAULT 'invited'
                  CHECK (status IN ('invited','active','suspended','offboarding','offboarded')),

  -- 메타
  invited_at      TIMESTAMPTZ,
  invited_by      UUID REFERENCES members(id),
  activated_at    TIMESTAMPTZ,
  offboarded_at   TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, email)
);

CREATE INDEX idx_members_org ON members(org_id, status);
CREATE INDEX idx_members_auth ON members(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX idx_members_team ON members(team_id) WHERE team_id IS NOT NULL;
```

## 역할 매트릭스

| 액션 | Owner | Admin | Member |
|---|---|---|---|
| 조직 정보 수정 | ✅ | ❌ | ❌ |
| 멤버 초대 / 오프보딩 | ✅ | ✅ | ❌ |
| 청구서 조회 | ✅ | ✅ | ❌ |
| 계정 요청 (본인) | ✅ | ✅ | ✅ |
| 계정 요청 (타인 대신) | ✅ | ✅ | ❌ |
| Owner 양도 | ✅ (본인만) | ❌ | ❌ |
| Slack 해제 | ✅ | ❌ | ❌ |

## Owner 양도 (PB-001 불변 원칙)

조직당 **Owner 는 반드시 1명**. 양도는:
```sql
BEGIN;
  UPDATE members SET role = 'admin' WHERE org_id = $1 AND role = 'owner';
  UPDATE members SET role = 'owner' WHERE id = $new_owner_id;
COMMIT;
```

API: `POST /api/org/members/:id/transfer-owner` (현재 Owner 만).

## 상태 전이

```
invited ──(초대 이메일 수락)──▶ active
                                   │
                                   ├──▶ suspended (일시 정지)
                                   │
                                   └──▶ offboarding (PB-011 일괄 처리)
                                          │
                                          ▼
                                     offboarded
                                     (auth 비활성 + VCN 폐기 + 계정 해지)
```

## RLS

```sql
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- 조직원은 같은 org 멤버 조회 가능
CREATE POLICY "members_same_org_select"
  ON members FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM members
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- Member 는 본인만 수정
CREATE POLICY "members_self_update"
  ON members FOR UPDATE
  USING (auth_user_id = auth.uid());

-- Owner/Admin 은 같은 org 멤버 수정 가능
CREATE POLICY "members_admin_update"
  ON members FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM members
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner','admin')
        AND status = 'active'
    )
  );
```

## 오프보딩 일괄 처리 (PB-011 예고)

D-30 → D+0 절차:
1. `status = 'offboarding'` 전환
2. `offboarding_events` INSERT
3. 연결된 `accounts` 의 action_requests(bulk_terminate) 자동 생성
4. 모든 자식 완료 시 `status = 'offboarded'` + Supabase Auth 비활성

상세: `rules/offboarding.md` (PB-011, v0.19 확장) / `playbook/offboarding.md` (v0.20).

## 참조

- 초대 플로우: `screens/customer/org_members.md` (v0.19)
- VCN 폐기 연동: `rules/vcn.md § PB-002-07`
- 원본: `03_데이터_모델.md § 5-3 members`
