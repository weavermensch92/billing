# Billing / Schemas / virtual_cards — 테이블 본문

> VCN (Virtual Card Number). PB-002 상태 머신 구현. **전체 번호 저장 절대 금지**.

---

## DDL

```sql
CREATE TABLE virtual_cards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,

  -- 카드사 식별 (전체 번호 저장 X)
  issuer              TEXT NOT NULL CHECK (issuer IN ('shinhan','kb','wise','airwallex')),
  issuer_token        TEXT NOT NULL,             -- 카드사 내부 ID
  last4               TEXT NOT NULL,             -- 마지막 4자리
  expires_at          DATE NOT NULL,

  -- 한도 / 정책
  monthly_limit_krw   BIGINT NOT NULL,
  per_txn_limit_krw   BIGINT,
  allowed_mcc         TEXT[] DEFAULT ARRAY['5734','7372','5817']::text[],
  allow_overseas      BOOLEAN DEFAULT FALSE,

  -- Primary / Backup (PB-002-08)
  role                TEXT NOT NULL DEFAULT 'primary'
                      CHECK (role IN ('primary','backup')),

  -- 상태 (PB-002-01 상태 머신)
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','issuing','issued',
                                         'delivered','active','suspended','revoked','expired','failed')),

  -- 라이프사이클 타임스탬프
  approved_at         TIMESTAMPTZ,
  issued_at           TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,              -- 1Password 공유 시점
  activated_at        TIMESTAMPTZ,              -- 첫 결제 성공
  suspended_at        TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,

  -- 이슈 추적
  failure_reason      TEXT,
  retry_count         INT DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_virtual_cards_org_status ON virtual_cards(org_id, status);
CREATE INDEX idx_virtual_cards_account_role ON virtual_cards(account_id, role, status);
CREATE INDEX idx_virtual_cards_expiring ON virtual_cards(expires_at)
  WHERE status = 'active';
CREATE UNIQUE INDEX uniq_virtual_cards_issuer_token ON virtual_cards(issuer, issuer_token);
```

## 절대 금지 필드 (PB-002-10)

```
❌ card_number          -- 전체 번호
❌ cvv / cvc
❌ pin
❌ cardholder_name      -- 불필요
```

저장 가능한 것만 DDL 에 명시. 전체 번호는 카드사 API 임시 조회 + 1Password 공유 링크 경유.

## 상태 전이 트리거

```sql
CREATE OR REPLACE FUNCTION enforce_vc_state_transition() RETURNS TRIGGER AS $$
DECLARE
  old_state TEXT := OLD.status;
  new_state TEXT := NEW.status;
  valid BOOLEAN := FALSE;
BEGIN
  -- 허용된 전이만
  valid := CASE
    WHEN old_state = 'pending'     AND new_state IN ('approved','failed') THEN TRUE
    WHEN old_state = 'approved'    AND new_state IN ('issuing','failed') THEN TRUE
    WHEN old_state = 'issuing'     AND new_state IN ('issued','failed') THEN TRUE
    WHEN old_state = 'issued'      AND new_state IN ('delivered','revoked') THEN TRUE
    WHEN old_state = 'delivered'   AND new_state IN ('active','revoked') THEN TRUE
    WHEN old_state = 'active'      AND new_state IN ('suspended','expired') THEN TRUE
    WHEN old_state = 'suspended'   AND new_state IN ('active','revoked') THEN TRUE
    ELSE FALSE
  END;

  IF NOT valid THEN
    RAISE EXCEPTION 'Invalid VCN state transition: % → %', old_state, new_state;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vc_state_transition
  BEFORE UPDATE OF status ON virtual_cards
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION enforce_vc_state_transition();
```

## RLS — 매우 제한적

```sql
ALTER TABLE virtual_cards ENABLE ROW LEVEL SECURITY;

-- 본인 계정의 VCN last4 만 조회
CREATE POLICY "virtual_cards_self_meta"
  ON virtual_cards FOR SELECT
  USING (
    account_id IN (
      SELECT a.id FROM accounts a
      JOIN members m ON m.id = a.member_id
      WHERE m.auth_user_id = auth.uid()
    )
  );

-- 전체 번호 조회 = 카드사 API 호출 (Super + 감사 로그)
-- DB 자체에는 전체 번호 없음
```

## 주요 쿼리

```sql
-- 만료 임박 VCN (30일 이내)
SELECT vc.*, o.name AS org_name, m.name AS member_name, s.display_name AS service_name
FROM virtual_cards vc
JOIN orgs o ON o.id = vc.org_id
JOIN accounts a ON a.id = vc.account_id
JOIN members m ON m.id = a.member_id
JOIN services s ON s.id = a.service_id
WHERE vc.status = 'active'
  AND vc.expires_at <= now() + interval '30 days'
ORDER BY vc.expires_at;

-- Primary/Backup 페어
SELECT
  primary.issuer_token AS primary_token,
  backup.issuer_token AS backup_token
FROM virtual_cards primary
LEFT JOIN virtual_cards backup
  ON backup.account_id = primary.account_id
  AND backup.role = 'backup'
  AND backup.status = 'active'
WHERE primary.role = 'primary' AND primary.status = 'active';
```

## 참조

- VCN 규칙: `rules/vcn.md` (PB-002)
- 카드사 API: `playbook/card-issuer-ops.md` (v0.20)
- 1Password 볼트: `playbook/1password.md` (v0.20)
- 원본: `03_데이터_모델.md § 6-4 virtual_cards`
