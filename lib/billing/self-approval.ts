/**
 * Self-Approval Headroom — 조직 여유분 차감/조회 헬퍼
 *
 * 실제 Supabase: `consume_self_approval(p_org_id, p_amount)` RPC로 원자 차감.
 * Mock: fixtures 배열 직접 UPDATE (single-request라 race 없음).
 *
 * 애플리케이션 레벨 read-then-write 패턴 — Phase 1+에서 RPC로 교체 권장.
 */

type SB = {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (k: string, v: unknown) => {
        single: () => Promise<{ data: unknown; error: unknown }>
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>
      }
    }
    update: (v: Record<string, unknown>) => {
      eq: (k: string, v: unknown) => Promise<{ error: unknown }>
    }
  }
}

interface OrgHeadroomRow {
  self_approval_headroom_krw: number
  self_approval_used_krw: number
}

export async function tryConsumeSelfApproval(
  supabase: SB,
  orgId: string,
  amount: number,
): Promise<{ ok: boolean; remaining_krw: number; headroom_krw: number; used_krw: number }> {
  const { data } = await supabase
    .from('orgs')
    .select('self_approval_headroom_krw, self_approval_used_krw')
    .eq('id', orgId)
    .single() as { data: OrgHeadroomRow | null; error: unknown }

  if (!data) {
    return { ok: false, remaining_krw: 0, headroom_krw: 0, used_krw: 0 }
  }

  const headroom = data.self_approval_headroom_krw ?? 0
  const used = data.self_approval_used_krw ?? 0
  const remaining = headroom - used

  if (amount < 0) return { ok: false, remaining_krw: remaining, headroom_krw: headroom, used_krw: used }
  if (amount > remaining) {
    return { ok: false, remaining_krw: remaining, headroom_krw: headroom, used_krw: used }
  }

  await supabase
    .from('orgs')
    .update({ self_approval_used_krw: used + amount })
    .eq('id', orgId)

  return {
    ok: true,
    remaining_krw: remaining - amount,
    headroom_krw: headroom,
    used_krw: used + amount,
  }
}

export async function readHeadroom(
  supabase: SB,
  orgId: string,
): Promise<{ headroom_krw: number; used_krw: number; remaining_krw: number }> {
  const { data } = await supabase
    .from('orgs')
    .select('self_approval_headroom_krw, self_approval_used_krw')
    .eq('id', orgId)
    .single() as { data: OrgHeadroomRow | null; error: unknown }

  const headroom = data?.self_approval_headroom_krw ?? 0
  const used = data?.self_approval_used_krw ?? 0
  return {
    headroom_krw: headroom,
    used_krw: used,
    remaining_krw: Math.max(0, headroom - used),
  }
}
