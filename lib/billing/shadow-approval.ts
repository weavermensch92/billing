/**
 * Shadow Approval — 24h 검수 모드 (13.6 / f3)
 *
 * 흐름:
 *   1) 1h sync (lib/vendor-api/member-sync.ts) 가 그림자 발견 시
 *      → register_shadow_member_pending RPC (M-1012)
 *      → accounts.status='pending_approval' + pending_approval_until = +24h
 *   2) 고객 어드민이 v_pending_approvals 보고 결정
 *      → approve(account_id, teamId?) → status='active'
 *      → reject(account_id, note?)    → status='rejected' (사용량 매핑 X)
 *   3) 24h 미응답 → daily_auto_approve_pending cron → 자동 active (관대 모드)
 *
 * 참조:
 *   - accounts.approval_status (M-1012)
 *   - approve_shadow_member RPC
 *   - daily_auto_approve_pending RPC
 *   - v_pending_approvals 뷰
 */

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface PendingApproval {
  accountId: string
  orgId: string
  vendor: string
  vendorUserId: string
  email: string | null
  createdAt: string
  pendingApprovalUntil: string
  hoursUntilAutoApprove: number
}

/** 검수 대기 목록 (고객 어드민 대시보드) */
export async function listPendingApprovals(supabase: SBLike, orgId: string): Promise<PendingApproval[]> {
  const { data } = (await supabase
    .from('v_pending_approvals')
    .select('*')
    .eq('org_id', orgId)
    .order('pending_approval_until', { ascending: true })) as {
    data: Array<{
      account_id: string
      org_id: string
      vendor: string
      vendor_user_id: string
      email: string | null
      created_at: string
      pending_approval_until: string
      hours_until_auto_approve: number
    }> | null
  }

  return (data ?? []).map((r) => ({
    accountId: r.account_id,
    orgId: r.org_id,
    vendor: r.vendor,
    vendorUserId: r.vendor_user_id,
    email: r.email,
    createdAt: r.created_at,
    pendingApprovalUntil: r.pending_approval_until,
    hoursUntilAutoApprove: r.hours_until_auto_approve,
  }))
}

/**
 * 승인 — accounts.status='active' + 팀 지정 (선택).
 * teamId 미제공이면 기존 매핑(미할당 팀) 유지.
 */
export async function approve(
  supabase: SBLike,
  params: { accountId: string; byMemberId: string; teamId?: string; note?: string },
): Promise<boolean> {
  // RPC 호출 (approval_status 전이)
  const { data, error } = await supabase.rpc('approve_shadow_member', {
    p_account_id: params.accountId,
    p_decision: 'approve',
    p_by_member_id: params.byMemberId,
    p_note: params.note ?? null,
  })
  if (error) throw new Error(`approve_shadow_member failed: ${JSON.stringify(error)}`)
  if (!data) return false

  // 팀 재지정 (선택)
  if (params.teamId) {
    // members 테이블에 team_id 갱신 (account ↔ member 1:1 가정)
    // 또는 별도 매핑 테이블이 있으면 거기서 처리.
    // 본 구현은 members.account_id 가정.
    await supabase.from('members').update({ team_id: params.teamId }).eq('account_id', params.accountId)
  }

  return true
}

/** 거부 — accounts.status='rejected'. 사용량 매핑 안 됨 (usage-allocator에서 skip) */
export async function reject(
  supabase: SBLike,
  params: { accountId: string; byMemberId: string; note?: string },
): Promise<boolean> {
  const { data, error } = await supabase.rpc('approve_shadow_member', {
    p_account_id: params.accountId,
    p_decision: 'reject',
    p_by_member_id: params.byMemberId,
    p_note: params.note ?? null,
  })
  if (error) throw new Error(`approve_shadow_member failed: ${JSON.stringify(error)}`)
  return Boolean(data)
}

/**
 * pg_cron 매일 진입점 — 24h 만료된 pending → 자동 active (관대 모드).
 * Phase 2에 엄격 모드 옵션 (자동 rejected) 검토.
 */
export async function dailyAutoApprovePending(supabase: SBLike): Promise<number> {
  const { data, error } = await supabase.rpc('daily_auto_approve_pending')
  if (error) throw new Error(`daily_auto_approve_pending failed: ${JSON.stringify(error)}`)
  return Number(data ?? 0)
}
