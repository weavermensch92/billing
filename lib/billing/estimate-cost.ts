import type { ActionType } from '@/types/billing.types'

/**
 * 요청 유형별 예상 월 비용 증가분 (KRW, 양수).
 * 비용 감소(해지) 또는 중립(VCN 교체)은 0 반환 — 여유분 소진 없음.
 *
 * @param currentLimit limit_change 시 기존 계정의 monthly_limit_krw
 */
export function estimateRequestCost(
  action_type: ActionType,
  request_data: Record<string, unknown>,
  currentLimit?: number,
): number {
  switch (action_type) {
    case 'new_account': {
      const n = Number(request_data.monthly_limit_krw ?? 0)
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
    }
    case 'limit_change': {
      const newLimit = Number(request_data.new_limit_krw ?? 0)
      const old = Number(currentLimit ?? 0)
      const delta = newLimit - old
      return Number.isFinite(delta) && delta > 0 ? Math.floor(delta) : 0
    }
    case 'terminate':
    case 'vcn_replace':
    case 'decline_response':
    case 'bulk_terminate':
    case 'headroom_increase':
      return 0
  }
}

export interface HeadroomInfo {
  headroom_krw: number
  used_krw: number
  remaining_krw: number
}

export function computeHeadroom(org: {
  self_approval_headroom_krw: number
  self_approval_used_krw: number
}): HeadroomInfo {
  const headroom = org.self_approval_headroom_krw
  const used = org.self_approval_used_krw
  return {
    headroom_krw: headroom,
    used_krw: used,
    remaining_krw: Math.max(0, headroom - used),
  }
}

export function canSelfApprove(
  role: 'owner' | 'admin' | 'member',
  headroom: HeadroomInfo,
  estimatedCost: number,
): boolean {
  if (role !== 'owner' && role !== 'admin') return false
  if (headroom.headroom_krw <= 0) return false
  if (estimatedCost <= 0) return true // 비용 0은 항상 허용 (의미상은 self-approve 대상이 아니지만 캡처용)
  return headroom.remaining_krw >= estimatedCost
}
