'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function requestReset(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const next = '/console/reset-password/confirm'
  const redirectTo = `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  if (error) {
    redirect('/console/reset-password/request?error=' + encodeURIComponent('이메일 전송에 실패했습니다.'))
  }

  redirect(
    '/console/reset-password/request?message=' +
      encodeURIComponent('재설정 링크를 이메일로 보냈습니다. 메일함을 확인해 주세요.'),
  )
}
