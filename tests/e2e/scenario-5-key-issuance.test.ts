/**
 * 시나리오 5: 키 발급 임계 정책 (Q5 A+C)
 *
 * 정책:
 *   - 1시간 윈도우 내 3회 발급 가능
 *   - 4회째: hourly_limit 차단 + 24h 쿨다운 진입
 *   - 같은 페이지 즉시 재발행: 같은 흐름 1회 더 호출 (윈도우 카운트 +1)
 *
 * 검증:
 *   1) consumeQuota 3회 연속 성공 → allowed=true, remaining 감소
 *   2) 4회째 차단 → allowed=false, blockReason='hourly_limit'
 *   3) cooldownUntil = 현재 + 24h
 *   4) executor.issueKey 차단 시 KeyIssuanceBlockedError throw
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeTestSupabase, setupOrgFixture, teardownOrgFixture, type TestOrgFixture, type TestSupabase } from './helpers/fixtures'
import { consumeQuota, getQuotaStatus, setOrgPolicy } from '@/lib/billing/key-issuance/quota'
import { issueKey, KeyIssuanceBlockedError } from '@/lib/billing/key-issuance/executor'

let supabase: TestSupabase
let fixture: TestOrgFixture

beforeAll(async () => {
  supabase = makeTestSupabase()
  fixture = await setupOrgFixture(supabase)

  // 테스트용 정책: 1h/3회 + 24h 쿨다운
  if (process.env.USE_REAL_DB === 'true') {
    await setOrgPolicy(supabase as never, fixture.orgId, {
      issuancesPerHourLimit: 3,
      cooldownHours: 24,
    }, 'super-admin-test')
  }
})

afterAll(async () => {
  await teardownOrgFixture(supabase, fixture)
})

describe('Scenario 5: key issuance quota (Q5)', () => {
  it('consumeQuota 3회 연속 → 모두 allowed', async () => {
    if (process.env.USE_REAL_DB !== 'true') return

    for (let i = 0; i < 3; i++) {
      const result = await consumeQuota(supabase as never, fixture.orgId)
      expect(result.allowed).toBe(true)
      expect(result.blockReason).toBeNull()
      expect(result.remainingInWindow).toBe(3 - (i + 1))
    }
  })

  it('4회째 → hourly_limit 차단 + cooldown 진입', async () => {
    if (process.env.USE_REAL_DB !== 'true') return

    const result = await consumeQuota(supabase as never, fixture.orgId)
    expect(result.allowed).toBe(false)
    expect(result.blockReason).toMatch(/hourly_limit|cooldown/)
    expect(result.cooldownUntil).toBeTruthy()

    const cooldown = new Date(result.cooldownUntil!).getTime()
    const expected = Date.now() + 24 * 3600_000
    // 24h ± 1분 허용
    expect(Math.abs(cooldown - expected)).toBeLessThan(60_000)
  })

  it('쿨다운 진행 중 추가 시도 → cooldown 차단', async () => {
    if (process.env.USE_REAL_DB !== 'true') return

    const result = await consumeQuota(supabase as never, fixture.orgId)
    expect(result.allowed).toBe(false)
    expect(result.blockReason).toBe('cooldown')
  })

  it('issueKey 차단 시 KeyIssuanceBlockedError throw', async () => {
    if (process.env.USE_REAL_DB !== 'true') return

    // 이전 케이스에서 쿨다운 진입 상태
    try {
      await issueKey(supabase as never, {
        orgId: fixture.orgId,
        accountId: 'acc-test',
        vendor: 'anthropic',
        vendorWorkspaceId: 'ws-test',
        requestedByMemberId: fixture.unprivilegedMemberId,
        approvedByOrgAdminMemberId: fixture.adminMemberId,
      })
      expect.fail('should have thrown KeyIssuanceBlockedError')
    } catch (e) {
      expect(e).toBeInstanceOf(KeyIssuanceBlockedError)
      expect((e as KeyIssuanceBlockedError).reason).toMatch(/cooldown|hourly_limit/)
    }
  })

  it('quota status 조회 → total_blocked_count 증가', async () => {
    if (process.env.USE_REAL_DB !== 'true') return

    const status = await getQuotaStatus(supabase as never, fixture.orgId)
    expect(status).toBeTruthy()
    expect(status!.totalIssuedCount).toBe(3)
    expect(status!.totalBlockedCount).toBeGreaterThanOrEqual(1)
  })
})
