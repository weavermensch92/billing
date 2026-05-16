/**
 * 시나리오 7: Org 해지 grace (13.2 B-i + c)
 *
 * 정책:
 *   - 해지 신청 → grace_until = 다음 billing_day_of_month
 *   - grace 기간 동안 신규 충전·사용 차단 X (그대로 운영)
 *   - grace_until ≤ today 도래 시 finalize_termination 자동 호출
 *
 * 검증:
 *   1) requestTermination → orgs.terminated_at_requested + grace_until 채움
 *   2) previewTermination 헬퍼: today=2026-05-15, billingDay=1 → grace=2026-06-01
 *   3) finalize_termination: grace 만료 후 자원 회수
 *   4) cancelTermination: grace 중에 해지 취소 가능
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeTestSupabase, setupOrgFixture, teardownOrgFixture, type TestOrgFixture, type TestSupabase } from './helpers/fixtures'
import {
  requestTermination,
  cancelTermination,
  previewTermination,
  dailyTerminationFinalize,
  getOrgsInGrace,
} from '@/lib/billing/termination'

let supabase: TestSupabase
let fixture: TestOrgFixture

beforeAll(async () => {
  supabase = makeTestSupabase()
  fixture = await setupOrgFixture(supabase)
})

afterAll(async () => {
  await teardownOrgFixture(supabase, fixture)
})

describe('Scenario 7: Org termination grace (B-i + c)', () => {
  it('previewTermination: 2026-05-15 + billingDay=1 → grace=2026-06-01', () => {
    const result = previewTermination({
      todayDate: new Date('2026-05-15T00:00:00Z'),
      billingDayOfMonth: 1,
    })
    expect(result.graceUntil.toISOString().slice(0, 10)).toBe('2026-06-01')
    expect(result.daysUntilFinalize).toBeGreaterThanOrEqual(15)
    expect(result.daysUntilFinalize).toBeLessThanOrEqual(18)
  })

  it('previewTermination: 결제일 == 오늘 → 다음 달 grace', () => {
    const result = previewTermination({
      todayDate: new Date('2026-05-01T00:00:00Z'),
      billingDayOfMonth: 1,
    })
    expect(result.graceUntil.toISOString().slice(0, 10)).toBe('2026-06-01')
  })

  it('previewTermination: 결제일 28일 + 2월 → 윤년 처리', () => {
    const result = previewTermination({
      todayDate: new Date('2024-02-15T00:00:00Z'),
      billingDayOfMonth: 28,
    })
    expect(result.graceUntil.toISOString().slice(0, 10)).toBe('2024-02-28')
  })

  it('requestTermination → orgs 컬럼 채움', async () => {
    if (process.env.USE_REAL_DB !== 'true') return

    const result = await requestTermination(supabase as never, {
      orgId: fixture.orgId,
      requestedBy: fixture.ownerMemberId,
      reason: 'e2e test',
    })
    expect(result.graceUntil).toBeTruthy()

    const { data } = await (supabase as any)
      .from('orgs')
      .select('terminated_at_requested, grace_until, termination_reason')
      .eq('id', fixture.orgId)
      .single()
    expect(data.terminated_at_requested).toBeTruthy()
    expect(data.grace_until).toBeTruthy()
    expect(data.termination_reason).toBe('e2e test')
  })

  it('getOrgsInGrace → 해지 신청한 Org 포함', async () => {
    if (process.env.USE_REAL_DB !== 'true') return

    const inGrace = await getOrgsInGrace(supabase as never)
    expect(inGrace.find((o) => o.orgId === fixture.orgId)).toBeTruthy()
  })

  it('cancelTermination → grace 중 해지 취소 가능', async () => {
    if (process.env.USE_REAL_DB !== 'true') return

    const result = await cancelTermination(supabase as never, {
      orgId: fixture.orgId,
      cancelledBy: fixture.ownerMemberId,
    })
    expect(result.ok).toBe(true)

    const { data } = await (supabase as any)
      .from('orgs')
      .select('terminated_at_requested, grace_until')
      .eq('id', fixture.orgId)
      .single()
    expect(data.terminated_at_requested).toBeNull()
    expect(data.grace_until).toBeNull()
  })

  it('dailyTerminationFinalize: grace 만료 Org만 finalize', async () => {
    if (process.env.USE_REAL_DB !== 'true') return

    // 재신청 후 grace_until 과거로 강제 (테스트용)
    await requestTermination(supabase as never, {
      orgId: fixture.orgId,
      requestedBy: fixture.ownerMemberId,
    })
    await (supabase as any)
      .from('orgs')
      .update({ grace_until: new Date(Date.now() - 86400_000).toISOString() })
      .eq('id', fixture.orgId)

    const finalized = await dailyTerminationFinalize(supabase as never)
    expect(finalized).toBeGreaterThanOrEqual(1)

    const { data } = await (supabase as any)
      .from('orgs')
      .select('terminated_at_finalized')
      .eq('id', fixture.orgId)
      .single()
    expect(data.terminated_at_finalized).toBeTruthy()
  })
})
