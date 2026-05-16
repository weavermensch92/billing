'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { submitRefund } from '@/lib/actions/v2-billing'

/**
 * 환불 신청 — 13.1 A3 정책.
 * 고객 어드민이 신청 → 슈퍼어드민이 별도 process_refund_a3 호출하는 게 정합.
 *
 * 본 액션은 단순화 — 고객 어드민이 신청하면 즉시 처리 (Phase 1).
 * Phase 2에 슈퍼어드민 컨펌 게이트 추가 권장.
 */
export async function requestRefund(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, org_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!member) redirect('/login')

  if (member.role !== 'owner' && member.role !== 'admin') {
    redirect(`/billing/refund?error=${encodeURIComponent('어드민만 환불 신청 가능합니다.')}`)
  }

  const walletChargeId = String(formData.get('wallet_charge_id') ?? '')
  const note = formData.get('note') as string | null

  if (!walletChargeId) {
    redirect(`/billing/refund?error=${encodeURIComponent('wallet_charge_id 필수')}`)
  }

  // Phase 1: requestedBy + approvedBy 모두 동일 (단순화).
  // Phase 2: 슈퍼어드민 컨펌 별도 흐름.
  const result = await submitRefund(supabase as never, {
    walletChargeId,
    requestedBy: member.id,
    approvedBy: member.id,
    note: note ?? undefined,
  })

  if (!result.ok) {
    const msg = result.isNonRefundable
      ? '지원금/체험 크레딧은 환수 불가합니다.'
      : (result.error ?? '환불 실패')
    redirect(`/billing/refund?error=${encodeURIComponent(msg)}`)
  }

  revalidatePath('/billing/wallet')
  revalidatePath('/billing/refund')
  redirect(`/billing/refund?ok=${result.outboundId}`)
}
