/**
 * Quadrant 헬퍼 단위 테스트 (M-2003)
 */

import { describe, it, expect } from 'vitest'
import {
  getQuadrant,
  QUADRANT_LABEL,
  isWorkspaceChannel,
  isGridgeCard,
  isMemberReimbursable,
} from '@/lib/billing/quadrant'

describe('getQuadrant', () => {
  it('Q1: workspace_seat × gridge_card', () => {
    expect(getQuadrant({ kind: 'workspace_seat', payer_type: 'gridge_card' })).toBe('q1')
  })

  it('Q2: workspace_seat × member_card_reimbursable', () => {
    expect(
      getQuadrant({ kind: 'workspace_seat', payer_type: 'member_card_reimbursable' }),
    ).toBe('q2')
  })

  it('Q3: personal_subscription × gridge_card', () => {
    expect(
      getQuadrant({ kind: 'personal_subscription', payer_type: 'gridge_card' }),
    ).toBe('q3')
  })

  it('Q4: personal_subscription × member_card_reimbursable', () => {
    expect(
      getQuadrant({
        kind: 'personal_subscription',
        payer_type: 'member_card_reimbursable',
      }),
    ).toBe('q4')
  })

  it('invalid 조합은 throw', () => {
    expect(() =>
      getQuadrant({
        // @ts-expect-error 의도적 잘못된 입력
        kind: 'invalid',
        payer_type: 'gridge_card',
      }),
    ).toThrow(/invalid account quadrant/)
  })

  it('라벨 4종 모두 존재', () => {
    expect(QUADRANT_LABEL.q1).toContain('Workspace API')
    expect(QUADRANT_LABEL.q2).toContain('멤버 환급')
    expect(QUADRANT_LABEL.q3).toContain('개인 구독')
    expect(QUADRANT_LABEL.q4).toContain('멤버 환급')
  })
})

describe('차원 판별', () => {
  it('isWorkspaceChannel', () => {
    expect(isWorkspaceChannel('workspace_seat')).toBe(true)
    expect(isWorkspaceChannel('personal_subscription')).toBe(false)
  })

  it('isGridgeCard / isMemberReimbursable 은 서로 배타적', () => {
    expect(isGridgeCard('gridge_card')).toBe(true)
    expect(isGridgeCard('member_card_reimbursable')).toBe(false)
    expect(isMemberReimbursable('member_card_reimbursable')).toBe(true)
    expect(isMemberReimbursable('gridge_card')).toBe(false)
  })
})
