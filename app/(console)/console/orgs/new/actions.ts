'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function sanitize(s: string, max = 100): string {
  return s.trim().slice(0, max)
}

/**
 * v2.0 신규 Org 생성.
 *
 * v1 → v2 변경:
 *   - tier 단일화 → plan='prepaid_v2'
 *   - creditback_rate/months/start_at/end_at 제거 (v2에서 컬럼 자체 DROP)
 *   - 신규 v2 컬럼 추가:
 *       default_discount_rate
 *       billing_day_of_month
 *       wallet_default_validity_months
 *       (self_approval_headroom_krw 는 v1부터 존재, 유지)
 *
 * 부수 효과:
 *   - 미할당 팀 자동 생성 (M-1005 트리거)
 *   - 첫 active 계정 생성 시 6개월 할인 정책 자동 시작 (M-1002 트리거)
 */
export async function createOrg(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  // 보안: Super 권한 검증
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('email', user.email ?? '')
    .eq('is_active', true)
    .single()

  if (!adminUser) redirect('/console/login')
  if (adminUser.role !== 'super') {
    redirect('/console/orgs?error=' + encodeURIComponent(`Org 생성 권한 없음 — Super 전용 (현재 역할: ${adminUser.role})`))
  }

  // Input 정규화 (Step 1~2 기존 + Step 3 v2 신규 + Step 4 owner)
  const name = sanitize(formData.get('name') as string, 100)
  const business_reg_no = sanitize(formData.get('business_reg_no') as string, 20)

  const credit_limit_krw = Math.max(0, Math.min(10_000_000_000, Number(formData.get('credit_limit_krw')) || 0))
  const deposit_krw      = Math.max(0, Math.min(10_000_000_000, Number(formData.get('deposit_krw')) || 0))
  const monthly_fee_krw  = Math.max(0, Math.min(100_000_000,     Number(formData.get('monthly_fee_krw')) || 0))
  const contract_start_at = formData.get('contract_start_at') as string
  const contract_end_at   = formData.get('contract_end_at') as string

  // v2 정책 4개
  const default_discount_rate          = Math.max(0, Math.min(1,          Number(formData.get('default_discount_rate'))          || 0))
  const billing_day_of_month           = Math.max(1, Math.min(28,         Number(formData.get('billing_day_of_month'))           || 1))
  const wallet_default_validity_months = Math.max(1, Math.min(60,         Number(formData.get('wallet_default_validity_months')) || 12))
  const self_approval_headroom_krw     = Math.max(0, Math.min(1_000_000_000, Number(formData.get('self_approval_headroom_krw')) || 0))

  const owner_email = sanitize(formData.get('owner_email') as string, 320).toLowerCase()
  const owner_name  = sanitize(formData.get('owner_name') as string, 50)

  // 서버측 검증
  if (name.length < 2) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('조직명이 너무 짧습니다.'))
  }
  if (!/^\d{3}-\d{2}-\d{5}$/.test(business_reg_no)) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('사업자등록번호 형식이 올바르지 않습니다.'))
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner_email) || owner_name.length < 1) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('Owner 정보가 올바르지 않습니다.'))
  }

  // 중복 체크: 사업자번호
  const { data: brnDup } = await supabase
    .from('orgs').select('id').eq('business_reg_no', business_reg_no).maybeSingle()
  if (brnDup) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('이미 등록된 사업자등록번호입니다.'))
  }

  // 중복 체크: 이메일
  const { data: memberDup } = await supabase
    .from('members').select('id').eq('email', owner_email).maybeSingle()
  if (memberDup) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('이미 다른 조직에 등록된 이메일입니다.'))
  }

  const thisMonthStart = new Date()
  thisMonthStart.setDate(1)
  thisMonthStart.setHours(0, 0, 0, 0)

  // 1) orgs 생성 — v2 정책 컬럼 4개 포함
  const { data: org, error: orgErr } = await supabase.from('orgs').insert({
    name,
    business_reg_no,
    plan: 'prepaid_v2',          // v2 단일 모델
    infra_mode: 'A',
    billing_mode: 'D',
    status: 'pending',
    deposit_remaining_krw: deposit_krw,
    credit_limit_krw,

    // v2 정책 컬럼
    default_discount_rate,
    billing_day_of_month,
    wallet_default_validity_months,
    self_approval_headroom_krw,
    self_approval_used_krw: 0,
    self_approval_reset_at: thisMonthStart.toISOString(),

    aiops_org_id: null,
  }).select('id').single()

  if (orgErr || !org) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('조직 생성 실패: ' + (orgErr?.message ?? 'unknown')))
  }

  // 2) org_contracts 생성 — v2: 계약 조건만, creditback 컬럼 폐기됨
  const { error: contractErr } = await supabase.from('org_contracts').insert({
    org_id: org.id,
    monthly_fee_krw,
    credit_limit_krw,
    deposit_krw,
    contract_start_at,
    contract_end_at: contract_end_at || null,
    signed_at: new Date().toISOString(),
    am_user_id: adminUser.id,
  })

  if (contractErr) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('계약 생성 실패: ' + contractErr.message))
  }

  // 3) Owner 멤버 초대
  const { error: memberErr } = await supabase.from('members').insert({
    org_id: org.id,
    email: owner_email,
    name: owner_name,
    role: 'owner',
    status: 'invited',
    invited_at: new Date().toISOString(),
  })

  if (memberErr) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('Owner 초대 실패: ' + memberErr.message))
  }

  // 4) 감사 로그
  await supabase.from('audit_logs').insert({
    org_id: org.id,
    actor_type: 'admin',
    actor_id: adminUser.id,
    actor_email: user.email ?? null,
    action: 'org_created',
    target_type: 'org',
    target_id: org.id,
    visibility: 'both',
    detail: {
      name,
      plan: 'prepaid_v2',
      default_discount_rate,
      billing_day_of_month,
      wallet_default_validity_months,
      self_approval_headroom_krw,
      owner_email,
    },
  })

  await supabase.from('audit_logs').insert({
    org_id: org.id,
    actor_type: 'admin',
    actor_id: adminUser.id,
    actor_email: user.email ?? null,
    action: 'contract_signed',
    target_type: 'org_contract',
    target_id: null,
    visibility: 'internal_only',
    detail: {
      credit_limit_krw,
      deposit_krw,
      monthly_fee_krw,
      contract_start_at,
      contract_end_at,
      am_user_id: adminUser.id,
    },
  })

  revalidatePath('/console/orgs')
  redirect(`/console/orgs/${org.id}?created=1`)
}
