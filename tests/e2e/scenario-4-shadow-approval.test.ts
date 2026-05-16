/**
 * 시나리오 4: 그림자 멤버 24h 검수 (f3 관대 모드)
 *
 * 셋업:
 *   - Mock vendor adapter가 결정적 멤버 목록 반환
 *   - 그릿지 DB에 일부 등록 (Alice), 나머지(Shadow)는 미등록
 *
 * 흐름:
 *   1) syncTokenMembers → shadow_member_findings UPSERT + register_shadow_member_pending
 *   2) accounts.approval_status='pending_approval', pending_approval_until = +24h
 *   3) approve / reject 결정 → status 전이
 *   4) 24h 만료 → daily_auto_approve_pending → 자동 active (관대 모드)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeTestSupabase, setupOrgFixture, teardownOrgFixture, type TestOrgFixture, type TestSupabase } from './helpers/fixtures'
import { listPendingApprovals, approve, reject, dailyAutoApprovePending } from '@/lib/billing/shadow-approval'

let supabase: TestSupabase
let fixture: TestOrgFixture

beforeAll(async () => {
  supabase = makeTestSupabase()
  fixture = await setupOrgFixture(supabase)
})

afterAll(async () => {
  await teardownOrgFixture(supabase, fixture)
})

describe('Scenario 4: shadow member 24h approval (f3)', () => {
  it('mock vendor → listWorkspaceMembers 호출 가능', async () => {
    const { getVendorAdapter } = await import('@/lib/vendor-api')
    const adapter = getVendorAdapter('anthropic')
    expect(adapter).toBeTruthy()
    expect(typeof adapter!.listWorkspaceMembers).toBe('function')

    const result = await adapter!.listWorkspaceMembers!({
      vendorWorkspaceId: 'ws-test',
      adminToken: 'sk-ant-mock-token',
    })
    expect(result.ok).toBe(true)
    expect(result.members.length).toBeGreaterThanOrEqual(2)
    expect(result.members[0].vendorUserId).toBeTruthy()
  })

  it('listPendingApprovals → v_pending_approvals 뷰 호출', async () => {
    if (process.env.USE_REAL_DB !== 'true') return
    const pending = await listPendingApprovals(supabase as never, fixture.orgId)
    expect(Array.isArray(pending)).toBe(true)
    // sync 미실행 상태에서는 0건
  })

  it('approve 결정 → accounts.approval_status=active', async () => {
    if (process.env.USE_REAL_DB !== 'true') return

    // 사전: pending account 1건 직접 INSERT
    const accountId = `acc-${Date.now()}`
    await (supabase as any).from('accounts').insert({
      id: accountId,
      org_id: fixture.orgId,
      member_id: fixture.adminMemberId,
      provider: 'anthropic',
      provider_user_id: 'usr-shadow-test',
      status: 'active',
      approval_status: 'pending_approval',
      pending_approval_until: new Date(Date.now() + 23 * 3600_000).toISOString(),
    })

    const ok = await approve(supabase as never, {
      accountId,
      byMemberId: fixture.adminMemberId,
      teamId: fixture.teamEngineeringId,
      note: 'e2e approve',
    })
    expect(ok).toBe(true)

    const { data } = await (supabase as any)
      .from('accounts')
      .select('approval_status')
      .eq('id', accountId)
      .single()
    expect(data.approval_status).toBe('active')
  })

  it('reject 결정 → accounts.approval_status=rejected', async () => {
    if (process.env.USE_REAL_DB !== 'true') return

    const accountId = `acc-${Date.now()}-rej`
    await (supabase as any).from('accounts').insert({
      id: accountId,
      org_id: fixture.orgId,
      member_id: fixture.adminMemberId,
      provider: 'anthropic',
      provider_user_id: 'usr-shadow-reject',
      status: 'active',
      approval_status: 'pending_approval',
      pending_approval_until: new Date(Date.now() + 23 * 3600_000).toISOString(),
    })

    const ok = await reject(supabase as never, {
      accountId,
      byMemberId: fixture.adminMemberId,
      note: 'e2e reject — external contractor',
    })
    expect(ok).toBe(true)

    const { data } = await (supabase as any)
      .from('accounts')
      .select('approval_status')
      .eq('id', accountId)
      .single()
    expect(data.approval_status).toBe('rejected')
  })

  it('24h 만료 + dailyAutoApprovePending → 관대 모드 자동 active', async () => {
    if (process.env.USE_REAL_DB !== 'true') return

    // 사전: pending_approval_until 과거 시각으로 INSERT
    const accountId = `acc-${Date.now()}-stale`
    await (supabase as any).from('accounts').insert({
      id: accountId,
      org_id: fixture.orgId,
      member_id: fixture.adminMemberId,
      provider: 'openai',
      provider_user_id: 'usr-stale',
      status: 'active',
      approval_status: 'pending_approval',
      pending_approval_until: new Date(Date.now() - 3600_000).toISOString(), // 1시간 전 만료
    })

    const count = await dailyAutoApprovePending(supabase as never)
    expect(count).toBeGreaterThanOrEqual(1)

    const { data } = await (supabase as any)
      .from('accounts')
      .select('approval_status')
      .eq('id', accountId)
      .single()
    expect(data.approval_status).toBe('active')
  })
})
