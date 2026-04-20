'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

const VALID_TYPES = ['full_zip', 'invoices_csv', 'transactions_csv', 'audit_csv', 'tax_invoices_pdf'] as const

export async function requestExport(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members').select('id, org_id, role').eq('user_id', user.id).eq('status', 'active').single()
  if (!member) redirect('/login')

  if (member.role !== 'owner') {
    redirect('/settings/data-export?error=Owner 권한이 필요합니다.')
  }

  const export_type = formData.get('export_type') as string
  if (!VALID_TYPES.includes(export_type as (typeof VALID_TYPES)[number])) {
    redirect('/settings/data-export?error=유효하지 않은 내보내기 유형입니다.')
  }

  // 주당 1회 제한 (full_zip)
  if (export_type === 'full_zip') {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { count } = await supabase
      .from('export_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', member.org_id)
      .eq('export_type', 'full_zip')
      .gte('created_at', oneWeekAgo)

    if ((count ?? 0) >= 1) {
      redirect('/settings/data-export?error=전체 ZIP은 주당 1회만 요청할 수 있습니다.')
    }
  }

  // 작업 생성 (실제 처리는 Phase 0 수동 / Phase 1 Edge Function)
  const { error } = await supabase.from('export_jobs').insert({
    org_id: member.org_id,
    requested_by: member.id,
    export_type,
    status: 'pending',
  })

  if (error) {
    redirect(`/settings/data-export?error=${encodeURIComponent('요청 실패: ' + error.message)}`)
  }

  revalidatePath('/settings/data-export')
  redirect('/settings/data-export?success=요청이 접수되었습니다. 처리 완료 시 이메일로 알려드립니다.')
}
