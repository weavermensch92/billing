/**
 * Discount Policy — Org별 할인율 + 6개월 검토 알림 (Q-V1)
 *
 * Q-V1 핵심: 자동 만료 X. 슈퍼어드민이 명시적으로 변경할 때까지 유지.
 * Q-V2: 첫 account active 전이 시 정책 자동 시작 (M-1002 트리거).
 * Q-V3: 0% 정책 row는 만들되 v_org_visible_discount로 고객 노출 분리.
 *
 * 참조:
 *   - v_org_active_discount  (내부, 0% 포함)
 *   - v_org_visible_discount (고객, rate>0)
 *   - renew_discount_policy(org, rate, months, super_id, reason) RPC
 */

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface DiscountPolicy {
  org_id: string
  policy_id: string
  discount_rate: number
  period_start_at: string
  period_end_at: string
  days_until_review: number
  is_renewal: boolean
  parent_policy_id: string | null
}

/** 내부용: 모든 활성 정책 (0% 포함). 슈퍼어드민 콘솔용. */
export async function getActiveDiscount(supabase: SBLike, orgId: string): Promise<DiscountPolicy | null> {
  const { data } = (await supabase
    .from('v_org_active_discount')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()) as { data: DiscountPolicy | null }
  return data
}

/** 고객 노출용: rate>0인 정책만. 0% Org는 null. */
export async function getVisibleDiscount(supabase: SBLike, orgId: string): Promise<DiscountPolicy | null> {
  const { data } = (await supabase
    .from('v_org_visible_discount')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()) as { data: DiscountPolicy | null }
  return data
}

/** 슈퍼어드민 갱신 — 기존 ended_early + 새 정책 INSERT + parent_policy_id 연결 */
export async function renewDiscountPolicy(
  supabase: SBLike,
  params: {
    orgId: string
    newRate: number
    periodMonths?: number
    superAdminId: string
    reason?: string
  },
): Promise<{ newPolicyId: string }> {
  const { data, error } = await supabase.rpc('renew_discount_policy', {
    p_org_id: params.orgId,
    p_new_rate: params.newRate,
    p_new_months: params.periodMonths ?? 6,
    p_super_id: params.superAdminId,
    p_reason: params.reason ?? 'period_renewal',
  })

  if (error) {
    throw new Error(`renew_discount_policy failed: ${JSON.stringify(error)}`)
  }
  return { newPolicyId: String(data) }
}

/** 검토 알림 트리거 — D-30/D-7/D-0 임박 Org 조회 */
export async function getOrgsApproachingReview(
  supabase: SBLike,
  daysUntilReview: number[] = [30, 7, 0],
): Promise<DiscountPolicy[]> {
  const { data } = (await supabase
    .from('v_org_active_discount')
    .select('*')
    .in('days_until_review', daysUntilReview)) as { data: DiscountPolicy[] | null }
  return data ?? []
}

/**
 * 고객 페이지에서 할인 섹션을 표시할지 결정 (Q-V3).
 * 무할인 Org는 섹션 자체를 숨김.
 */
export async function shouldDisplayDiscountSection(supabase: SBLike, orgId: string): Promise<boolean> {
  const visible = await getVisibleDiscount(supabase, orgId)
  return visible !== null
}
