/**
 * Team Headroom — 팀 2단 헤드룸 (Q1-d + Q-V4 D)
 *
 * Org headroom (기존 self_approval_headroom_krw) 위에 팀별 분배 레이어.
 * 차감 순서: wallet 잔액 → 팀 headroom → Org headroom (잔액 부족 후 fallback)
 *
 * 참조:
 *   - consume_team_headroom (M-1007 RPC) 팀 우선 → Org fallback 원자
 *   - team_headroom 합계 ≤ Org 한도 트리거 검증 (M-1007 validate_team_headroom_sum)
 */

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface TeamHeadroomRow {
  team_id: string
  org_id: string
  headroom_limit_krw: number
  headroom_used_krw: number
  reset_at: string
}

export interface ConsumeTeamHeadroomResult {
  success: boolean
  consumed_from: 'team' | 'org' | 'both' | 'none'
  team_consumed_krw: number
  org_consumed_krw: number
}

/** 팀 헤드룸 한도 설정 (고객 어드민 액션). 합계 ≤ Org 한도 트리거 자동 검증. */
export async function setTeamHeadroomLimit(
  supabase: SBLike,
  teamId: string,
  orgId: string,
  limitKrw: number,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('team_headroom')
    .upsert(
      {
        team_id: teamId,
        org_id: orgId,
        headroom_limit_krw: limitKrw,
      },
      { onConflict: 'team_id' },
    )

  if (error) {
    // 트리거 EXCEPTION (합계 초과) 메시지를 그대로 노출
    const errMessage =
      typeof error === 'object' && error && 'message' in error
        ? String((error as { message: unknown }).message)
        : JSON.stringify(error)
    return { ok: false, error: errMessage }
  }
  return { ok: true }
}

/** 팀 우선 → Org fallback 차감 (잔액 부족 후 호출) */
export async function consumeTeamHeadroom(
  supabase: SBLike,
  teamId: string,
  amountKrw: number,
): Promise<ConsumeTeamHeadroomResult> {
  const { data, error } = await supabase.rpc('consume_team_headroom', {
    p_team_id: teamId,
    p_amount_krw: amountKrw,
  })

  if (error) {
    throw new Error(`consume_team_headroom failed: ${JSON.stringify(error)}`)
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    success: Boolean(row?.success),
    consumed_from: (row?.consumed_from ?? 'none') as 'team' | 'org' | 'both' | 'none',
    team_consumed_krw: Number(row?.team_consumed_krw ?? 0),
    org_consumed_krw: Number(row?.org_consumed_krw ?? 0),
  }
}

/** Org의 팀 헤드룸 분배 현황 */
export async function getTeamHeadroomBreakdown(
  supabase: SBLike,
  orgId: string,
): Promise<TeamHeadroomRow[]> {
  const { data } = (await supabase
    .from('team_headroom')
    .select('*')
    .eq('org_id', orgId)) as { data: TeamHeadroomRow[] | null }
  return data ?? []
}

/** 결제일 cron이 호출 (M-1007 reset_team_headroom_for_org) */
export async function resetTeamHeadroomForOrg(supabase: SBLike, orgId: string): Promise<number> {
  const { data, error } = await supabase.rpc('reset_team_headroom_for_org', { p_org_id: orgId })
  if (error) throw new Error(`reset_team_headroom_for_org failed: ${JSON.stringify(error)}`)
  return Number(data ?? 0)
}

/**
 * 잔액 → 헤드룸 순차 소진 진입점 (Q1-f).
 *
 * 차감 순서:
 *   1) consumeWalletKrw  (lib/billing/wallet.ts)
 *   2) consumeTeamHeadroom  (이 모듈)
 *   3) Org headroom은 consume_team_headroom 내부에서 fallback
 *
 * 즉 호출자는 (1) → (2) 순으로 시도. 둘 다 실패면 AM 정식 요청.
 */
export type SpendOutcome =
  | { stage: 'wallet'; consumed_krw: number }
  | { stage: 'headroom'; from: 'team' | 'org' | 'both'; team_krw: number; org_krw: number }
  | { stage: 'rejected'; reason: 'wallet_insufficient_and_headroom_insufficient' }

export async function trySpend(
  supabase: SBLike,
  params: { orgId: string; teamId: string; amountKrw: number; reason?: string },
): Promise<SpendOutcome> {
  // 1) wallet 시도
  const { consumeWalletKrw } = await import('./wallet')
  const wallet = await consumeWalletKrw(supabase, params.orgId, params.amountKrw, {
    reason: 'usage_consumption',
  })
  if (wallet.success) {
    return { stage: 'wallet', consumed_krw: wallet.consumed_krw }
  }

  // 2) headroom (팀 우선 → Org fallback)
  const hr = await consumeTeamHeadroom(supabase, params.teamId, params.amountKrw)
  if (hr.success) {
    return {
      stage: 'headroom',
      from: hr.consumed_from === 'none' ? 'org' : (hr.consumed_from as 'team' | 'org' | 'both'),
      team_krw: hr.team_consumed_krw,
      org_krw: hr.org_consumed_krw,
    }
  }

  return { stage: 'rejected', reason: 'wallet_insufficient_and_headroom_insufficient' }
}
