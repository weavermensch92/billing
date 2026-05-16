import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

interface SyncJob {
  id: string
  vendor: string
  org_id: string
  status: string
  started_at: string
  finished_at: string | null
  added_count: number | null
  removed_count: number | null
  unchanged_count: number | null
  org?: { name?: string }
}

interface PendingApproval {
  account_id: string
  org_id: string
  vendor: string
  email: string | null
  pending_approval_until: string
  hours_until_auto_approve: number
}

export default async function ConsoleSyncPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: admin } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!admin) redirect('/console/login')

  const [jobsRes, pendingRes] = await Promise.all([
    supabase
      .from('member_sync_jobs')
      .select('id, vendor, org_id, status, started_at, finished_at, added_count, removed_count, unchanged_count, org:orgs(name)')
      .order('started_at', { ascending: false })
      .limit(30),
    supabase
      .from('v_pending_approvals')
      .select('*')
      .order('pending_approval_until', { ascending: true })
      .limit(30),
  ])

  const jobs = (jobsRes.data ?? []) as SyncJob[]
  const pending = (pendingRes.data ?? []) as PendingApproval[]

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">멤버 sync</h1>
        <div className="text-sm text-gray-500">24h 검수 대기 {pending.length}건</div>
      </div>

      {pending.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">24h 검수 대기 (f3)</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500 border-b">
              <tr>
                <th className="py-2">벤더</th>
                <th className="py-2">이메일</th>
                <th className="py-2">검수 만료</th>
                <th className="py-2 text-right">자동 active까지</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.account_id} className="border-b border-gray-100">
                  <td className="py-2">{p.vendor}</td>
                  <td className="py-2">{p.email ?? '–'}</td>
                  <td className="py-2 font-mono text-xs">{new Date(p.pending_approval_until).toLocaleString('ko-KR')}</td>
                  <td className="py-2 text-right font-mono">{p.hours_until_auto_approve}h</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-xs text-gray-500 mt-2">
            고객 어드민이 24h 내 결정 또는 자동 active 전이 (관대 모드).
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium mb-3">최근 sync 이력</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500 border-b">
            <tr>
              <th className="py-2">시작</th>
              <th className="py-2">Org</th>
              <th className="py-2">벤더</th>
              <th className="py-2">상태</th>
              <th className="py-2 text-right">추가</th>
              <th className="py-2 text-right">삭제</th>
              <th className="py-2 text-right">유지</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-gray-400">sync 이력 없음</td></tr>}
            {jobs.map((j) => (
              <tr key={j.id} className="border-b border-gray-100">
                <td className="py-2 font-mono text-xs">{new Date(j.started_at).toLocaleString('ko-KR')}</td>
                <td className="py-2">{j.org?.name ?? j.org_id.slice(0, 8)}</td>
                <td className="py-2">{j.vendor}</td>
                <td className="py-2"><JobStatus status={j.status} /></td>
                <td className="py-2 text-right font-mono">{j.added_count ?? 0}</td>
                <td className="py-2 text-right font-mono">{j.removed_count ?? 0}</td>
                <td className="py-2 text-right font-mono text-gray-400">{j.unchanged_count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="text-xs text-gray-500 border-l-[3px] border-l-gray-300 pl-3 py-2">
        1h cron이 모든 활성 vendor_admin_token으로 멤버 sync. 신규 발견 시 24h 검수 (M-1012).
      </div>
    </div>
  )
}

function JobStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: 'text-yellow-700 bg-yellow-50',
    completed: 'text-green-700 bg-green-50',
    failed: 'text-red-700 bg-red-50',
  }
  return <span className={`px-2 py-0.5 text-xs ${map[status] ?? 'text-gray-600 bg-gray-50'}`}>{status}</span>
}
