-- ============================================================
-- Fix: Super 관리자 RLS 누락 (members, audit_logs)
--
-- 증상: 운영 콘솔에서 신규 Org 생성 시 wizard step 3 (Owner 멤버 초대)
--      에서 RLS 위반:
--        new row violates row-level security policy for table "members"
--
-- 원인: 20260420000002_billing_rls.sql 에서 orgs / org_contracts /
--      services / admin_users 에는 "super can manage *" 정책을
--      깔았으나, members / audit_logs 에는 누락.
--
--      members 의 유일한 manage 정책 "owner admin can manage members"
--      는 super 가 어떤 org 의 멤버도 아니므로 매치 실패.
--
-- 영향:
--   - members INSERT (Owner 초대) — super 차단
--   - audit_logs INSERT (org_created / contract_signed 기록) — super 차단
--     (현재는 members 단계에서 redirect 되어 미도달이나, members 만
--      고치면 다음 호출에서 표면화됨)
--
-- 정책 추가는 모두 idempotent (DROP IF EXISTS → CREATE)
-- ============================================================

-- ─── 1. members: super 가 모든 조직의 멤버 관리 ─────────────
DROP POLICY IF EXISTS "super can manage members" ON billing.members;
CREATE POLICY "super can manage members"
  ON billing.members FOR ALL
  USING (billing.admin_role() = 'super')
  WITH CHECK (billing.admin_role() = 'super');


-- ─── 2. audit_logs: super 가 감사 로그 INSERT 가능 ──────────
-- 주의: audit_logs 는 immutable 원칙(PB-005). UPDATE/DELETE 정책은
--      추가하지 않고 INSERT 만 허용. SELECT 는 기존
--      "admin can read internal audit logs" 가 super 포함 처리.
DROP POLICY IF EXISTS "super can insert audit_logs" ON billing.audit_logs;
CREATE POLICY "super can insert audit_logs"
  ON billing.audit_logs FOR INSERT
  WITH CHECK (billing.admin_role() = 'super');
