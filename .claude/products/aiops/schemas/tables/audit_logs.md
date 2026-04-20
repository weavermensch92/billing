# AiOPS / Schemas / audit_logs — 테이블 본문

> AiOPS 내부 감사 로그. Immutable (G-141 공통 정책). Billing audit_logs 와는 **물리적 별도 테이블** (G-091-06).

---

## DDL

```sql
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,

  -- 행위
  action        TEXT NOT NULL,             -- 'rotate_api_token', 'enable_prompt_storage'
  actor_user    UUID NOT NULL REFERENCES users(id),
  actor_role    TEXT NOT NULL,
  actor_ip      INET,

  -- 대상
  target_table  TEXT,
  target_id     TEXT,
  before_data   JSONB,
  after_data    JSONB,

  -- 추가
  description   TEXT,
  metadata      JSONB,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_org_time ON audit_logs(org_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_user, created_at DESC);

-- Immutable (G-141)
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
```

## 주요 감사 대상 액션

| action | 주체 | 설명 |
|---|---|---|
| `login` | user | 로그인 성공/실패 |
| `rotate_api_token` | super_admin | API 토큰 회전 (PA-004) |
| `enable_prompt_storage` | super_admin | prompt_storage 정책 변경 (PA-007) |
| `add_integration` | super_admin | Slack/SSO 연동 추가 |
| `view_prompt` | admin_teams / super_admin | 민감 프롬프트 조회 |
| `member_offboarded` | super_admin | 멤버 오프보딩 |
| `org_settings_change` | super_admin | plan / infra_mode 변경 |
| `coaching_card_delivered` | system | 코칭 카드 발송 |

## Immutable Ledger (G-141 공통)

Billing 의 PB-005 와 동일 원칙:
- UPDATE/DELETE 금지
- 수정 필요 시 역기록 (reversal entry) 만
- 보존 3년

## Billing 과의 분리 (G-091-06)

동일 이름 `audit_logs` 지만 **물리적 별도 테이블** (schema 분리):
- `aiops.audit_logs` — AiOPS 작업 이력
- `billing.audit_logs` — Billing 작업 이력

한 고객이 AiOPS + Billing (Mode A + D) 병행 시:
- 두 audit_logs 테이블 각각 기록
- `orgs.billing_org_id` 로 교차 참조 가능
- 감사 시 양쪽 통합 뷰 가능 (v_full_audit_combined, 필요 시 Phase 2)

## RLS

```sql
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- super_admin 만 조직 전체 감사 조회
CREATE POLICY "audit_logs_super_admin_select"
  ON audit_logs FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM users 
      WHERE auth_user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- 본인 관련 감사는 본인 조회 가능 (로그인 이력 등)
CREATE POLICY "audit_logs_self_select"
  ON audit_logs FOR SELECT
  USING (
    actor_user = (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );
```

## 보존

- **3년** 유지 (법정 최소)
- 이후 cold storage 이관 (Supabase Storage)
- 해지 시 `org_id = NULL` 로 유지 (법정 3년 보존, PB-005-08 동일 패턴)

## 참조

- G-141 immutable 공통: `rules/08_security.md § G-141`
- PA-008 (감사 로그 거버넌스): `products/aiops/rules/governance.md`
- Billing audit_logs (별개 테이블): `products/billing/schemas/tables/audit_logs.md`
- Mode 경계: `rules/05_infra_mode.md § 12 Mode D` (G-091-06)
