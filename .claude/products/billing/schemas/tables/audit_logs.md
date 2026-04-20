# Billing / Schemas / audit_logs — 테이블 본문

> Immutable 감사 로그. 3분할 가시성 (customer_only / internal_only / both). 법정 3년 보존.

---

## DDL

```sql
CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID REFERENCES orgs(id) ON DELETE SET NULL,  -- 해지 후에도 유지

  -- 행위자
  actor_type      TEXT NOT NULL CHECK (actor_type IN ('customer','admin','system')),
  actor_id        UUID,                                -- members.id 또는 admin_users.id
  actor_email     TEXT,
  actor_ip        INET,

  -- 행위
  action_type     TEXT NOT NULL,                       -- 'INSERT:virtual_cards', 'status_change', etc
  target_table    TEXT NOT NULL,
  target_id       UUID,
  before_data     JSONB,
  after_data      JSONB,

  -- 가시성 (PB-005-05)
  visibility      TEXT NOT NULL DEFAULT 'both'
                  CHECK (visibility IN ('customer_only','internal_only','both')),

  -- 요약 (UI 노출용)
  description     TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_org_time ON audit_logs(org_id, created_at DESC);
CREATE INDEX idx_audit_logs_target ON audit_logs(target_table, target_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_type, actor_id, created_at DESC);
CREATE INDEX idx_audit_logs_visibility ON audit_logs(visibility, org_id, created_at DESC);

-- Immutable 완전 차단
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
```

## 가시성 분할 (PB-005-05)

| visibility | 고객 포털 | 운영 콘솔 | 예시 |
|---|---|---|---|
| `customer_only` | ✅ 표시 | ❌ 숨김 | 고객 로그인, 멤버 초대 수락 |
| `internal_only` | ❌ 숨김 | ✅ 표시 | VCN 전체 번호 조회, `gridge_margin` 수정 |
| `both` | ✅ 마스킹 | ✅ 전체 | VCN 발급, 청구서 발행, 오프보딩 |

## 자동 기록 트리거 (PB-005-09)

```sql
CREATE OR REPLACE FUNCTION auto_audit_log() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    org_id, actor_type, actor_id, actor_email,
    action_type, target_table, target_id,
    before_data, after_data, visibility
  ) VALUES (
    COALESCE(NEW.org_id, OLD.org_id),
    current_setting('app.actor_type', true),
    current_setting('app.actor_id', true)::uuid,
    current_setting('app.actor_email', true),
    TG_OP || ':' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
    'both'
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 민감 테이블에 트리거 부착
CREATE TRIGGER trg_audit_virtual_cards
  AFTER INSERT OR UPDATE ON virtual_cards
  FOR EACH ROW EXECUTE FUNCTION auto_audit_log();
-- 동일 패턴: accounts, invoices, credit_backs, org_contracts, members
```

## RLS

```sql
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 고객 포털: 본인 조직 + visibility ≠ internal_only
CREATE POLICY "audit_logs_customer_view"
  ON audit_logs FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM members
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
    AND visibility IN ('customer_only','both')
  );

-- Member 는 본인 관련 로그만
-- Owner/Admin 은 조직 전체
-- (정책 조건에 role 추가)
```

## 보존 (PB-005-07)

- 3년 유지 → cold storage 이관
- 해지 시에도 `org_id = NULL` 로 유지 (법정 3년 요건)
- DELETE 완전 차단 (어떤 경우에도)

## 주요 쿼리

```sql
-- 고객 포털 감사 로그 (v_audit_customer 뷰 권장)
SELECT id, actor_email, action_type, description, created_at
FROM audit_logs
WHERE org_id = $1
  AND visibility IN ('customer_only','both')
ORDER BY created_at DESC LIMIT 100;

-- Super 전용: 내부 감사
SELECT * FROM audit_logs
WHERE visibility = 'internal_only'
  AND created_at > now() - interval '7 days'
ORDER BY created_at DESC;

-- VCN 전체 번호 조회 이력 (민감 액션 감사)
SELECT * FROM audit_logs
WHERE action_type = 'view_full_card_number'
ORDER BY created_at DESC;
```

## 참조

- Immutable 원칙: `rules/immutable_ledger.md` (PB-005)
- 해지 시 처리: `playbook/termination.md` § 데이터 삭제 (v0.20)
- 원본: `02_시스템_아키텍처.md § 11` + `03_데이터_모델.md § 13 감사·내보내기`
