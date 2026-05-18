'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function confirmCustomerReset(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(
      '/reset-password/request?error=' +
        encodeURIComponent('세션이 만료되었습니다. 재설정 링크를 다시 요청해 주세요.'),
    )
  }

  const password = (formData.get('password') as string) ?? ''
  const passwordConfirm = (formData.get('password_confirm') as string) ?? ''

  if (password.length < 8) {
    redirect(
      '/reset-password/confirm?error=' +
        encodeURIComponent('비밀번호는 8자 이상이어야 합니다.'),
    )
  }
  if (password !== passwordConfirm) {
    redirect(
      '/reset-password/confirm?error=' +
        encodeURIComponent('두 비밀번호가 일치하지 않습니다.'),
    )
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    redirect(
      '/reset-password/confirm?error=' +
        encodeURIComponent('비밀번호 변경에 실패했습니다. 다시 시도해 주세요.'),
    )
  }

  await supabase.auth.signOut()
  redirect(
    '/login?message=' +
      encodeURIComponent('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.'),
  )
}
