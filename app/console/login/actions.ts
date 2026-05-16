'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/** supabase auth error 를 사용자 친화 메시지로 변환. */
function mapLoginError(err: { code?: string; message?: string }): string {
  switch (err.code) {
    case 'invalid_credentials':
      return '이메일 또는 비밀번호가 올바르지 않습니다.'
    case 'email_not_confirmed':
      return '이메일 인증이 완료되지 않았습니다. 관리자에게 문의하세요.'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return '시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.'
    case 'user_banned':
      return '비활성화된 계정입니다. 관리자에게 문의하세요.'
    default:
      return '로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  }
}

/** 매 시도마다 다른 nonce 를 붙여 페이지가 같은 에러여도 흔들림 애니메이션을 다시 재생하도록. */
function loginRedirect(params: Record<string, string>): never {
  const usp = new URLSearchParams(params)
  usp.set('t', Date.now().toString(36))
  redirect(`/console/login?${usp.toString()}`)
}

export async function adminLogin(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const step = formData.get('step') as string

  if (step === '2') {
    const totp = formData.get('totp') as string
    if (!totp || totp.length !== 6) {
      loginRedirect({ step: '2', error: '올바른 6자리 코드를 입력하세요.' })
    }

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: totp,
      type: 'email' as const,
    })

    if (error || !data.user) {
      loginRedirect({ step: '2', error: '인증 코드가 올바르지 않습니다.' })
    }

    redirect('/console/home')
  }

  // Step 1: 이메일 + 비밀번호
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    loginRedirect({ error: mapLoginError(error) })
  }

  // 2FA 강제 정책 (role별)
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('role, totp_secret')
    .eq('email', email)
    .eq('is_active', true)
    .single()

  // 보안: super / finance는 2FA 필수 (PB-005 감사 대상 접근 권한)
  // CONSOLE_2FA_REQUIRED=false 일 때만 일시적으로 우회. 기본은 강제 유지.
  const enforce2fa = process.env.CONSOLE_2FA_REQUIRED !== 'false'
  const requires2fa = enforce2fa && (adminUser?.role === 'super' || adminUser?.role === 'finance')
  if (requires2fa && !adminUser?.totp_secret) {
    loginRedirect({ error: 'Super/Finance 계정은 2FA 등록이 필요합니다. 관리자에게 문의하세요.' })
  }

  if (adminUser?.totp_secret) {
    redirect(`/console/login?step=2`)
  }

  redirect('/console/home')
}
