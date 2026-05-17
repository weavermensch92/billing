import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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

export default async function WorkspacesPage() {
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

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">벤더 워크스페이스</h1>
          <p className="text-sm text-gray-500 mt-1">
            Anthropic Console / OpenAI Platform 등 벤더 측 워크스페이스 등록 현황. M-2001 / PRD §3 Q1.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <span>활성 <span className="font-mono">{activeCount}</span></span>
          <span>전체 <span className="font-mono">{list.length}</span></span>
          <span className="text-gray-500">멤버 합 <span className="font-mono">{totalMemberCount}</span></span>
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
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr>
              <td colSpan={8} className="py-12 text-center text-gray-400">
                등록된 워크스페이스 없음 · 후속 PR (M-2003) 에서 등록 액션 활성화 예정.
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
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="text-xs text-gray-500 border-l-[3px] border-l-gray-300 pl-3 py-2 space-y-1">
        <p>
          본 화면은 <code className="font-mono text-xs">vendor_workspaces</code> 테이블 (M-2001) +{' '}
          <code className="font-mono text-xs">workspace_members</code> (M-2002) 의 read-only 뷰.
        </p>
        <p>
          생성/수정/멤버 등록은 후속 마이그레이션 M-2003 (accounts.kind / workspace_id) 이후 활성화.
          현재 row 는 기존 <code className="font-mono text-xs">vendor_invoices.vendor_workspace_id</code> 로부터
          자동 backfill 됨.
        </p>
      </div>
    </div>
  )
}
