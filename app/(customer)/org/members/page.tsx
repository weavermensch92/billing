import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDate } from '@/lib/utils/format'
import type { Member } from '@/types/billing.types'

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
}

const ROLE_COLOR: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  member: 'bg-gray-100 text-gray-700',
}

export default async function OrgMembersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentMember } = await supabase
    .from('members')
    .select('id, org_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!currentMember) redirect('/login')

  const canManage = currentMember.role === 'owner' || currentMember.role === 'admin'

  const { data: members } = await supabase
    .from('members')
    .select('*')
    .eq('org_id', currentMember.org_id)
    .neq('status', 'offboarded')
    .order('role', { ascending: true })
    .order('created_at', { ascending: true })

  const list = (members ?? []) as Member[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">멤버 관리</h1>
          <p className="text-sm text-gray-500 mt-1">조직 구성원을 초대하고 역할을 관리합니다.</p>
        </div>
        {canManage && (
          <Link
            href="/org/members/new"
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            + 멤버 초대
          </Link>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">이름</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">이메일</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">역할</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">상태</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">가입일</th>
              {canManage && <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium">
                  {m.name}
                  {m.id === currentMember.id && (
                    <span className="ml-2 text-xs text-brand-600">(나)</span>
                  )}
                </td>
                <td className="px-6 py-3 text-gray-600">{m.email}</td>
                <td className="px-6 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLOR[m.role]}`}>
                    {ROLE_LABEL[m.role]}
                  </span>
                </td>
                <td className="px-6 py-3"><StatusBadge status={m.status} /></td>
                <td className="px-6 py-3 text-gray-500">
                  {m.joined_at ? formatDate(m.joined_at) : m.invited_at ? `초대일: ${formatDate(m.invited_at)}` : formatDate(m.created_at)}
                </td>
                {canManage && (
                  <td className="px-6 py-3 text-right">
                    {m.role !== 'owner' && m.id !== currentMember.id && m.status === 'active' && (
                      <Link
                        href={`/org/members/${m.id}/offboarding`}
                        className="text-xs text-red-600 hover:underline"
                      >
                        오프보딩
                      </Link>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {currentMember.role === 'owner' && (
        <div className="text-xs text-gray-500">
          Owner는 조직당 1명만 가능합니다. 양도하려면{' '}
          <Link href="/settings/security" className="text-brand-600 hover:underline">설정 → 보안</Link>에서 진행하세요.
        </div>
      )}
    </div>
  )
}
