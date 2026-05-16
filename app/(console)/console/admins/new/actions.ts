'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

const ALLOWED_ROLES = ['super', 'am', 'finance', 'ops'] as const
type AdminRole = (typeof ALLOWED_ROLES)[number]

function sanitize(s: string, max = 100): string {
  return s.trim().slice(0, max)
}

/**
 * 신규 관리자 초대.
 *
 * 흐름:
 *   1) Super 권한 검증
 *   2) email · name · role 정규화 + 형식 검증
 *   3) 중복 체크 (admin_users.email UNIQUE)
 *   4) Supabase Auth invite (실 모드) — 수신자가 비밀번호 설정
 *   5) admin_users INSERT (is_active=true, totp_secret=NULL — 본인이 2FA 등록)
 *   6) 감사 로그 (visibility=internal_only)
 */
export async function inviteAdmin(formData: FormData) {
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
    redirect('/console/admins?error=' + encodeURIComponent(`관리자 초대는 Super 권한 필요 (현재 역할: ${me.role})`))
  }

  // Inputs
  const email = sanitize(formData.get('email') as string, 320).toLowerCase()
  const name = sanitize(formData.get('name') as string, 50)
  const roleRaw = sanitize(formData.get('role') as string, 20) as AdminRole

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect('/console/admins/new?error=' + encodeURIComponent('이메일 형식이 올바르지 않습니다.'))
  }
  if (name.length < 1) {
    redirect('/console/admins/new?error=' + encodeURIComponent('이름을 입력해 주세요.'))
  }
  if (!ALLOWED_ROLES.includes(roleRaw)) {
    redirect('/console/admins/new?error=' + encodeURIComponent('역할 선택이 올바르지 않습니다.'))
  }

  // 중복 체크
  const { data: dup } = await supabase
    .from('admin_users')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (dup) {
    redirect('/console/admins/new?error=' + encodeURIComponent('이미 등록된 이메일입니다.'))
  }

  // Supabase Auth 초대 (service-role 필요). Mock 모드에서는 즉시 성공 stub.
  const serviceRole = createServiceRoleClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const inviteRes = await serviceRole.auth.admin.inviteUserByEmail(email, {
    redirectTo: appUrl ? `${appUrl}/console/login` : undefined,
    data: { invited_role: roleRaw, invited_name: name },
  })

  if (inviteRes.error) {
    redirect(
      '/console/admins/new?error=' +
        encodeURIComponent('초대 메일 발송 실패: ' + inviteRes.error.message),
    )
  }

  // admin_users INSERT (service-role: RLS bypass)
  const { data: inserted, error: insertErr } = await serviceRole
    .from('admin_users')
    .insert({
      email,
      name,
      role: roleRaw,
      is_active: true,
      totp_secret: null,
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    redirect(
      '/console/admins/new?error=' +
        encodeURIComponent('계정 생성 실패: ' + (insertErr?.message ?? 'unknown')),
    )
  }

  // 감사 로그
  await serviceRole.from('audit_logs').insert({
    org_id: null,
    actor_type: 'admin',
    actor_id: me.id,
    actor_email: user.email ?? null,
    action: 'admin_invited',
    target_type: 'admin_user',
    target_id: inserted.id,
    visibility: 'internal_only',
    detail: { email, name, role: roleRaw },
  })

  revalidatePath('/console/admins')
  redirect('/console/admins?ok=' + encodeURIComponent(`${email} 초대 발송 완료`))
}
