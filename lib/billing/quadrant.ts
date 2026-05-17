/**
 * 4분면 분기 헬퍼 (PRD §14.4)
 *
 * accounts.kind × accounts.payer_type → Quadrant
 *
 *   Q1 = workspace_seat × gridge_card             (Workspace API + Gridge VCN, 현 v2.0 메인)
 *   Q2 = workspace_seat × member_card_reimbursable (Workspace API + 멤버 환급, 예외)
 *   Q3 = personal_subscription × gridge_card        (개인 구독 + Gridge VCN, 신규)
 *   Q4 = personal_subscription × member_card_reimbursable (개인 구독 + 멤버 환급)
 *
 * 4분면 분기는 가능한 한 상위 흐름 (Server Action 진입) 에서 처리.
 * 하위 모듈 (wallet, discount-policy 등) 은 분면 무관 공통 처리.
 */

export type AccountKind = 'workspace_seat' | 'personal_subscription'

export type PayerType = 'gridge_card' | 'member_card_reimbursable'

export type Quadrant = 'q1' | 'q2' | 'q3' | 'q4'

export interface QuadrantInput {
  kind: AccountKind
  payer_type: PayerType
}

export function getQuadrant(input: QuadrantInput): Quadrant {
  if (input.kind === 'workspace_seat' && input.payer_type === 'gridge_card') return 'q1'
  if (input.kind === 'workspace_seat' && input.payer_type === 'member_card_reimbursable') return 'q2'
  if (input.kind === 'personal_subscription' && input.payer_type === 'gridge_card') return 'q3'
  if (input.kind === 'personal_subscription' && input.payer_type === 'member_card_reimbursable') return 'q4'
  throw new Error(
    `invalid account quadrant: kind=${input.kind}, payer_type=${input.payer_type}`,
  )
}

/** 분면 라벨 (UI 표시용) */
export const QUADRANT_LABEL: Record<Quadrant, string> = {
  q1: 'Q1 · Workspace API × Gridge 카드',
  q2: 'Q2 · Workspace API × 멤버 환급',
  q3: 'Q3 · 개인 구독 × Gridge 카드',
  q4: 'Q4 · 개인 구독 × 멤버 환급',
}

/** A 차원 — 벤더 결제 채널 */
export function isWorkspaceChannel(kind: AccountKind): boolean {
  return kind === 'workspace_seat'
}

/** B 차원 — Gridge VCN 결제 여부 */
export function isGridgeCard(payer: PayerType): boolean {
  return payer === 'gridge_card'
}

/** B 차원 — 멤버 카드 환급 여부 */
export function isMemberReimbursable(payer: PayerType): boolean {
  return payer === 'member_card_reimbursable'
}
