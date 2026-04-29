import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RequestWizard } from './wizard'
import type { ActionType } from '@/types/billing.types'
import type { WizardAccount } from '@/types/request.types'

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: { type?: ActionType; account_id?: string; error?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, org_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!member) redirect('/login')

  const [servicesRes, membersRes, accountsRes, orgRes] = await Promise.all([
    supabase.from('services').select('id, name, vendor, category, tos_review_status, unit_price_krw')
      .in('tos_review_status', ['approved','conditional'])
      .eq('is_active', true)
      .order('vendor'),
    supabase.from('members').select('id, name, email, role').eq('org_id', member.org_id)
      .in('status', ['active']).order('role'),
    supabase.from('accounts')
      .select('id, status, monthly_limit_krw, service:services!service_id(name, vendor), member:members!member_id(name)')
      .eq('org_id', member.org_id).eq('status', 'active'),
    supabase.from('orgs').select('self_approval_headroom_krw, self_approval_used_krw').eq('id', member.org_id).single(),
  ])

  const headroom = (orgRes.data as { self_approval_headroom_krw?: number; self_approval_used_krw?: number } | null) ?? {}
  const headroomKrw = headroom.self_approval_headroom_krw ?? 0
  const headroomUsed = headroom.self_approval_used_krw ?? 0
  const remainingKrw = Math.max(0, headroomKrw - headroomUsed)

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">신규 요청</h1>
        <p className="text-sm text-gray-500 mt-1">
          Service-First UX — 고객은 요청만, AM이 실행합니다.
        </p>
      </div>

      {searchParams.error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      <RequestWizard
        initialType={searchParams.type}
        initialAccountId={searchParams.account_id}
        services={servicesRes.data ?? []}
        members={membersRes.data ?? []}
        accounts={(accountsRes.data ?? []) as unknown as WizardAccount[]}
        currentMemberRole={member.role as 'owner' | 'admin' | 'member'}
        headroomKrw={headroomKrw}
        headroomRemainingKrw={remainingKrw}
      />
    </div>
  )
}

