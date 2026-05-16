/**
 * Key Issuance Quota — Q5 임계 정책 호출자
 *
 * Q5 결정: 같은 페이지에서 즉시 재발행 OK + 1h/3회 임계 + 24h 쿨다운
 * 페이지 이탈 시 정식 재신청.
 *
 * 참조:
 *   - key_issuance_policies (M-1007 Org별 정책)
 *   - key_issuance_quota    (M-1007 런타임 윈도우)
 *   - consume_key_issuance_quota RPC (원자 + FOR UPDATE 락)
 */

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface QuotaCheckResult {
  allowed: boolean
  blockReason: 'cooldown' | 'hourly_limit' | null
  remainingInWindow: number
  cooldownUntil: string | null
}

export interface QuotaStatus {
  orgId: string
  currentWindowCount: number
  currentWindowStartAt: string
  cooldownUntil: string | null
  lastIssuedAt: string | null
  lastBlockedAt: string | null
  totalIssuedCount: number
  totalBlockedCount: number
}

export interface KeyIssuancePolicy {
  orgId: string
  issuancesPerHourLimit: number
  cooldownHours: number
  dailyMax: number | null
}

/**
 * 키 발급 임계 차감 (원자).
 * 실제 키 발급 직전에 호출. 차단 시 즉시 EXCEPTION 대신 결과 반환.
 *
 * - 통과 시 윈도우 카운트 +1 / 윈도우 만료 시 재시작
 * - 임계 도달 시 cooldown_until 자동 진입
 */
export async function consumeQuota(supabase: SBLike, orgId: string): Promise<QuotaCheckResult> {
  const { data, error } = await supabase.rpc('consume_key_issuance_quota', {
    p_org_id: orgId,
  })

  if (error) {
    throw new Error(`consume_key_issuance_quota failed: ${JSON.stringify(error)}`)
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    allowed: Boolean(row?.allowed),
    blockReason: (row?.block_reason ?? null) as 'cooldown' | 'hourly_limit' | null,
    remainingInWindow: Number(row?.remaining_in_window ?? 0),
    cooldownUntil: row?.cooldown_until ?? null,
  }
}

/** 현재 윈도우·쿨다운 상태 조회 (UI 표시용, 차감 X) */
export async function getQuotaStatus(supabase: SBLike, orgId: string): Promise<QuotaStatus | null> {
  const { data } = (await supabase
    .from('key_issuance_quota')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()) as {
    data:
      | {
          org_id: string
          current_window_count: number
          current_window_start_at: string
          cooldown_until: string | null
          last_issued_at: string | null
          last_blocked_at: string | null
          total_issued_count: number
          total_blocked_count: number
        }
      | null
  }

  if (!data) return null
  return {
    orgId: data.org_id,
    currentWindowCount: data.current_window_count,
    currentWindowStartAt: data.current_window_start_at,
    cooldownUntil: data.cooldown_until,
    lastIssuedAt: data.last_issued_at,
    lastBlockedAt: data.last_blocked_at,
    totalIssuedCount: data.total_issued_count,
    totalBlockedCount: data.total_blocked_count,
  }
}

export async function getOrgPolicy(supabase: SBLike, orgId: string): Promise<KeyIssuancePolicy | null> {
  const { data } = (await supabase
    .from('key_issuance_policies')
    .select('org_id, issuances_per_hour_limit, cooldown_hours, daily_max')
    .eq('org_id', orgId)
    .maybeSingle()) as {
    data: {
      org_id: string
      issuances_per_hour_limit: number
      cooldown_hours: number
      daily_max: number | null
    } | null
  }
  if (!data) return null
  return {
    orgId: data.org_id,
    issuancesPerHourLimit: data.issuances_per_hour_limit,
    cooldownHours: data.cooldown_hours,
    dailyMax: data.daily_max,
  }
}

/** 슈퍼어드민이 Org별 임계 변경 */
export async function setOrgPolicy(
  supabase: SBLike,
  orgId: string,
  policy: { issuancesPerHourLimit?: number; cooldownHours?: number; dailyMax?: number | null },
  byAdmin: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('key_issuance_policies')
    .upsert(
      {
        org_id: orgId,
        issuances_per_hour_limit: policy.issuancesPerHourLimit ?? 3,
        cooldown_hours: policy.cooldownHours ?? 24,
        daily_max: policy.dailyMax ?? null,
        created_by: byAdmin,
      },
      { onConflict: 'org_id' },
    )
  return !error
}
