import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { HeadroomForm } from './headroom-form'
import { formatKrw, formatDateTime } from '@/lib/utils/format'
import type { Org, AuditLog } from '@/types/billing.types'

export default async function HeadroomPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { error?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: adminUser } = await supabase
    .from('admin_users').select('role').eq('email', user.email ?? '').eq('is_active', true).single()
  if (!adminUser) redirect('/console/login')
  if (adminUser.role !== 'super') {
    redirect(`/console/orgs/${params.id}?error=${encodeURIComponent('Super 권한이 필요합니다.')}`)
  }

  const { data: org } = await supabase
    .from('orgs').select('*').eq('id', params.id).single()
  if (!org) notFound()
  const orgData = org as Org

  // 최근 변경 이력
  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('org_id', params.id)
    .eq('action', 'self_approval_headroom_set')
    .order('created_at', { ascending: false })
    .limit(10)

  const history = (logs ?? []) as AuditLog[]

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href={`/console/orgs/${params.id}`} className="text-sm text-gray-500 hover:text-gray-700">
        ← {orgData.name}
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">자율 승인 한도 조정</h1>
        <p className="text-sm text-gray-500 mt-1">
          {orgData.name} — Admin/Owner가 AM 경유 없이 즉시 승인 가능한 월간 한도입니다.
          매월 1일 <code className="text-xs">self_approval_used_krw</code>가 0으로 리셋됩니다.
        </p>
      </div>

      {searchParams.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      <div className="card p-6">
        <HeadroomForm
          orgId={params.id}
          currentHeadroom={orgData.self_approval_headroom_krw ?? 0}
          currentUsed={orgData.self_approval_used_krw ?? 0}
        />
      </div>

      {/* 변경 이력 */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">변경 이력 (최근 10건)</h2>
        </div>
        {history.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">변경 이력이 없습니다.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {history.map(log => {
              const d = log.detail as { from_krw?: number; to_krw?: number; delta_krw?: number; reason?: string }
              const delta = d.delta_krw ?? 0
              return (
                <li key={log.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {formatKrw(d.from_krw ?? 0)} → {formatKrw(d.to_krw ?? 0)}
                        <span className={`ml-2 text-xs ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          ({delta > 0 ? '+' : ''}{formatKrw(delta)})
                        </span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {log.actor_email} · {formatDateTime(log.created_at)}
                      </p>
                      {d.reason && (
                        <p className="text-xs text-gray-700 mt-1 bg-gray-50 p-2 rounded">사유: {d.reason}</p>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
