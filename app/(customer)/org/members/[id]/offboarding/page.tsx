import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { OffboardingWizard } from './wizard'
import type { Account } from '@/types/billing.types'

interface AccountForOffboarding {
  id: string
  status: string
  monthly_limit_krw: number
  service: { name: string; vendor: string } | null
}

export default async function OffboardingPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { error?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentMember } = await supabase
    .from('members').select('id, org_id, role').eq('user_id', user.id).eq('status', 'active').single()

  if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
    redirect('/org/members?error=권한이 없습니다.')
  }

  const { data: targetMember } = await supabase
    .from('members').select('*').eq('id', params.id).eq('org_id', currentMember.org_id).single()

  if (!targetMember) notFound()

  if (targetMember.role === 'owner') {
    return (
      <div className="max-w-xl mx-auto card p-8 text-center">
        <p className="text-sm text-gray-700">Owner는 오프보딩할 수 없습니다.</p>
        <p className="text-sm text-gray-500 mt-2">먼저 다른 멤버에게 Owner를 양도하세요.</p>
        <Link href="/org/members" className="mt-4 inline-block text-sm text-brand-600 hover:underline">
          멤버 관리로 돌아가기
        </Link>
      </div>
    )
  }

  // 대상 멤버의 활성 계정 목록
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, status, monthly_limit_krw, service:services!service_id(name, vendor)')
    .eq('org_id', currentMember.org_id)
    .eq('member_id', params.id)
    .eq('status', 'active')

  const accountList = (accounts ?? []) as unknown as AccountForOffboarding[]

  // 조직의 다른 active 멤버 (이관 대상 후보)
  const { data: transferCandidates } = await supabase
    .from('members')
    .select('id, name, email, role')
    .eq('org_id', currentMember.org_id)
    .eq('status', 'active')
    .neq('id', params.id)
    .order('role')
    .order('name')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/org/members" className="text-sm text-gray-500 hover:text-gray-700">
        ← 멤버 관리
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">멤버 오프보딩</h1>
        <p className="text-sm text-gray-500 mt-1">
          <strong>{targetMember.name}</strong> ({targetMember.email}) — {accountList.length}개 활성 계정
        </p>
      </div>

      {searchParams.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      <OffboardingWizard
        targetMember={{ id: targetMember.id, name: targetMember.name, email: targetMember.email }}
        accounts={accountList}
        transferCandidates={(transferCandidates ?? []) as { id: string; name: string; email: string; role: string }[]}
      />
    </div>
  )
}
