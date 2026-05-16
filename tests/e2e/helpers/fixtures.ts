/**
 * Fixtures — 테스트 픽스처 생성 헬퍼
 *
 * Mock 모드: 메모리 mock supabase (RPC·트리거 미지원 — 단위 검증 한정)
 * 실 DB 모드: 실제 Supabase + 마이그레이션 16개 적용된 인스턴스
 */

import { createClient } from '@supabase/supabase-js'
import { createMockSupabase } from '@/lib/mock/client'

export type TestSupabase = ReturnType<typeof createClient>

export function makeTestSupabase(): TestSupabase {
  const useReal = process.env.USE_REAL_DB === 'true'
  if (!useReal) {
    return createMockSupabase(null) as unknown as TestSupabase
  }
  const url = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('USE_REAL_DB=true 인데 SUPABASE_TEST_URL/KEY 누락')
  }
  return createClient(url, key, {
    db: { schema: 'billing' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function uniq(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9999)}`
}

export interface TestOrgFixture {
  orgId: string
  ownerMemberId: string
  adminMemberId: string
  unprivilegedMemberId: string
  teamUnassignedId: string
  teamEngineeringId: string
  defaultBillingDayOfMonth: number
}

/**
 * 표준 픽스처: Org 1개 + member 3명 (owner/admin/member) + team 2개 (미할당 + engineering)
 * 실 DB 사용 시 INSERT, mock 시 결정적 id 반환.
 */
export async function setupOrgFixture(
  supabase: TestSupabase,
  options?: {
    orgName?: string
    defaultDiscountRate?: number
    selfApprovalHeadroomKrw?: number
    walletDefaultValidityMonths?: number
  },
): Promise<TestOrgFixture> {
  const orgName = options?.orgName ?? uniq('test-org')
  const fixture: TestOrgFixture = {
    orgId: uniq('org'),
    ownerMemberId: uniq('m-owner'),
    adminMemberId: uniq('m-admin'),
    unprivilegedMemberId: uniq('m-user'),
    teamUnassignedId: uniq('t-unassigned'),
    teamEngineeringId: uniq('t-eng'),
    defaultBillingDayOfMonth: 1,
  }

  if (process.env.USE_REAL_DB !== 'true') {
    // Mock 모드: id 만 반환
    return fixture
  }

  // 실 DB INSERT
  await (supabase as any).from('orgs').insert({
    id: fixture.orgId,
    name: orgName,
    default_discount_rate: options?.defaultDiscountRate ?? 0.1,
    self_approval_headroom_krw: options?.selfApprovalHeadroomKrw ?? 5_000_000,
    wallet_default_validity_months: options?.walletDefaultValidityMonths ?? 12,
    billing_day_of_month: fixture.defaultBillingDayOfMonth,
  })

  await (supabase as any).from('members').insert([
    { id: fixture.ownerMemberId,         org_id: fixture.orgId, role: 'owner', status: 'active', name: 'Owner User',  email: 'owner@test.com' },
    { id: fixture.adminMemberId,         org_id: fixture.orgId, role: 'admin', status: 'active', name: 'Admin User',  email: 'admin@test.com' },
    { id: fixture.unprivilegedMemberId,  org_id: fixture.orgId, role: 'user',  status: 'active', name: 'Normal User', email: 'user@test.com'  },
  ])

  await (supabase as any).from('teams').insert([
    { id: fixture.teamUnassignedId,  org_id: fixture.orgId, name: '미할당',     is_unassigned: true },
    { id: fixture.teamEngineeringId, org_id: fixture.orgId, name: 'Engineering', is_unassigned: false },
  ])

  return fixture
}

export async function teardownOrgFixture(supabase: TestSupabase, fixture: TestOrgFixture) {
  if (process.env.USE_REAL_DB !== 'true') return
  // CASCADE 의존하여 orgs 만 삭제
  await (supabase as any).from('orgs').delete().eq('id', fixture.orgId)
}
