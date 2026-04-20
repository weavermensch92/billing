'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function adminLogin(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const step = formData.get('step') as string

  if (step === '2') {
    // Phase 0: TOTP 검증 로직 (Supabase MFA)
    // Phase 1에서 완전한 TOTP 구현
    const totp = formData.get('totp') as string
    if (!totp || totp.length !== 6) {
      redirect('/console/login?step=2&error=올바른 6자리 코드를 입력하세요.')
    }

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: totp,
      type: 'email' as const,
    })

    if (error || !data.user) {
      redirect('/console/login?step=2&error=인증 코드가 올바르지 않습니다.')
    }

    redirect('/console/home')
  }

  // Step 1: 이메일 + 비밀번호
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    redirect('/console/login?error=이메일 또는 비밀번호가 올바르지 않습니다.')
  }

  // 2FA 강제 정책 (role별)
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('role, totp_secret')
    .eq('email', email)
    .eq('is_active', true)
    .single()

  // 보안: super / finance는 2FA 필수 (PB-005 감사 대상 접근 권한)
  const requires2fa = adminUser?.role === 'super' || adminUser?.role === 'finance'
  if (requires2fa && !adminUser?.totp_secret) {
    redirect('/console/login?error=Super/Finance 계정은 2FA 등록이 필요합니다. 관리자에게 문의하세요.')
  }

  if (adminUser?.totp_secret) {
    redirect(`/console/login?step=2`)
  }

  redirect('/console/home')
}
