'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { submitOrgTermination } from '@/lib/actions/v2-billing'
import { previewTermination } from '@/lib/billing/termination'

/**
 * Org 해지 신청 — 13.2 B-i + c.
 * grace_until = 다음 결제일. 신규 충전·사용 차단 X (그대로 운영).
 */
export async function requestOrgTermination(formData: FormData) {
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

  // Owner만 Org 해지 가능 (admin도 허용? Phase 1: owner only)
  if (member.role !== 'owner') {
    redirect(`/settings/termination?error=${encodeURIComponent('Owner만 해지 신청 가능합니다.')}`)
  }

  const reason = formData.get('reason') as string | null

  const result = await submitOrgTermination(supabase as never, {
    orgId: member.org_id,
    requesterId: member.id,
    reason: reason ?? undefined,
  })

  if (!result.ok) {
    redirect(`/settings/termination?error=${encodeURIComponent(result.error ?? '해지 신청 실패')}`)
  }

  const graceUntil = result.detail?.graceUntil as string | undefined
  revalidatePath('/settings/termination')
  redirect(`/settings/termination?ok=1&grace_until=${encodeURIComponent(graceUntil ?? '')}`)
}

/**
 * 사전 미리보기 — 해지 시 다음 결제일이 언제인지 표시.
 * Server Action 결과를 form 제출 전에 보여주기 위한 헬퍼.
 */
export async function previewTerminationDate(): Promise<{ graceUntil: string; daysUntilFinalize: number } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: member } = await supabase
    .from('members')
    .select('id, org_id, org:orgs(billing_day_of_month)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!member) return null

  const billingDay = (member as unknown as { org?: { billing_day_of_month?: number } | null }).org?.billing_day_of_month ?? 1
  const result = previewTermination({ todayDate: new Date(), billingDayOfMonth: billingDay })
  return {
    graceUntil: result.graceUntil.toISOString().split('T')[0],
    daysUntilFinalize: result.daysUntilFinalize,
  }
}
