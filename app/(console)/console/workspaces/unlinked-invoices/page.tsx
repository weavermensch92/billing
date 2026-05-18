import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/format'
import { vendorLabel } from '@/lib/vendor-api/catalog'
import { linkInvoiceToWorkspace } from './actions'

interface UnlinkedRow {
  id: string
  org_id: string
  vendor: string
  external_workspace_id: string | null
  billing_period_start: string
  billing_period_end: string
  total_krw: number | null
  source_type: string
  fetched_at: string
}

interface WorkspaceOption {
  id: string
  org_id: string
  vendor_workspace_id: string
  display_name: string
  service: { vendor?: string } | { vendor?: string }[] | null
}

export default async function UnlinkedInvoicesPage({
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
    redirect('/console/workspaces?error=' + encodeURIComponent('Super 전용'))
  }

  const [unlinkedRes, workspacesRes] = await Promise.all([
    supabase
      .from('v_vendor_invoices_unlinked')
      .select('id, org_id, vendor, external_workspace_id, billing_period_start, billing_period_end, total_krw, source_type, fetched_at')
      .order('fetched_at', { ascending: false })
      .limit(500),
    supabase
      .from('vendor_workspaces')
      .select('id, org_id, vendor_workspace_id, display_name, service:services(vendor)')
      .eq('status', 'active')
      .order('display_name'),
  ])

  const unlinked = (unlinkedRes.data ?? []) as UnlinkedRow[]
  const workspaces = (workspacesRes.data ?? []) as unknown as WorkspaceOption[]

  // (org_id + vendor) 매칭 후보만 폼에 표시
  function candidates(row: UnlinkedRow): WorkspaceOption[] {
    return workspaces.filter(w => {
      if (w.org_id !== row.org_id) return false
      const v = Array.isArray(w.service) ? w.service[0]?.vendor : w.service?.vendor
      return !v || v === row.vendor
    })
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div>
        <Link href="/console/workspaces" className="text-xs text-gray-500 hover:text-gray-700">
          ← 벤더 워크스페이스
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">미연결 청구서 정리</h1>
        <p className="text-sm text-gray-500 mt-1">
          <code className="font-mono text-xs bg-gray-100 px-1 rounded">v_vendor_invoices_unlinked</code> 뷰 — vendor_invoices 가 가진 외부 workspace_id 가
          {' '}<code className="font-mono text-xs bg-gray-100 px-1 rounded">vendor_workspaces</code> 와 매칭되지 않은 청구서 목록. Super 가 수동으로 워크스페이스에 연결 (M-2005 정합성 가드: 연결 후 재할당 차단).
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
          {unlinked.length} 건
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
              <th className="text-left py-2 px-3">Org</th>
              <th className="text-left py-2 px-3">벤더</th>
              <th className="text-left py-2 px-3">외부 Workspace ID</th>
              <th className="text-left py-2 px-3">기간</th>
              <th className="text-right py-2 px-3">금액</th>
              <th className="text-left py-2 px-3">수신</th>
              <th className="text-left py-2 px-3">매칭 후보 → 연결</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {unlinked.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-gray-400">
                  미연결 청구서 없음 — 모든 청구서가 워크스페이스에 매칭됐습니다.
                </td>
              </tr>
            )}
            {unlinked.map(row => {
              const cs = candidates(row)
              return (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="py-2 px-3 font-mono text-xs">{row.org_id.slice(0, 8)}</td>
                  <td className="py-2 px-3 text-xs">{vendorLabel(row.vendor)}</td>
                  <td className="py-2 px-3 font-mono text-xs">{row.external_workspace_id ?? '—'}</td>
                  <td className="py-2 px-3 text-xs">{row.billing_period_start} ~ {row.billing_period_end}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs">
                    {row.total_krw == null ? '—' : `₩${row.total_krw.toLocaleString('ko-KR')}`}
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-500">{formatDate(row.fetched_at)}</td>
                  <td className="py-2 px-3">
                    {cs.length === 0 ? (
                      <span className="text-xs text-gray-400">매칭 후보 없음 — 워크스페이스 먼저 등록</span>
                    ) : (
                      <form action={linkInvoiceToWorkspace} className="flex items-center gap-2">
                        <input type="hidden" name="invoice_id" value={row.id} />
                        <select
                          name="workspace_id"
                          required
                          defaultValue=""
                          className="text-xs border border-gray-200 rounded px-2 py-1 max-w-[280px]"
                        >
                          <option value="" disabled>워크스페이스 선택</option>
                          {cs.map(w => (
                            <option key={w.id} value={w.id}>
                              {w.display_name} · {w.vendor_workspace_id}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="text-xs text-blue-700 hover:underline"
                        >
                          연결
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
