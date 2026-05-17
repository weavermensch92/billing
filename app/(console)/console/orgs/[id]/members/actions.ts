'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClientOrRedirect } from '@/lib/supabase/service-role'
import { actionErrorMessage, isRedirectError } from '@/lib/errors'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

const ALLOWED_ROLES = ['owner', 'admin', 'member'] as const
type MemberRole = (typeof ALLOWED_ROLES)[number]

function sanitize(s: string, max = 100): string {
  return (s ?? '').toString().trim().slice(0, max)
}

async function authorizeSuper() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: me } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!me) redirect('/console/login')
  return { supabase, user, me }
}

/**
 * 콘솔 — Super 가 특정 Org 에 멤버를 수동 초대.
 *   1) Super 권한 검증
 *   2) Org 존재 / 이메일·역할 형식 검증
 *   3) 동일 org + 동일 이메일 중복 체크
 *   4) Supabase Auth invite (서비스롤)
 *   5) members INSERT (서비스롤 — RLS bypass, status='invited')
 *   6) 감사 로그 (visibility=both)
 */
export async function inviteOrgMember(formData: FormData) {
  const orgId = sanitize(formData.get('org_id') as string, 50)
  if (!orgId) {
    redirect('/console/orgs?error=' + encodeURIComponent('Org ID 누락'))
  }

  const { user, me } = await authorizeSuper()
  if (me.role !== 'super') {
    redirect(`/console/orgs/${orgId}?error=` + encodeURIComponent(`멤버 초대는 Super 전용 (현재 역할: ${me.role})`))
  }

  const email = sanitize(formData.get('email') as string, 320).toLowerCase()
  const name = sanitize(formData.get('name') as string, 50)
  const roleRaw = sanitize(formData.get('role') as string, 20) as MemberRole

  const backToForm = `/console/orgs/${orgId}/members/new`

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(`${backToForm}?error=` + encodeURIComponent('이메일 형식이 올바르지 않습니다.'))
  }
  if (name.length < 1) {
    redirect(`${backToForm}?error=` + encodeURIComponent('이름을 입력해 주세요.'))
  }
  if (!ALLOWED_ROLES.includes(roleRaw)) {
    redirect(`${backToForm}?error=` + encodeURIComponent('역할 선택이 올바르지 않습니다.'))
  }

  // Org 존재 확인 + 중복 체크 (서비스롤 사용 — 콘솔은 Super 가 모든 Org 접근)
  const service = createServiceRoleClientOrRedirect(backToForm)

  const { data: org, error: orgErr } = await service
    .from('orgs')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle()

  if (orgErr || !org) {
    redirect('/console/orgs?error=' + encodeURIComponent('Org 를 찾을 수 없습니다.'))
  }

  const { data: dup } = await service
    .from('members')
    .select('id, status, role')
    .eq('org_id', orgId)
    .eq('email', email)
    .maybeSingle()

  if (dup) {
    const statusLabel =
      dup.status === 'active' ? '이미 활성화된' :
      dup.status === 'invited' ? '이미 초대된' :
      dup.status === 'offboarded' ? '오프보딩 처리된' : '등록된'
    redirect(
      `${backToForm}?error=` +
        encodeURIComponent(`${statusLabel} 이메일입니다 (역할: ${dup.role}).`),
    )
  }

  // owner 는 조직당 1명 원칙 — 기존 active owner 있으면 거부
  if (roleRaw === 'owner') {
    const { data: existingOwner } = await service
      .from('members')
      .select('id, email')
      .eq('org_id', orgId)
      .eq('role', 'owner')
      .neq('status', 'offboarded')
      .maybeSingle()

    if (existingOwner) {
      redirect(
        `${backToForm}?error=` +
          encodeURIComponent(`이미 Owner 가 있습니다 (${existingOwner.email}). 추가 Owner 는 Admin 으로 초대 후 권한 이양하세요.`),
      )
    }
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const inviteRes = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo: appUrl ? `${appUrl}/auth/callback` : undefined,
      data: { invited_org_id: orgId, invited_role: roleRaw, invited_name: name },
    })

    if (inviteRes.error) {
      redirect(
        `${backToForm}?error=` +
          encodeURIComponent(
            '초대 메일 발송 실패: ' + inviteRes.error.message +
            ' (Supabase Dashboard → Auth → SMTP 설정 확인)',
          ),
      )
    }

    // invite 응답의 user.id 를 members.user_id 에 명시 — handle_new_auth_user
    // 트리거 race 회피 + 차후 로그인 시 user_id 기반 권한 검증 보장.
    const invitedUserId = inviteRes.data?.user?.id ?? null

    const { error: insertErr } = await service.from('members').insert({
      org_id: orgId,
      email,
      name,
      role: roleRaw,
      user_id: invitedUserId,
      status: 'invited',
      invited_at: new Date().toISOString(),
    })

    if (insertErr) {
      redirect(
        `${backToForm}?error=` +
          encodeURIComponent('멤버 레코드 생성 실패: ' + insertErr.message),
      )
    }

    await service.from('audit_logs').insert({
      org_id: orgId,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'member_invited',
      target_type: 'member',
      visibility: 'both',
      detail: { email, name, role: roleRaw, invited_by: 'console_super', user_id: invitedUserId },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[inviteOrgMember]', err)
    redirect(`${backToForm}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  revalidatePath(`/console/orgs/${orgId}`)
  redirect(
    `/console/orgs/${orgId}?tab=members&ok=` +
      encodeURIComponent(`${email} 초대 발송 완료`),
  )
}

/**
 * 콘솔 — pending(=invited) 상태인 멤버에게 초대 메일을 재발송.
 * Supabase 가 자동으로 magic link 를 새 토큰으로 발급.
 */
export async function resendInvite(formData: FormData) {
  const orgId = sanitize(formData.get('org_id') as string, 50)
  const memberId = sanitize(formData.get('member_id') as string, 50)
  const backTo = `/console/orgs/${orgId}?tab=members`

  if (!orgId || !memberId) {
    redirect(`${backTo}&error=` + encodeURIComponent('파라미터 누락'))
  }

  const { user, me } = await authorizeSuper()
  if (me.role !== 'super') {
    redirect(`${backTo}&error=` + encodeURIComponent('재발송은 Super 전용'))
  }

  const service = createServiceRoleClientOrRedirect(backTo)

  const { data: member } = await service
    .from('members')
    .select('id, email, name, role, status, user_id')
    .eq('id', memberId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!member) {
    redirect(`${backTo}&error=` + encodeURIComponent('멤버를 찾을 수 없습니다.'))
  }
  if (member.status !== 'invited' || member.user_id) {
    redirect(`${backTo}&error=` + encodeURIComponent('초대 대기(invited) 상태 멤버에게만 재발송 가능합니다.'))
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const inviteRes = await service.auth.admin.inviteUserByEmail(member.email, {
      redirectTo: appUrl ? `${appUrl}/auth/callback` : undefined,
      data: { invited_org_id: orgId, invited_role: member.role, invited_name: member.name },
    })

    if (inviteRes.error) {
      redirect(
        `${backTo}&error=` +
          encodeURIComponent(
            '재발송 실패: ' + inviteRes.error.message +
            ' (Supabase Dashboard → Auth → SMTP 설정 확인)',
          ),
      )
    }

    // invite 응답의 user.id 로 기존 member.user_id 도 보정 (NULL 인 경우)
    const invitedUserId = inviteRes.data?.user?.id ?? null
    const memberUpdate: Record<string, unknown> = { invited_at: new Date().toISOString() }
    if (invitedUserId && !member.user_id) {
      memberUpdate.user_id = invitedUserId
    }
    await service.from('members').update(memberUpdate).eq('id', memberId)

    await service.from('audit_logs').insert({
      org_id: orgId,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'member_invite_resent',
      target_type: 'member',
      target_id: memberId,
      visibility: 'both',
      detail: { email: member.email, role: member.role, user_id: invitedUserId },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[resendInvite]', err)
    redirect(`${backTo}&error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  revalidatePath(`/console/orgs/${orgId}`)
  redirect(`${backTo}&ok=` + encodeURIComponent(`${member.email} 재발송 완료`))
}
