'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClientOrRedirect } from '@/lib/supabase/service-role'
import { actionErrorMessage, isRedirectError } from '@/lib/errors'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

const ALLOWED_ROLES = ['owner', 'admin', 'member'] as const
type MemberRole = (typeof ALLOWED_ROLES)[number]

function sanitize(s: string | null | undefined, max: number): string {
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
  if (me.role !== 'super') {
    redirect('/console/members?error=' + encodeURIComponent(`멤버 관리는 Super 전용 (현재 역할: ${me.role})`))
  }
  return { supabase, user, me }
}

/** 멤버 이름 / 역할 수정. */
export async function updateMember(formData: FormData) {
  const memberId = sanitize(formData.get('member_id') as string, 50)
  const back = `/console/members/${memberId}/edit`
  if (!memberId) {
    redirect('/console/members?error=' + encodeURIComponent('member_id 누락'))
  }

  const { user, me } = await authorizeSuper()

  const name = sanitize(formData.get('name') as string, 50)
  const roleRaw = sanitize(formData.get('role') as string, 20) as MemberRole

  if (name.length < 1) {
    redirect(`${back}?error=` + encodeURIComponent('이름은 비울 수 없습니다.'))
  }
  if (!ALLOWED_ROLES.includes(roleRaw)) {
    redirect(`${back}?error=` + encodeURIComponent('역할 선택이 올바르지 않습니다.'))
  }

  const service = createServiceRoleClientOrRedirect(back)

  const { data: target } = await service
    .from('members')
    .select('id, org_id, name, role, email')
    .eq('id', memberId)
    .maybeSingle()
  if (!target) {
    redirect('/console/members?error=' + encodeURIComponent('멤버를 찾을 수 없습니다.'))
  }

  // owner 추가 시 조직당 1명 검증 (다른 active owner 가 있고, 본인이 owner 가 아니면 거부)
  if (roleRaw === 'owner' && target.role !== 'owner') {
    const { data: existingOwner } = await service
      .from('members')
      .select('id, email')
      .eq('org_id', target.org_id)
      .eq('role', 'owner')
      .neq('status', 'offboarded')
      .is('deleted_at', null)
      .neq('id', memberId)
      .maybeSingle()

    if (existingOwner) {
      redirect(
        `${back}?error=` +
          encodeURIComponent(`이미 Owner 가 있습니다 (${existingOwner.email}). 권한 이양 후 변경하세요.`),
      )
    }
  }

  try {
    const { error } = await service
      .from('members')
      .update({ name, role: roleRaw })
      .eq('id', memberId)

    if (error) {
      redirect(`${back}?error=` + encodeURIComponent('수정 실패: ' + error.message))
    }

    await service.from('audit_logs').insert({
      org_id: target.org_id,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'member_updated_by_console',
      target_type: 'member',
      target_id: memberId,
      visibility: 'both',
      detail: {
        email: target.email,
        before: { name: target.name, role: target.role },
        after: { name, role: roleRaw },
      },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[updateMember]', err)
    redirect(`${back}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  revalidatePath('/console/members')
  revalidatePath(`/console/orgs/${target.org_id}`)
  redirect('/console/members?ok=' + encodeURIComponent(`${target.email} 수정 완료`))
}

/** 소프트 삭제 — deleted_at 설정. 행은 유지 (FK 안전 + 복구 가능). */
export async function softDeleteMember(formData: FormData) {
  const memberId = sanitize(formData.get('member_id') as string, 50)
  if (!memberId) {
    redirect('/console/members?error=' + encodeURIComponent('member_id 누락'))
  }

  const { user, me } = await authorizeSuper()
  const service = createServiceRoleClientOrRedirect('/console/members')

  const { data: target } = await service
    .from('members')
    .select('id, org_id, name, email, role, deleted_at')
    .eq('id', memberId)
    .maybeSingle()
  if (!target) {
    redirect('/console/members?error=' + encodeURIComponent('멤버를 찾을 수 없습니다.'))
  }
  if (target.deleted_at) {
    redirect('/console/members?error=' + encodeURIComponent('이미 삭제함에 있는 멤버입니다.'))
  }

  try {
    const { error } = await service
      .from('members')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by_admin_id: me.id,
      })
      .eq('id', memberId)

    if (error) {
      redirect('/console/members?error=' + encodeURIComponent('삭제 실패: ' + error.message))
    }

    await service.from('audit_logs').insert({
      org_id: target.org_id,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'member_soft_deleted',
      target_type: 'member',
      target_id: memberId,
      visibility: 'both',
      detail: { email: target.email, name: target.name, role: target.role },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[softDeleteMember]', err)
    redirect('/console/members?error=' + encodeURIComponent(actionErrorMessage(err)))
  }

  revalidatePath('/console/members')
  revalidatePath('/console/members/trash')
  revalidatePath(`/console/orgs/${target.org_id}`)
  redirect('/console/members?ok=' + encodeURIComponent(`${target.email} 삭제함으로 이동`))
}

/** 삭제함에서 복구 — deleted_at 클리어. */
export async function restoreFromTrash(formData: FormData) {
  const memberId = sanitize(formData.get('member_id') as string, 50)
  if (!memberId) {
    redirect('/console/members/trash?error=' + encodeURIComponent('member_id 누락'))
  }

  const { user, me } = await authorizeSuper()
  const service = createServiceRoleClientOrRedirect('/console/members/trash')

  const { data: target } = await service
    .from('members')
    .select('id, org_id, name, email, role, deleted_at')
    .eq('id', memberId)
    .maybeSingle()
  if (!target) {
    redirect('/console/members/trash?error=' + encodeURIComponent('멤버를 찾을 수 없습니다.'))
  }
  if (!target.deleted_at) {
    redirect('/console/members/trash?error=' + encodeURIComponent('삭제함에 있지 않은 멤버입니다.'))
  }

  try {
    const { error } = await service
      .from('members')
      .update({
        deleted_at: null,
        deleted_by_admin_id: null,
      })
      .eq('id', memberId)

    if (error) {
      redirect('/console/members/trash?error=' + encodeURIComponent('복구 실패: ' + error.message))
    }

    await service.from('audit_logs').insert({
      org_id: target.org_id,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'member_restored_from_trash',
      target_type: 'member',
      target_id: memberId,
      visibility: 'both',
      detail: { email: target.email, name: target.name, role: target.role },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[restoreFromTrash]', err)
    redirect('/console/members/trash?error=' + encodeURIComponent(actionErrorMessage(err)))
  }

  revalidatePath('/console/members')
  revalidatePath('/console/members/trash')
  revalidatePath(`/console/orgs/${target.org_id}`)
  redirect('/console/members/trash?ok=' + encodeURIComponent(`${target.email} 복구 완료`))
}
