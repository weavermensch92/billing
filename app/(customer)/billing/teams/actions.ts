'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { submitTeamHeadroomSet } from '@/lib/actions/v2-billing'

export async function setTeamHeadroom(formData: FormData) {
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

  // 어드민만 팀 헤드룸 분배 가능
  if (member.role !== 'owner' && member.role !== 'admin') {
    redirect(`/billing/teams?error=${encodeURIComponent('어드민만 분배 가능합니다.')}`)
  }

  const teamId = String(formData.get('team_id') ?? '')
  const limitKrw = Number(formData.get('headroom_limit_krw') ?? 0)

  if (!teamId || limitKrw < 0) {
    redirect(`/billing/teams?error=${encodeURIComponent('team_id 또는 limit 오류')}`)
  }

  const result = await submitTeamHeadroomSet(supabase as never, {
    orgId: member.org_id,
    requesterId: member.id,
    teamId,
    limitKrw,
  })

  if (!result.ok) {
    // 트리거 검증 EXCEPTION (합계 > Org 한도) 메시지 그대로 노출
    redirect(`/billing/teams?error=${encodeURIComponent(result.error ?? '분배 실패')}`)
  }

  revalidatePath('/billing/teams')
  redirect(`/billing/teams?ok=${result.requestId}`)
}
