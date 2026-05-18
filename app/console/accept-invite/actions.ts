'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { redirect } from 'next/navigation'

function r(params: Record<string, string>): never {
  const usp = new URLSearchParams(params)
  usp.set('t', Date.now().toString(36))
  redirect(`/console/accept-invite?${usp.toString()}`)
}

/**
 * 콘솔 admin 초대 수락:
 *   1) 세션 검증
 *   2) admin_users 매칭 (user_id 또는 email)
 *   3) 비밀번호 설정 (auth.updateUser)
 *   4) admin_users.user_id 백필 (invite 시 채워졌지만 idempotent)
 *   5) 감사 로그
 */
export async function acceptConsoleInvite(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/console/login?error=' + encodeURIComponent('세션이 만료되었습니다. 초대 메일의 링크를 다시 클릭해 주세요.'))
  }

  const password = formData.get('password') as string
  const confirm = formData.get('confirm') as string

  if (!password || password.length < 8) r({ error: '비밀번호는 8자 이상이어야 합니다.' })
  if (password !== confirm) r({ error: '비밀번호가 일치하지 않습니다.' })

  // 1) 비밀번호 설정
  const { error: pwErr } = await supabase.auth.updateUser({ password })
  if (pwErr) r({ error: '비밀번호 설정 실패: ' + pwErr.message })

  // 2) admin_users 매칭 (service-role — RLS 우회로 user_id 백필 보장)
  const service = createServiceRoleClient()
  const userEmail = (user.email ?? '').toLowerCase()
  if (!userEmail) r({ error: '계정 이메일을 확인할 수 없습니다.' })

  const { data: adminRow, error: lookupErr } = await service
    .from('admin_users')
    .select('id, user_id, is_active, role')
    .ilike('email', userEmail)
    .maybeSingle()

  if (lookupErr || !adminRow) {
    r({ error: '관리자 초대 정보를 찾을 수 없습니다. Super 에게 문의하세요.' })
  }
  if (!adminRow.is_active) {
    r({ error: '비활성화된 관리자 계정입니다. Super 에게 문의하세요.' })
  }

  // 3) user_id 백필 + 감사 로그
  if (!adminRow.user_id || adminRow.user_id !== user.id) {
    const { error: updErr } = await service
      .from('admin_users')
      .update({ user_id: user.id })
      .eq('id', adminRow.id)
    if (updErr) r({ error: '계정 연결 실패: ' + updErr.message })
  }

  await service.from('audit_logs').insert({
    org_id: null,
    actor_type: 'admin',
    actor_id: adminRow.id,
    actor_email: userEmail,
    action: 'admin_password_set',
    target_type: 'admin_user',
    target_id: adminRow.id,
    visibility: 'internal_only',
    detail: { role: adminRow.role, first_setup: true },
  })

  redirect('/console/home')
}
