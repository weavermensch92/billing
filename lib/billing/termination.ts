/**
 * Termination — Org 해지 흐름 (13.2)
 *
 * B-i: 다음 결제일까지 grace
 * c: 그대로 운영 (신규 충전·사용 차단 X)
 * 환불은 별도 액션 (lib/billing/refund.ts)
 *
 * 참조:
 *   - request_termination (M-1011 RPC)
 *   - cancel_termination (M-1011 RPC)
 *   - finalize_termination (M-1011 RPC, cron 호출)
 *   - daily_termination_finalize (M-1011 RPC, pg_cron 매일)
 *   - v_orgs_in_grace 뷰
 */

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface OrgInGrace {
  org_id: string
  name: string
  termination_requested_at: string
  termination_grace_until: string
  termination_reason: string | null
  days_until_finalize: number
}

/**
 * 해지 신청.
 * grace_until = 다음 billing_day_of_month 자동 계산.
 * 신규 충전·사용 차단 X (c — 그대로 운영).
 */
export async function requestTermination(
  supabase: SBLike,
  params: {
    orgId: string
    requestedBy: string
    reason?: string
  },
): Promise<{ graceUntil: string }> {
  const { data, error } = await supabase.rpc('request_termination', {
    p_org_id: params.orgId,
    p_requested_by: params.requestedBy,
    p_reason: params.reason ?? null,
  })

  if (error) {
    const message =
      typeof error === 'object' && error && 'message' in error
        ? String((error as { message: unknown }).message)
        : JSON.stringify(error)
    throw new TerminationError(message, { orgId: params.orgId })
  }
  return { graceUntil: String(data) }
}

export class TerminationError extends Error {
  constructor(message: string, public context?: Record<string, unknown>) {
    super(message)
    this.name = 'TerminationError'
  }

  get isAlreadyTerminated(): boolean {
    return this.message.includes('already terminated')
  }

  get isAlreadyInGrace(): boolean {
    return this.message.includes('already in termination grace')
  }
}

/** 해지 신청 취소 (grace 기간 내) */
export async function cancelTermination(
  supabase: SBLike,
  params: { orgId: string; cancelledBy: string; note?: string },
): Promise<boolean> {
  const { data, error } = await supabase.rpc('cancel_termination', {
    p_org_id: params.orgId,
    p_cancelled_by: params.cancelledBy,
    p_note: params.note ?? null,
  })
  if (error) throw new TerminationError(JSON.stringify(error), { orgId: params.orgId })
  return Boolean(data)
}

/** 단일 Org 정리 (cron 또는 슈퍼어드민 강제) */
export async function finalizeTermination(supabase: SBLike, orgId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('finalize_termination', { p_org_id: orgId })
  if (error) throw new TerminationError(JSON.stringify(error), { orgId })
  return Boolean(data)
}

/** pg_cron 진입점 — grace 만료된 모든 Org 정리 */
export async function dailyTerminationFinalize(supabase: SBLike): Promise<number> {
  const { data, error } = await supabase.rpc('daily_termination_finalize')
  if (error) throw new TerminationError(JSON.stringify(error))
  return Number(data ?? 0)
}

/** grace 중인 Org 목록 (슈퍼어드민 콘솔) */
export async function getOrgsInGrace(supabase: SBLike): Promise<OrgInGrace[]> {
  const { data } = (await supabase
    .from('v_orgs_in_grace')
    .select('*')
    .order('termination_grace_until', { ascending: true })) as { data: OrgInGrace[] | null }
  return data ?? []
}

/**
 * 해지 신청 미리보기 — UI에서 "해지하면 어떻게 되는지" 표시용.
 * SQL 함수 호출 전 미리 계산.
 */
export function previewTermination(params: {
  todayDate: Date // 미리보기 기준일
  billingDayOfMonth: number // orgs.billing_day_of_month (1~28)
}): { graceUntil: Date; daysUntilFinalize: number } {
  const t = new Date(params.todayDate)
  t.setUTCHours(0, 0, 0, 0)
  const day = t.getUTCDate()
  const billingDay = params.billingDayOfMonth

  let graceUntil: Date
  if (day < billingDay) {
    // 이번 달 billing_day
    graceUntil = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), billingDay))
  } else {
    // 다음 달 billing_day
    graceUntil = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, billingDay))
  }

  const days = Math.ceil((graceUntil.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
  return { graceUntil, daysUntilFinalize: days }
}
