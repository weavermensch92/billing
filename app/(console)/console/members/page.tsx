import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { softDeleteMember } from './actions'

type MemberRow = {
  id: string
  org_id: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'member'
  status: string
  user_id: string | null
  invited_at: string | null
  created_at: string
  deleted_at: string | null
  org: { name: string } | null
}

export default async function ConsoleMembersPage({
  searchParams,
}: {
  searchParams: { q?: string; role?: string; status?: string; ok?: string; error?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: me } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!me) redirect('/console/login')
  if (me.role !== 'super') {
    redirect('/console/home?error=' + encodeURIComponent('멤버 관리는 Super 전용'))
  }

  const q = (searchParams.q ?? '').trim().toLowerCase()
  const roleFilter = searchParams.role ?? ''
  const statusFilter = searchParams.status ?? ''

  let query = supabase
    .from('members')
    .select('id, org_id, email, name, role, status, user_id, invited_at, created_at, deleted_at, org:orgs!org_id(name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (q) query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`)
  if (roleFilter === 'owner' || roleFilter === 'admin' || roleFilter === 'member') {
    query = query.eq('role', roleFilter)
  }
  if (statusFilter === 'invited' || statusFilter === 'active' || statusFilter === 'offboarded' || statusFilter === 'suspended') {
    query = query.eq('status', statusFilter)
  }

  const { data: membersRaw, error } = await query
  const members = (membersRaw ?? []) as unknown as MemberRow[]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">전체 멤버</h1>
          <p className="text-sm text-gray-500 mt-1">
            모든 Org 의 멤버를 통합 조회. 수정 / 삭제 (삭제함 이동) 가능. 삭제된 멤버는 <Link href="/console/members/trash" className="text-brand-600 hover:underline">삭제함</Link> 에서 복구.
          </p>
        </div>
        <Link
          href="/console/members/trash"
          className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
        >
          🗑 삭제함
        </Link>
      </div>

      {searchParams.ok && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          {searchParams.ok}
        </div>
      )}
      {searchParams.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      <form method="GET" className="card p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1">검색 (이메일 / 이름)</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="alice@acme.com 또는 김앨리스"
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">역할</label>
          <select
            name="role"
            defaultValue={roleFilter}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">전체</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">상태</label>
          <select
            name="status"
            defaultValue={statusFilter}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">전체</option>
            <option value="invited">invited</option>
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="offboarded">offboarded</option>
          </select>
        </div>
        <button
          type="submit"
          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg"
        >
          검색
        </button>
        <Link
          href="/console/members"
          className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          초기화
        </Link>
      </form>

      <div className="card overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100 text-xs text-gray-500">
          총 {members.length} 명{members.length === 500 && ' (상한 도달 — 검색으로 좁히세요)'}
          {error && <span className="text-red-600 ml-2">조회 오류: {error.message}</span>}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">이름</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">이메일</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">조직</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">역할</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">상태</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                  조건에 맞는 멤버가 없습니다.
                </td>
              </tr>
            )}
            {members.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{m.name}</td>
                <td className="px-4 py-2 text-gray-600 font-mono text-xs">{m.email}</td>
                <td className="px-4 py-2 text-gray-600">
                  <Link href={`/console/orgs/${m.org_id}?tab=members`} className="hover:underline">
                    {m.org?.name ?? m.org_id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <span className={`text-xs font-medium ${m.role === 'owner' ? 'text-brand-600' : 'text-gray-600'}`}>
                    {m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Admin' : 'Member'}
                  </span>
                </td>
                <td className="px-4 py-2"><StatusBadge status={m.status} /></td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/console/members/${m.id}/edit`}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      수정
                    </Link>
                    <form action={softDeleteMember} className="inline">
                      <input type="hidden" name="member_id" value={m.id} />
                      <button
                        type="submit"
                        className="text-xs text-red-600 hover:underline"
                      >
                        삭제
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
