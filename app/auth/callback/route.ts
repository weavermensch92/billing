import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Supabase Auth 콜백.
 *
 * 시나리오:
 *   1) 일반 비밀번호 로그인 — 콜백 안 거침 (signInWithPassword 직접)
 *   2) 매직 링크 (이미 가입 + 비밀번호 설정 완료) → /home
 *   3) 초대 매직 링크 (members.status='invited', user_id=NULL) → /accept-invite
 *      여기서 비밀번호 설정 + member 활성화 후 /home
 *   4) auth 에는 있으나 active member 가 없는 경우 → /accept-invite 가 자체 처리
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('인증에 실패했습니다.')}`)
  }

  const supabase = await createClient()
  const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeErr) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('인증에 실패했습니다.')}`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('인증에 실패했습니다.')}`)
  }

  // Admin 계정인지 확인 (운영 콘솔 사용자) — admin 이면 콘솔로
  const { data: admin } = await supabase
    .from('admin_users')
    .select('id, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (admin) {
    return NextResponse.redirect(`${origin}${next ?? '/console/home'}`)
  }

  // active member 면 바로 /home (또는 next)
  const { data: activeMember } = await supabase
    .from('members')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (activeMember) {
    return NextResponse.redirect(`${origin}${next ?? '/home'}`)
  }

  // active 가 아니면 초대 수락 페이지로 (비밀번호 설정 + member 활성화)
  return NextResponse.redirect(`${origin}/accept-invite`)
}
