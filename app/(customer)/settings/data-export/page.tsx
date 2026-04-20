import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDateTime } from '@/lib/utils/format'
import { requestExport } from './actions'

interface ExportJob {
  id: string
  export_type: string
  status: string
  download_url: string | null
  expires_at: string
  created_at: string
  completed_at: string | null
  download_count: number
}

const TYPE_LABEL: Record<string, string> = {
  full_zip:          '전체 데이터 (ZIP)',
  invoices_csv:      '청구서 (CSV)',
  transactions_csv:  '결제 내역 (CSV)',
  audit_csv:         '감사 로그 (CSV)',
  tax_invoices_pdf:  '세금계산서 (PDF)',
}

export default async function DataExportPage({
  searchParams,
}: {
  searchParams: { error?: string; success?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members').select('org_id, role').eq('user_id', user.id).eq('status', 'active').single()
  if (!member) redirect('/login')

  if (member.role !== 'owner') {
    return (
      <div className="card p-12 text-center">
        <p className="text-sm text-gray-500">데이터 내보내기는 Owner만 요청할 수 있습니다.</p>
      </div>
    )
  }

  const { data: jobs } = await supabase
    .from('export_jobs')
    .select('id, export_type, status, download_url, expires_at, created_at, completed_at, download_count')
    .eq('org_id', member.org_id)
    .order('created_at', { ascending: false })
    .limit(20)

  const list = (jobs ?? []) as ExportJob[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">데이터 내보내기</h1>
        <p className="text-sm text-gray-500 mt-1">
          조직의 데이터를 파일로 다운로드할 수 있습니다. Owner 전용 기능입니다.
        </p>
      </div>

      {searchParams.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}
      {searchParams.success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {searchParams.success}
        </div>
      )}

      {/* 내보내기 요청 */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-3">새 내보내기 요청</h2>
        <form action={requestExport} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">유형</label>
            <select
              name="export_type"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-500">
            생성된 파일은 <strong>7일간</strong> 다운로드 가능하며, 민감 정보 (VCN 전체번호 · 내부 비용 구조)는 제외됩니다.
          </p>
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            요청하기
          </button>
        </form>
      </div>

      {/* 이전 요청 목록 */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">요청 이력</h2>
        </div>

        {list.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            내보내기 요청 이력이 없습니다.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">유형</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">요청일</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">만료</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">상태</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">다운로드</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map(job => {
                const expired = new Date(job.expires_at) < new Date()
                return (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium">{TYPE_LABEL[job.export_type] ?? job.export_type}</td>
                    <td className="px-6 py-3 text-xs text-gray-500">{formatDateTime(job.created_at)}</td>
                    <td className="px-6 py-3 text-xs text-gray-500">
                      {expired ? <span className="text-red-600">만료됨</span> : formatDateTime(job.expires_at)}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={expired && job.status === 'ready' ? 'cancelled' : job.status} />
                    </td>
                    <td className="px-6 py-3 text-right">
                      {job.status === 'ready' && job.download_url && !expired ? (
                        <a
                          href={job.download_url}
                          className="text-sm text-brand-600 hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          다운로드 ({job.download_count}회)
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400">
        참고: 조직 해지 시 전체 ZIP이 자동 생성되어 30일간 보관됩니다.
      </p>
    </div>
  )
}
