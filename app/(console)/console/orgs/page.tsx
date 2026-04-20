import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatKrw, formatDate } from '@/lib/utils/format'
import type { Org } from '@/types/billing.types'

interface OrgWithStats extends Org {
  _member_count?: number
  _active_accounts?: number
}

export default async function OrgsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: orgs } = await supabase
    .from('orgs')
    .select('*')
    .order('created_at', { ascending: false })

  const orgList = (orgs ?? []) as Org[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">고객사 관리</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">총 {orgList.length}개사</span>
          <Link
            href="/console/orgs/new"
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            + 신규 등록
          </Link>
        </div>
      </div>

      {/* 검색 (Phase 1+ 기능 예고) */}
      <div>
        <input
          type="text"
          placeholder="고객사명, 사업자번호 검색..."
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-500"
          disabled
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">고객사</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">결제 티어</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">신용 한도</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">크레딧백</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">상태</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">등록일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orgList.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                  등록된 고객사가 없습니다.
                </td>
              </tr>
            ) : (
              orgList.map(org => (
                <tr key={org.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <Link href={`/console/orgs/${org.id}`} className="hover:text-brand-600">
                      <p className="font-medium text-gray-900">{org.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{org.business_reg_no}</p>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className="capitalize text-gray-700">{org.plan}</span>
                  </td>
                  <td className="px-6 py-4 font-mono">
                    {formatKrw(org.credit_limit_krw)}
                  </td>
                  <td className="px-6 py-4">
                    {org.creditback_start_at ? (
                      <span className="text-green-600">진행 중</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={org.status} />
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {formatDate(org.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
