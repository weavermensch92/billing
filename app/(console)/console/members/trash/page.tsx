import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { restoreFromTrash } from '../actions'
import { formatDate } from '@/lib/utils/format'

type DeletedMember = {
  id: string
  org_id: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'member'
  status: string
  deleted_at: string
  deleted_by_admin_id: string | null
  org: { name: string } | null
  deleted_by: { name: string; email: string } | null
}

export default async function ConsoleMembersTrashPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string }
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
    redirect('/console/home?error=' + encodeURIComponent('Super 전용'))
  }

  const { data: deletedRaw } = await supabase
    .from('members')
    .select('id, org_id, email, name, role, status, deleted_at, deleted_by_admin_id, org:orgs!org_id(name), deleted_by:admin_users!deleted_by_admin_id(name, email)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .limit(500)

  const deleted = (deletedRaw ?? []) as unknown as DeletedMember[]

  return (
    <div className="space-y-6">
      <div>
        <Link href="/console/members" className="text-xs text-gray-500 hover:text-gray-700">
          ← 전체 멤버
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">🗑 삭제함</h1>
        <p className="text-sm text-gray-500 mt-1">
          소프트 삭제된 멤버. 복구 시 deleted_at 클리어. 동일 (org, email) 로 재초대 시 자동 복원.
        </p>
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

      <div className="card overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100 text-xs text-gray-500">
          삭제함 총 {deleted.length} 건
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">이름</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">이메일</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">조직</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">역할</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">삭제일</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">삭제자</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {deleted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                  삭제함이 비어 있습니다.
                </td>
              </tr>
            )}
            {deleted.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-500 line-through">{m.name}</td>
                <td className="px-4 py-2 text-gray-500 font-mono text-xs">{m.email}</td>
                <td className="px-4 py-2 text-gray-600">
                  <Link href={`/console/orgs/${m.org_id}?tab=members`} className="hover:underline">
                    {m.org?.name ?? m.org_id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Admin' : 'Member'}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">{formatDate(m.deleted_at)}</td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {m.deleted_by?.name ?? '—'}
                </td>
                <td className="px-4 py-2 text-right">
                  <form action={restoreFromTrash} className="inline">
                    <input type="hidden" name="member_id" value={m.id} />
                    <button
                      type="submit"
                      className="text-xs text-brand-600 hover:underline"
                    >
                      복구
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
