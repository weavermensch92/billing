'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/** supabase auth error 를 사용자 친화 메시지로 변환. */
function mapLoginError(err: { code?: string; message?: string }): string {
  switch (err.code) {
    case 'invalid_credentials':
      return '이메일 또는 비밀번호가 올바르지 않습니다.'
    case 'email_not_confirmed':
      return '이메일 인증이 완료되지 않았습니다. 초대 메일의 링크를 먼저 클릭해 주세요.'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return '시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.'
    case 'user_banned':
      return '비활성화된 계정입니다. 관리자에게 문의하세요.'
    default:
      return '로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  }
}

function loginRedirect(params: Record<string, string>): never {
  const usp = new URLSearchParams(params)
  usp.set('t', Date.now().toString(36))
  redirect(`/login?${usp.toString()}`)
}

/** 비밀번호 로그인 (기본 경로). 초대 수락 후 /accept-invite 에서 비밀번호를 설정한 사용자가 사용. */
export async function loginWithPassword(formData: FormData) {
  const supabase = await createClient()
  const email = (formData.get('email') as string).toLowerCase().trim()
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    loginRedirect({ error: mapLoginError(error) })
  }

  redirect('/home')
}

/** 매직 링크 (보조 경로 — 비밀번호 분실 / 초대 수락). */
export async function loginWithMagicLink(formData: FormData) {
  const supabase = await createClient()
  const email = (formData.get('email') as string).toLowerCase().trim()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // 가입 미허용 — 초대된 사용자만 받음 (Supabase Auth 설정: Enable email signups OFF 권장)
      shouldCreateUser: false,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })

  if (error) {
    loginRedirect({ error: '이메일 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.' })
  }

  loginRedirect({ message: '로그인 링크를 이메일로 보냈습니다. 확인해 주세요.' })
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
