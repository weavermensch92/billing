'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { confirmChargeRequest } from '@/lib/actions/v2-billing'

/**
 * 슈퍼어드민 Gate #1 — 충전 신청 컨펌.
 * confirmChargeRequest → executeRequestCompletion → createPendingCharge + postTaxInvoiceRequest.
 */
export async function confirmCharge(requestId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  // 슈퍼어드민 검증
  const { data: admin } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!admin) redirect('/console/login')

  const result = await confirmChargeRequest(supabase as never, {
    requestId,
    superAdminId: admin.id,
  })

  if (!result.ok) {
    redirect(`/console/charges/${requestId}?error=${encodeURIComponent(result.error ?? '컨펌 실패')}`)
  }

  revalidatePath('/console/charges')
  revalidatePath(`/console/charges/${requestId}`)
  redirect(`/console/charges/${requestId}?ok=1`)
}

/**
 * 슈퍼어드민이 대행 입력 (4-2 흐름). 컨펌 + 즉시 active 전이.
 * 슬랙 포스팅은 건너뛰고 직접 wallet_charges 생성 + active.
 *
 * (구현 단순화 — confirm과 같은 경로 사용. 슬랙 포스팅 건너뛰려면 별도 flag 필요.)
 */
export async function adminProxyCharge(requestId: string) {
  // Phase 1에서는 confirm 과 동일. Phase 2에 별도 분기.
  return confirmCharge(requestId)
}
