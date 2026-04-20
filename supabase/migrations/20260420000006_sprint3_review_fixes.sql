-- ============================================================
-- Sprint 3 검토 — RLS 강화 + 자동 감사 트리거
-- ============================================================

-- ─── 1. v_transaction_customer 뷰 security_invoker 재정의 ─────
-- PG 15+ 에서 기본 SECURITY DEFINER → RLS 우회 위험
DROP VIEW IF EXISTS billing.v_transaction_customer;

CREATE VIEW billing.v_transaction_customer
  WITH (security_invoker = true) AS
SELECT
  id, org_id, account_id, virtual_card_id, service_id,
  customer_charge_krw AS amount_krw,
  status, currency, merchant_name, billing_month,
  transacted_at, settled_at, created_at
FROM billing.transactions;

GRANT SELECT ON billing.v_transaction_customer TO anon, authenticated;

-- ─── 2. audit_logs 자동 기록 트리거 ──────────────────────────

-- 2.1 헬퍼: 현재 actor 식별
CREATE OR REPLACE FUNCTION billing.current_actor()
RETURNS TABLE(actor_type TEXT, actor_id UUID, actor_email TEXT) AS $$
BEGIN
  -- admin_users 우선
  RETURN QUERY
    SELECT 'admin'::TEXT, a.id, a.email
    FROM billing.admin_users a
    WHERE a.user_id = auth.uid() AND a.is_active = TRUE
    LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- members
  RETURN QUERY
    SELECT 'member'::TEXT, m.id, m.email
    FROM billing.members m
    WHERE m.user_id = auth.uid() AND m.status = 'active'
    LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- 시스템 (트리거에서 auth.uid가 NULL)
  RETURN QUERY SELECT 'system'::TEXT, NULL::UUID, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2.2 members 변경 감사
CREATE OR REPLACE FUNCTION billing.audit_members()
RETURNS TRIGGER AS $$
DECLARE
  v_actor RECORD;
  v_action TEXT;
  v_detail JSONB;
BEGIN
  SELECT * INTO v_actor FROM billing.current_actor();

  IF TG_OP = 'INSERT' THEN
    v_action := 'member_' || NEW.status;
    v_detail := jsonb_build_object('email', NEW.email, 'role', NEW.role, 'status', NEW.status);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      v_action := 'member_role_changed';
      v_detail := jsonb_build_object('from', OLD.role, 'to', NEW.role, 'email', NEW.email);
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'member_status_' || NEW.status;
      v_detail := jsonb_build_object('from', OLD.status, 'to', NEW.status, 'email', NEW.email);
    ELSE
      RETURN NEW;  -- 감사 대상 아닌 변경
    END IF;
  END IF;

  INSERT INTO billing.audit_logs (
    org_id, actor_type, actor_id, actor_email,
    action, target_type, target_id, visibility, detail
  ) VALUES (
    NEW.org_id, v_actor.actor_type, v_actor.actor_id, v_actor.actor_email,
    v_action, 'member', NEW.id, 'both', v_detail
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_members
  AFTER INSERT OR UPDATE ON billing.members
  FOR EACH ROW EXECUTE FUNCTION billing.audit_members();

-- 2.3 accounts 상태 변경 감사
CREATE OR REPLACE FUNCTION billing.audit_accounts()
RETURNS TRIGGER AS $$
DECLARE
  v_actor RECORD;
BEGIN
  SELECT * INTO v_actor FROM billing.current_actor();

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO billing.audit_logs (
      org_id, actor_type, actor_id, actor_email,
      action, target_type, target_id, visibility, detail
    ) VALUES (
      NEW.org_id, v_actor.actor_type, v_actor.actor_id, v_actor.actor_email,
      'account_status_' || NEW.status,
      'account', NEW.id, 'both',
      jsonb_build_object('from', OLD.status, 'to', NEW.status)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_accounts
  AFTER UPDATE ON billing.accounts
  FOR EACH ROW EXECUTE FUNCTION billing.audit_accounts();

-- 2.4 virtual_cards 상태 변경 감사 (customer 가시성 = both, 금액은 internal_only)
CREATE OR REPLACE FUNCTION billing.audit_vcn()
RETURNS TRIGGER AS $$
DECLARE
  v_actor RECORD;
BEGIN
  SELECT * INTO v_actor FROM billing.current_actor();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO billing.audit_logs (
      org_id, actor_type, actor_id, actor_email,
      action, target_type, target_id, visibility, detail
    ) VALUES (
      NEW.org_id, v_actor.actor_type, v_actor.actor_id, v_actor.actor_email,
      'vcn_created', 'virtual_card', NEW.id, 'both',
      jsonb_build_object('card_type', NEW.card_type, 'issuer', NEW.card_issuer)
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO billing.audit_logs (
      org_id, actor_type, actor_id, actor_email,
      action, target_type, target_id, visibility, detail
    ) VALUES (
      NEW.org_id, v_actor.actor_type, v_actor.actor_id, v_actor.actor_email,
      'vcn_status_' || NEW.status,
      'virtual_card', NEW.id, 'both',
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'card_last4', NEW.card_last4)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_vcn
  AFTER INSERT OR UPDATE ON billing.virtual_cards
  FOR EACH ROW EXECUTE FUNCTION billing.audit_vcn();

-- 2.5 invoices 발행/납부 감사
CREATE OR REPLACE FUNCTION billing.audit_invoices()
RETURNS TRIGGER AS $$
DECLARE
  v_actor RECORD;
BEGIN
  SELECT * INTO v_actor FROM billing.current_actor();

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO billing.audit_logs (
      org_id, actor_type, actor_id, actor_email,
      action, target_type, target_id, visibility, detail
    ) VALUES (
      NEW.org_id, v_actor.actor_type, v_actor.actor_id, v_actor.actor_email,
      'invoice_' || NEW.status,
      'invoice', NEW.id, 'both',
      jsonb_build_object('from', OLD.status, 'to', NEW.status,
                          'total_due_krw', NEW.total_due_krw,
                          'billing_month', NEW.billing_month)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_invoices
  AFTER UPDATE ON billing.invoices
  FOR EACH ROW EXECUTE FUNCTION billing.audit_invoices();
