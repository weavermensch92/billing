'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function acceptRedirect(params: Record<string, string>): never {
  const usp = new URLSearchParams(params)
  usp.set('t', Date.now().toString(36))
  redirect(`/accept-invite?${usp.toString()}`)
}

/**
 * 초대 수락:
 *   1) 비밀번호 설정 (auth.updateUser)
 *   2) members 활성화 (이메일 매칭 fallback — 트리거 누락 케이스 대응)
 */
export async function acceptInvite(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login?error=' + encodeURIComponent('세션이 만료되었습니다. 초대 메일의 링크를 다시 클릭해 주세요.'))
  }

  const password = formData.get('password') as string
  const confirm = formData.get('confirm') as string

  if (!password || password.length < 8) {
    acceptRedirect({ error: '비밀번호는 8자 이상이어야 합니다.' })
  }
  if (password !== confirm) {
    acceptRedirect({ error: '비밀번호가 일치하지 않습니다.' })
  }

  // 1) 비밀번호 설정
  const { error: pwErr } = await supabase.auth.updateUser({ password })
  if (pwErr) {
    acceptRedirect({ error: '비밀번호 설정 실패: ' + pwErr.message })
  }

  // 2) members 활성화 (트리거가 이미 처리했다면 idempotent)
  //    case-insensitive 이메일 매칭 + user_id 백필
  const userEmail = (user.email ?? '').toLowerCase()
  if (!userEmail) {
    acceptRedirect({ error: '계정 이메일을 확인할 수 없습니다.' })
  }

  const { data: member, error: lookupErr } = await supabase
    .from('members')
    .select('id, status, user_id')
    .ilike('email', userEmail)
    .maybeSingle()

  if (lookupErr || !member) {
    acceptRedirect({ error: '초대 정보를 찾을 수 없습니다. 관리자에게 문의하세요.' })
  }

  if (member.status === 'offboarded') {
    acceptRedirect({ error: '오프보딩 처리된 계정입니다. 관리자에게 문의하세요.' })
  }

  if (member.status !== 'active') {
    const { error: updErr } = await supabase
      .from('members')
      .update({
        user_id: user.id,
        status: 'active',
        joined_at: new Date().toISOString(),
      })
      .eq('id', member.id)

    if (updErr) {
      acceptRedirect({ error: '계정 활성화 실패: ' + updErr.message })
    }
  } else if (member.user_id && member.user_id !== user.id) {
    // 이미 active 인데 user_id 가 다른 사람 → 동일 이메일 충돌
    acceptRedirect({ error: '이미 다른 계정에 연결된 이메일입니다. 관리자에게 문의하세요.' })
  }

  redirect('/home')
}
