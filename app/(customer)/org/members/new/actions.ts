'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function inviteMember(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentMember } = await supabase
    .from('members').select('id, org_id, role').eq('user_id', user.id).eq('status', 'active').single()

  if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
    redirect('/org/members/new?error=' + encodeURIComponent('권한이 없습니다.'))
  }

  const email = (formData.get('email') as string).toLowerCase().trim()
  const name = (formData.get('name') as string).trim()
  const role = formData.get('role') as 'admin' | 'member'

  // owner 초대 금지
  if (currentMember.role === 'admin' && role === 'admin') {
    redirect('/org/members/new?error=' + encodeURIComponent('Admin은 Admin을 초대할 수 없습니다. Owner에게 요청하세요.'))
  }

  // 중복 체크
  const { data: existing } = await supabase
    .from('members').select('id, status')
    .eq('org_id', currentMember.org_id).eq('email', email).maybeSingle()

  if (existing) {
    if (existing.status === 'offboarded') {
      redirect('/org/members/new?error=' + encodeURIComponent('해당 이메일은 이미 오프보딩 처리되었습니다. 관리자에게 문의하세요.'))
    }
    redirect('/org/members/new?error=' + encodeURIComponent('이미 초대된 이메일입니다.'))
  }

  // Supabase Auth 초대 메일 발송 — service_role 필요 (auth.admin.* 권한)
  // 콘솔의 console/orgs/[id]/members/actions.ts 와 동일한 패턴.
  // 메일 발송 실패 시 members row 도 INSERT 안 함 (atomicity).
  const service = createServiceRoleClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const inviteRes = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: appUrl ? `${appUrl}/auth/callback` : undefined,
    data: {
      invited_org_id: currentMember.org_id,
      invited_role: role,
      invited_name: name,
      invited_by: user.email ?? null,
    },
  })

  if (inviteRes.error) {
    redirect(
      '/org/members/new?error=' +
        encodeURIComponent(
          '초대 메일 발송 실패: ' + inviteRes.error.message +
          ' (운영자에게 문의 — Auth SMTP 설정 확인 필요)',
        ),
    )
  }

  // invite 응답의 user.id 를 members.user_id 에 명시 — handle_new_auth_user
  // 트리거 race 회피 + 차후 로그인 시 user_id 기반 권한 검증 보장.
  const invitedUserId = inviteRes.data?.user?.id ?? null

  // members 레코드 생성 (service_role 로 INSERT)
  const { error } = await service.from('members').insert({
    org_id: currentMember.org_id,
    email,
    name,
    role,
    user_id: invitedUserId,
    status: 'invited',
    invited_at: new Date().toISOString(),
  })

  if (error) {
    // 메일은 이미 발송됨 — 운영자가 수동 정리. 사용자에겐 명확한 에러.
    console.error('[inviteMember] members INSERT failed after Auth invite', error)
    redirect('/org/members/new?error=' + encodeURIComponent('초대 메일은 발송됐으나 멤버 레코드 생성 실패: ' + error.message + ' (Owner 에게 문의)'))
  }

  // 감사 로그 기록
  await service.from('audit_logs').insert({
    org_id: currentMember.org_id,
    actor_type: 'member',
    actor_id: currentMember.id,
    actor_email: user.email ?? null,
    action: 'member_invited',
    target_type: 'member',
    visibility: 'both',
    detail: { email, name, role },
  })

  revalidatePath('/org/members')
  redirect('/org/members?invited=1')
}
