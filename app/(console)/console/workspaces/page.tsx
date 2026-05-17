import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { updateWorkspaceStatus } from './actions'

interface WorkspaceRow {
  id: string
  org_id: string
  vendor_workspace_id: string
  display_name: string
  status: 'active' | 'suspended' | 'terminated'
  created_at: string
  org: { name: string } | null
  service: { name: string; vendor: string } | null
  members: Array<{ id: string; left_at: string | null }>
}

const STATUS_LABEL: Record<WorkspaceRow['status'], { label: string; color: string }> = {
  active:     { label: '활성',   color: 'text-green-700 bg-green-50' },
  suspended:  { label: '정지',   color: 'text-yellow-700 bg-yellow-50' },
  terminated: { label: '종료',   color: 'text-gray-600 bg-gray-100' },
}

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string; created?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: admin } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!admin) redirect('/console/login')

  const { data: rows } = await supabase
    .from('vendor_workspaces')
    .select(`
      id, org_id, vendor_workspace_id, display_name, status, created_at,
      org:orgs ( name ),
      service:services ( name, vendor ),
      members:workspace_members ( id, left_at )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  const list = (rows ?? []) as WorkspaceRow[]
  const activeCount = list.filter((r) => r.status === 'active').length
  const totalMemberCount = list.reduce(
    (sum, r) => sum + r.members.filter((m) => m.left_at === null).length,
    0,
  )

  const isSuper = admin.role === 'super'

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      {(searchParams.error || searchParams.ok || searchParams.created) && (
        <div
          className={`border-l-[3px] pl-3 py-2 text-sm ${
            searchParams.error
              ? 'border-l-red-500 text-red-700 bg-red-50'
              : 'border-l-green-500 text-green-700 bg-green-50'
          }`}
        >
          {searchParams.error
            ? decodeURIComponent(searchParams.error)
            : searchParams.created
              ? `"${decodeURIComponent(searchParams.created)}" 워크스페이스가 등록됐습니다.`
              : decodeURIComponent(searchParams.ok ?? '')}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">벤더 워크스페이스</h1>
          <p className="text-sm text-gray-500 mt-1">
            Anthropic Console / OpenAI Platform 등 벤더 측 워크스페이스 등록 현황.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-3 text-sm text-gray-600">
            <span>활성 <span className="font-mono">{activeCount}</span></span>
            <span>전체 <span className="font-mono">{list.length}</span></span>
            <span>멤버 합 <span className="font-mono">{totalMemberCount}</span></span>
          </div>
          {isSuper && (
            <Link
              href="/console/workspaces/new"
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              + 새 워크스페이스
            </Link>
          )}
        </div>
      </div>

      <table className="w-full text-sm bg-white rounded border border-gray-200">
        <thead className="text-left text-xs text-gray-500 border-b">
          <tr>
            <th className="py-2 px-3">벤더</th>
            <th className="py-2 px-3">Org</th>
            <th className="py-2 px-3">서비스</th>
            <th className="py-2 px-3">Workspace ID</th>
            <th className="py-2 px-3">표시명</th>
            <th className="py-2 px-3 text-right">활성 멤버</th>
            <th className="py-2 px-3">상태</th>
            <th className="py-2 px-3">생성</th>
            {isSuper && <th className="py-2 px-3">액션</th>}
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr>
              <td colSpan={isSuper ? 9 : 8} className="py-12 text-center text-gray-400">
                등록된 워크스페이스 없음
              </td>
            </tr>
          )}
          {list.map((r) => {
            const activeMembers = r.members.filter((m) => m.left_at === null).length
            const stat = STATUS_LABEL[r.status]
            return (
              <tr key={r.id} className="border-b border-gray-100">
                <td className="py-2 px-3">{r.service?.vendor ?? '-'}</td>
                <td className="py-2 px-3">{r.org?.name ?? r.org_id.slice(0, 8)}</td>
                <td className="py-2 px-3">{r.service?.name ?? '-'}</td>
                <td className="py-2 px-3 font-mono text-xs text-gray-600">
                  {r.vendor_workspace_id}
                </td>
                <td className="py-2 px-3">{r.display_name}</td>
                <td className="py-2 px-3 text-right font-mono">{activeMembers}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 text-xs ${stat.color}`}>{stat.label}</span>
                </td>
                <td className="py-2 px-3 font-mono text-xs text-gray-500">
                  {r.created_at.slice(0, 10)}
                </td>
                {isSuper && (
                  <td className="py-2 px-3">
                    <form action={updateWorkspaceStatus} className="flex items-center gap-1">
                      <input type="hidden" name="workspace_id" value={r.id} />
                      <select
                        name="status"
                        defaultValue={r.status}
                        className="text-xs border border-gray-200 rounded px-1 py-0.5"
                      >
                        <option value="active">활성</option>
                        <option value="suspended">정지</option>
                        <option value="terminated">종료</option>
                      </select>
                      <button
                        type="submit"
                        className="text-xs text-blue-600 hover:underline px-1"
                      >
                        변경
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="text-xs text-gray-500 border-l-[3px] border-l-gray-300 pl-3 py-2">
        <p>
          <code className="font-mono text-xs">vendor_workspaces</code> ×{' '}
          <code className="font-mono text-xs">workspace_members</code> 테이블 기반.
          멤버 등록은 accounts 화면에서 workspace 연결 후 가능.
        </p>
      </div>
    </div>
  )
}
