'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function inviteMember(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentMember } = await supabase
    .from('members').select('id, org_id, role').eq('user_id', user.id).eq('status', 'active').single()

  if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
    redirect('/org/members/new?error=권한이 없습니다.')
  }

  const email = (formData.get('email') as string).toLowerCase().trim()
  const name = (formData.get('name') as string).trim()
  const role = formData.get('role') as 'admin' | 'member'

  // owner 초대 금지
  if (currentMember.role === 'admin' && role === 'admin') {
    redirect('/org/members/new?error=Admin은 Admin을 초대할 수 없습니다. Owner에게 요청하세요.')
  }

  // 중복 체크
  const { data: existing } = await supabase
    .from('members').select('id, status')
    .eq('org_id', currentMember.org_id).eq('email', email).maybeSingle()

  if (existing) {
    if (existing.status === 'offboarded') {
      redirect('/org/members/new?error=해당 이메일은 이미 오프보딩 처리되었습니다. 관리자에게 문의하세요.')
    }
    redirect('/org/members/new?error=이미 초대된 이메일입니다.')
  }

  // members 레코드 생성
  const { error } = await supabase.from('members').insert({
    org_id: currentMember.org_id,
    email, name, role,
    status: 'invited',
    invited_at: new Date().toISOString(),
  })

  if (error) {
    redirect(`/org/members/new?error=${encodeURIComponent('초대 실패: ' + error.message)}`)
  }

  // 감사 로그 기록
  await supabase.from('audit_logs').insert({
    org_id: currentMember.org_id,
    actor_type: 'member',
    actor_id: currentMember.id,
    actor_email: user.email ?? null,
    action: 'member_invited',
    target_type: 'member',
    visibility: 'both',
    detail: { email, name, role },
  })

  // TODO: Supabase Auth inviteUserByEmail — service role 필요. Phase 0에서는 Luna가 수동 초대 링크 발송 가능
  // 현재는 DB 레코드만 생성, 실제 이메일 발송은 Phase 1+

  revalidatePath('/org/members')
  redirect('/org/members?invited=1')
}
