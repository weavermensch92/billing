'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function requestCustomerReset(formData: FormData) {
  const supabase = await createClient()
  const email = (formData.get('email') as string ?? '').trim().toLowerCase()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(
      '/reset-password/request?error=' +
        encodeURIComponent('이메일 형식이 올바르지 않습니다.'),
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const next = '/reset-password/confirm'
  const redirectTo = `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  // 에러를 사용자에게 직접 노출하지 않음 (이메일 존재 여부 추적 방지).
  // 발송 실패 시에도 동일 성공 메시지로 안내.
  if (error) {
    console.error('[requestCustomerReset]', error)
  }

  redirect(
    '/reset-password/request?message=' +
      encodeURIComponent('해당 이메일이 등록되어 있다면 재설정 링크가 발송됩니다. 메일함을 확인해 주세요.'),
  )
}
