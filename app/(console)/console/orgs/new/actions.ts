'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function sanitize(s: string, max = 100): string {
  return s.trim().slice(0, max)
}

export async function createOrg(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  // 보안: Super 권한 검증 (G-049 특수 행위 — 고객사 생성)
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('email', user.email ?? '')
    .eq('is_active', true)
    .single()

  if (!adminUser) redirect('/console/login')
  if (adminUser.role !== 'super') {
    redirect('/console/orgs?error=' + encodeURIComponent('Super 권한이 필요합니다.'))
  }

  // Input 정규화
  const name = sanitize(formData.get('name') as string, 100)
  const business_reg_no = sanitize(formData.get('business_reg_no') as string, 20)
  const tier = formData.get('tier') as 'monthly' | 'weekly' | 'prepaid_monthly'
  const credit_limit_krw = Math.max(0, Math.min(10_000_000_000, Number(formData.get('credit_limit_krw')) || 0))
  const deposit_krw = Math.max(0, Math.min(10_000_000_000, Number(formData.get('deposit_krw')) || 0))
  const creditback_start_at = formData.get('creditback_start_at') as string
  const contract_start_at = formData.get('contract_start_at') as string
  const contract_end_at = formData.get('contract_end_at') as string
  const owner_email = sanitize(formData.get('owner_email') as string, 320).toLowerCase()
  const owner_name = sanitize(formData.get('owner_name') as string, 50)

  // 서버측 검증
  if (name.length < 2) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('조직명이 너무 짧습니다.'))
  }
  if (!/^\d{3}-\d{2}-\d{5}$/.test(business_reg_no)) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('사업자등록번호 형식이 올바르지 않습니다.'))
  }
  if (!['monthly', 'weekly', 'prepaid_monthly'].includes(tier)) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('잘못된 결제 티어입니다.'))
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner_email) || owner_name.length < 1) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('Owner 정보가 올바르지 않습니다.'))
  }
  if (tier === 'prepaid_monthly' && deposit_krw <= 0) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('선불 예치금 티어는 예치금이 필요합니다.'))
  }

  // 중복 체크: 사업자번호
  const { data: brnDup } = await supabase
    .from('orgs').select('id').eq('business_reg_no', business_reg_no).maybeSingle()
  if (brnDup) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('이미 등록된 사업자등록번호입니다.'))
  }

  // 중복 체크: 이메일 (admin + 다른 조직 member 포함)
  const { data: memberDup } = await supabase
    .from('members').select('id').eq('email', owner_email).maybeSingle()
  if (memberDup) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('이미 다른 조직에 등록된 이메일입니다.'))
  }

  // 크레딧백 종료일 자동 계산 (+6개월)
  const cbStart = new Date(creditback_start_at)
  const cbEnd = new Date(cbStart)
  cbEnd.setMonth(cbEnd.getMonth() + 6)
  const creditback_end_at = cbEnd.toISOString().slice(0, 10)

  // 1) orgs 생성
  const { data: org, error: orgErr } = await supabase.from('orgs').insert({
    name,
    business_reg_no,
    plan: tier,
    infra_mode: 'A',
    billing_mode: 'D',
    status: 'pending',   // Owner 가입 완료 후 active로 전환
    creditback_start_at,
    creditback_end_at,
    deposit_remaining_krw: deposit_krw,
    credit_limit_krw,
    aiops_org_id: null,
  }).select('id').single()

  if (orgErr || !org) {
    redirect('/console/orgs/new?error=' + encodeURIComponent('조직 생성 실패: ' + (orgErr?.message ?? 'unknown')))
  }

  // 2) org_contracts 생성
  const { error: contractErr } = await supabase.from('org_contracts').insert({
    org_id: org.id,
    tier,
    creditback_rate: 0.10,
    creditback_months: 6,
    creditback_start_at,
    final_creditback_applied: false,
    monthly_fee_krw: 0,
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

  // 3) Owner 멤버 초대 (status=invited — Supabase Auth 가입 시 자동 active 전환)
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

  // 4) 감사 로그 (Super 수행 — visibility=both 그러나 내부 상세는 internal_only)
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
      tier,
      creditback_start_at,
      creditback_end_at,
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
      contract_start_at,
      contract_end_at,
      am_user_id: adminUser.id,
    },
  })

  revalidatePath('/console/orgs')
  redirect(`/console/orgs/${org.id}?created=1`)
}
