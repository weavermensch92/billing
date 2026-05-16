'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { actionErrorMessage, isRedirectError } from '@/lib/errors'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function errorRedirect(path: string, err: unknown): never {
  console.error('[admin-action]', err)
  redirect(`${path}?error=${encodeURIComponent(actionErrorMessage(err))}`)
}

const ALLOWED_ROLES = ['super', 'am', 'finance', 'ops'] as const
type AdminRole = (typeof ALLOWED_ROLES)[number]

/** Super 인증 + 대상 admin 조회 + 최소 1명 Super 보장 헬퍼. */
async function authorizeSuperAndLoad(adminId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: me } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('email', user.email ?? '')
    .eq('is_active', true)
    .maybeSingle()
  if (!me) redirect('/console/login')

  if (me.role !== 'super') {
    redirect('/console/admins?error=' + encodeURIComponent(`작업 권한 없음 — Super 전용 (현재 역할: ${me.role})`))
  }

  const { data: target } = await supabase
    .from('admin_users')
    .select('id, email, role, is_active')
    .eq('id', adminId)
    .maybeSingle()
  if (!target) {
    redirect('/console/admins?error=' + encodeURIComponent('대상 관리자를 찾을 수 없습니다.'))
  }

  const { count: activeSuperCount } = await supabase
    .from('admin_users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'super')
    .eq('is_active', true)

  return { supabase, user, me, target, activeSuperCount: activeSuperCount ?? 0 }
}

export async function updateAdminRole(formData: FormData) {
  const adminId = String(formData.get('admin_id') ?? '')
  const nextRole = String(formData.get('role') ?? '') as AdminRole

  if (!adminId || !ALLOWED_ROLES.includes(nextRole)) {
    redirect('/console/admins?error=' + encodeURIComponent('입력이 올바르지 않습니다.'))
  }

  const { user, me, target, activeSuperCount } = await authorizeSuperAndLoad(adminId)

  if (nextRole === target.role) {
    redirect(`/console/admins/${adminId}?ok=` + encodeURIComponent('역할 변경 없음'))
  }

  // 최소 1명 Super 보장: 대상이 마지막 활성 super 인데 super 외로 변경 시도
  const wouldRemoveLastSuper =
    target.role === 'super' && target.is_active && nextRole !== 'super' && activeSuperCount <= 1
  if (wouldRemoveLastSuper) {
    redirect(
      `/console/admins/${adminId}?error=` +
        encodeURIComponent('마지막 활성 Super 는 다른 역할로 변경할 수 없습니다.'),
    )
  }

  try {
    const serviceRole = createServiceRoleClient()
    const { error } = await serviceRole
      .from('admin_users')
      .update({ role: nextRole })
      .eq('id', adminId)

    if (error) {
      redirect(
        `/console/admins/${adminId}?error=` +
          encodeURIComponent('역할 변경 실패: ' + error.message),
      )
    }

    await serviceRole.from('audit_logs').insert({
      org_id: null,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'admin_role_changed',
      target_type: 'admin_user',
      target_id: adminId,
      visibility: 'internal_only',
      detail: { email: target.email, before: target.role, after: nextRole },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    errorRedirect(`/console/admins/${adminId}`, err)
  }

  revalidatePath('/console/admins')
  revalidatePath(`/console/admins/${adminId}`)
  redirect(`/console/admins/${adminId}?ok=` + encodeURIComponent(`역할 변경 완료: ${target.role} → ${nextRole}`))
}

export async function toggleAdminActive(formData: FormData) {
  const adminId = String(formData.get('admin_id') ?? '')
  const nextActiveRaw = String(formData.get('next_active') ?? '')
  const nextActive = nextActiveRaw === 'true'

  if (!adminId || (nextActiveRaw !== 'true' && nextActiveRaw !== 'false')) {
    redirect('/console/admins?error=' + encodeURIComponent('입력이 올바르지 않습니다.'))
  }

  const { user, me, target, activeSuperCount } = await authorizeSuperAndLoad(adminId)

  if (nextActive === target.is_active) {
    redirect(`/console/admins/${adminId}?ok=` + encodeURIComponent('상태 변경 없음'))
  }

  // 최소 1명 Super 보장: 대상이 마지막 활성 super 인데 비활성화 시도
  const wouldDeactivateLastSuper =
    !nextActive && target.role === 'super' && target.is_active && activeSuperCount <= 1
  if (wouldDeactivateLastSuper) {
    redirect(
      `/console/admins/${adminId}?error=` +
        encodeURIComponent('마지막 활성 Super 는 비활성화할 수 없습니다.'),
    )
  }

  try {
    const serviceRole = createServiceRoleClient()
    const { error } = await serviceRole
      .from('admin_users')
      .update({ is_active: nextActive })
      .eq('id', adminId)

    if (error) {
      redirect(
        `/console/admins/${adminId}?error=` +
          encodeURIComponent('상태 변경 실패: ' + error.message),
      )
    }

    await serviceRole.from('audit_logs').insert({
      org_id: null,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: nextActive ? 'admin_activated' : 'admin_deactivated',
      target_type: 'admin_user',
      target_id: adminId,
      visibility: 'internal_only',
      detail: { email: target.email, role: target.role },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    errorRedirect(`/console/admins/${adminId}`, err)
  }

  revalidatePath('/console/admins')
  revalidatePath(`/console/admins/${adminId}`)
  redirect(
    `/console/admins/${adminId}?ok=` +
      encodeURIComponent(nextActive ? '계정 활성화 완료' : '계정 비활성화 완료'),
  )
}
