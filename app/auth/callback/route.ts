import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

/**
 * Supabase Auth 콜백.
 *
 * 처리하는 두 형식:
 *   (a) ?code=...
 *       — PKCE flow. signInWithOtp / signInWithOAuth 를 클라이언트(서버)에서
 *         시작한 경우. exchangeCodeForSession 호출.
 *   (b) ?token_hash=...&type=...
 *       — Supabase Auth 이메일 (Invite user / Magic Link / Recovery /
 *         Email Change / Confirm Signup) 의 PKCE 호환 링크 형식. verifyOtp 호출.
 *
 *   ※ 구형 hash 기반 (#access_token=...) 은 서버에서 받을 수 없음.
 *     Supabase Dashboard → Email Templates 에서 링크를 (b) 형식으로 변경 필요.
 *
 * 분기:
 *   - ?next 가 명시되면 우선 (예: recovery → /reset-password/confirm)
 *   - admin_users 매칭 + 첫 로그인 → /console/accept-invite (비번 설정)
 *   - admin_users 매칭 → /console/home
 *   - active member → /home
 *   - 그 외 (초대 수락 필요) → /accept-invite
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next')

  if (!code && !tokenHash) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('인증 토큰이 없습니다. 메일의 링크를 다시 클릭해 주세요.')}`,
    )
  }

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent('인증에 실패했습니다. 링크가 만료되었을 수 있습니다.')}`,
      )
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent('초대 링크가 만료되었거나 이미 사용되었습니다. 관리자에게 재발송을 요청하세요.')}`,
      )
    }
  } else {
    // token_hash 만 있고 type 없음 — 불완전한 링크
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('인증 정보가 불완전합니다.')}`,
    )
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('세션을 만들 수 없습니다.')}`,
    )
  }

  // ?next 가 명시된 경우 (recovery / 명시적 라우팅) 우선 처리.
  // admin 의 reset → /console/reset-password/confirm
  // 고객의 reset → /reset-password/confirm
  if (next) {
    return NextResponse.redirect(`${origin}${next}`)
  }

  // admin 분기
  const { data: admin } = await supabase
    .from('admin_users')
    .select('id, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (admin) {
    // 첫 로그인 휴리스틱: created_at 과 last_sign_in_at 의 차이가 1분 이내면
    // invite 직후 — 비번 설정 화면으로.
    const created = new Date(user.created_at).getTime()
    const lastSignIn = user.last_sign_in_at
      ? new Date(user.last_sign_in_at).getTime()
      : created
    const isFirstSignIn = lastSignIn - created < 60_000

    if (isFirstSignIn) {
      return NextResponse.redirect(`${origin}/console/accept-invite`)
    }
    return NextResponse.redirect(`${origin}/console/home`)
  }

  // active member 면 /home
  const { data: activeMember } = await supabase
    .from('members')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (activeMember) {
    return NextResponse.redirect(`${origin}/home`)
  }

  // 그 외 — 초대 수락 / 비밀번호 설정 페이지
  return NextResponse.redirect(`${origin}/accept-invite`)
}
