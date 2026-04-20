'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { VcnStatus } from '@/types/billing.types'

export async function transitionVcn(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: adminUser } = await supabase
    .from('admin_users').select('id, role').eq('email', user.email ?? '').eq('is_active', true).single()
  if (!adminUser) redirect('/console/login')

  const vcn_id = formData.get('vcn_id') as string
  const next_status = formData.get('next_status') as VcnStatus
  const reason = (formData.get('reason') as string | null)?.trim() ?? ''

  const updates: Record<string, unknown> = { status: next_status }

  // 타임스탬프 필드 자동 설정
  if (next_status === 'issued')    updates.issued_at    = new Date().toISOString()
  if (next_status === 'active')    updates.activated_at = new Date().toISOString()
  if (next_status === 'suspended') updates.suspended_at = new Date().toISOString()
  if (next_status === 'revoked')   updates.revoked_at   = new Date().toISOString()
  if (next_status === 'expired')   updates.expired_at   = new Date().toISOString()

  const { data: vcn, error } = await supabase
    .from('virtual_cards').update(updates).eq('id', vcn_id).select('org_id').single()

  if (error || !vcn) {
    redirect(`/console/vcn/${vcn_id}?error=${encodeURIComponent(error?.message ?? '상태 전이 실패')}`)
  }

  // 감사 로그 — VCN 상태 변경은 internal_only
  await supabase.from('audit_logs').insert({
    org_id: vcn.org_id,
    actor_type: 'admin',
    actor_id: adminUser.id,
    actor_email: user.email ?? null,
    action: 'vcn_transitioned',
    target_type: 'virtual_card',
    target_id: vcn_id,
    visibility: 'both',
    detail: { to: next_status, reason },
  })

  revalidatePath(`/console/vcn/${vcn_id}`)
}

export async function revealFullCardNumber(formData: FormData) {
  // Super 전용 + 사유 입력 필수 + audit_logs (visibility='internal_only')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: adminUser } = await supabase
    .from('admin_users').select('id, role').eq('email', user.email ?? '').eq('is_active', true).single()
  if (!adminUser) redirect('/console/login')

  if (adminUser.role !== 'super') {
    return { error: 'Super 권한이 필요합니다.' }
  }

  const vcn_id = formData.get('vcn_id') as string
  const reason = (formData.get('reason') as string).trim()
  if (!reason || reason.length < 10) {
    return { error: '사유를 10자 이상 입력해 주세요.' }
  }

  const { data: vcn } = await supabase
    .from('virtual_cards').select('org_id, card_last4').eq('id', vcn_id).single()
  if (!vcn) return { error: 'VCN을 찾을 수 없습니다.' }

  // 실제 전체 번호는 카드사 Portal에서만 조회. 여기서는 감사 로그만 남김.
  await supabase.from('audit_logs').insert({
    org_id: vcn.org_id,
    actor_type: 'admin',
    actor_id: adminUser.id,
    actor_email: user.email ?? null,
    action: 'vcn_full_number_reveal',
    target_type: 'virtual_card',
    target_id: vcn_id,
    visibility: 'internal_only',
    detail: { reason, card_last4: vcn.card_last4 },
  })

  return { success: true, message: '감사 로그 기록 완료. 신한 V-Card 포털에서 전체 번호를 조회하세요.' }
}
