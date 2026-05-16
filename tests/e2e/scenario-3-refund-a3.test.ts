/**
 * 시나리오 3: 환불 A3 정책 (할인 회수 + 차액 환불)
 *
 * 셋업:
 *   - Wallet: 10,000,000 gross + 10% 할인 = 9,000,000 net 충전
 *   - 사용액 3,000,000
 *
 * A3 계산:
 *   net_remaining = 9,000,000 - 3,000,000 = 6,000,000
 *   gross_remaining = net_remaining / (1 - 0.1) = 6,666,666
 *   refund_krw = gross_remaining (할인 회수, 차액 환불)
 *
 * 추가:
 *   - refundable=false (지원금) wallet은 RefundError isNonRefundable=true 로 거부
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeTestSupabase, setupOrgFixture, teardownOrgFixture, type TestOrgFixture, type TestSupabase } from './helpers/fixtures'
import { createPendingCharge, confirmChargeDirect, consumeWalletKrw } from '@/lib/billing/wallet'
import { processRefundA3, previewRefundA3, RefundError } from '@/lib/billing/refund'

let supabase: TestSupabase
let fixture: TestOrgFixture

beforeAll(async () => {
  supabase = makeTestSupabase()
  fixture = await setupOrgFixture(supabase)
})

afterAll(async () => {
  await teardownOrgFixture(supabase, fixture)
})

describe('Scenario 3: refund A3 policy', () => {
  let chargeId: string

  it('충전 + 일부 사용 후 환불 가능 금액 계산', async () => {
    const charge = await createPendingCharge(supabase as never, {
      orgId: fixture.orgId,
      grossKrw: 10_000_000,
      discountRate: 0.1,
      refundable: true,
    })
    expect(charge).toBeTruthy()
    chargeId = charge!.id

    if (process.env.USE_REAL_DB !== 'true') return

    await confirmChargeDirect(supabase as never, chargeId, 'super-admin-test')

    await consumeWalletKrw(supabase as never, {
      orgId: fixture.orgId,
      amountKrw: 3_000_000,
      reason: 'pre-refund-usage',
    })

    const preview = await previewRefundA3(supabase as never, chargeId)
    expect(preview.netRemaining).toBe(6_000_000)
    expect(preview.grossRemaining).toBe(Math.round(6_000_000 / 0.9))   // ≈ 6,666,667
    expect(preview.refundKrw).toBe(preview.grossRemaining)
  })

  it('processRefundA3 → payments_outbound INSERT + wallet status=refunded', async () => {
    if (process.env.USE_REAL_DB !== 'true') return

    const result = await processRefundA3(supabase as never, {
      walletChargeId: chargeId,
      requestedBy: fixture.ownerMemberId,
      approvedBy: 'super-admin-test',
      note: 'e2e test refund',
    })

    expect(result.outboundId).toBeTruthy()
    expect(result.refundKrw).toBe(Math.round(6_000_000 / 0.9))

    const { data: walletAfter } = await (supabase as any)
      .from('wallet_charges')
      .select('status')
      .eq('id', chargeId)
      .single()
    expect(walletAfter.status).toBe('refunded')
  })

  it('refundable=false (지원금) → RefundError isNonRefundable=true', async () => {
    const supportCharge = await createPendingCharge(supabase as never, {
      orgId: fixture.orgId,
      grossKrw: 1_000_000,
      discountRate: 0,
      refundable: false,   // 체험 크레딧/지원금
    })

    if (process.env.USE_REAL_DB !== 'true') return

    await confirmChargeDirect(supabase as never, supportCharge!.id, 'super-admin-test')

    try {
      await processRefundA3(supabase as never, {
        walletChargeId: supportCharge!.id,
        requestedBy: fixture.ownerMemberId,
        approvedBy: 'super-admin-test',
      })
      expect.fail('should have thrown RefundError')
    } catch (e) {
      expect(e).toBeInstanceOf(RefundError)
      expect((e as RefundError).isNonRefundable).toBe(true)
    }
  })
})
