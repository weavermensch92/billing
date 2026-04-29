'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

const MAX_HEADROOM_KRW = 1_000_000_000 // ₩1B

export async function setHeadroom(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  // Super 권한 검증 (G-049 특수 행위)
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('email', user.email ?? '')
    .eq('is_active', true)
    .single()
  if (!adminUser) redirect('/console/login')
  if (adminUser.role !== 'super') {
    const orgId = formData.get('org_id') as string
    redirect(`/console/orgs/${orgId}?error=${encodeURIComponent('Super 권한이 필요합니다.')}`)
  }

  const org_id = formData.get('org_id') as string
  const new_amount = Number(formData.get('new_amount_krw'))
  const reason = ((formData.get('reason') as string) ?? '').trim()

  if (!Number.isFinite(new_amount) || new_amount < 0 || new_amount > MAX_HEADROOM_KRW) {
    redirect(`/console/orgs/${org_id}/headroom?error=${encodeURIComponent('한도 범위: ₩0 ~ ₩1B')}`)
  }
  if (reason.length < 10) {
    redirect(`/console/orgs/${org_id}/headroom?error=${encodeURIComponent('사유를 10자 이상 입력해 주세요.')}`)
  }

  // 현재 사용액이 새 한도보다 크면 reject (DB CHECK 위반 방지)
  const { data: org } = await supabase
    .from('orgs').select('self_approval_headroom_krw, self_approval_used_krw').eq('id', org_id).maybeSingle()
  if (!org) {
    redirect(`/console/orgs?error=${encodeURIComponent('조직을 찾을 수 없습니다.')}`)
  }
  const currentUsed = org.self_approval_used_krw ?? 0
  if (new_amount < currentUsed) {
    redirect(`/console/orgs/${org_id}/headroom?error=${encodeURIComponent(`현재 사용액(₩${currentUsed.toLocaleString()})보다 작은 한도는 설정할 수 없습니다. 월간 리셋 후 조정하세요.`)}`)
  }

  const previousHeadroom = org.self_approval_headroom_krw ?? 0

  const { error } = await supabase
    .from('orgs')
    .update({ self_approval_headroom_krw: new_amount })
    .eq('id', org_id)

  if (error) {
    redirect(`/console/orgs/${org_id}/headroom?error=${encodeURIComponent('변경 실패: ' + error.message)}`)
  }

  // 감사 로그 — visibility=both (고객도 확인 가능)
  await supabase.from('audit_logs').insert({
    org_id,
    actor_type: 'admin',
    actor_id: adminUser.id,
    actor_email: user.email ?? null,
    action: 'self_approval_headroom_set',
    target_type: 'org',
    target_id: org_id,
    visibility: 'both',
    detail: {
      from_krw: previousHeadroom,
      to_krw: new_amount,
      delta_krw: new_amount - previousHeadroom,
      reason,
    },
  })

  revalidatePath(`/console/orgs/${org_id}`)
  revalidatePath(`/console/orgs/${org_id}/headroom`)
  redirect(`/console/orgs/${org_id}?headroom_updated=1`)
}
