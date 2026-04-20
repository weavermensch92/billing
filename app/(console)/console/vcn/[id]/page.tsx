import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { VcnStateMachine } from '@/components/console/vcn-state-machine'
import { VcnActions } from './vcn-actions'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatKrw, formatDateTime } from '@/lib/utils/format'
import type { VirtualCard, AuditLog } from '@/types/billing.types'

export default async function VcnDetailPage({
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
    .from('admin_users').select('id, role').eq('email', user.email ?? '').eq('is_active', true).single()
  if (!adminUser) redirect('/console/login')

  const { data: vcn } = await supabase
    .from('virtual_cards')
    .select(`*,
      account:accounts!account_id(id, purpose,
        service:services!service_id(name, vendor),
        member:members!member_id(name, email)
      ),
      org:orgs!org_id(id, name)`)
    .eq('id', params.id)
    .single()

  if (!vcn) notFound()

  const vcnData = vcn as unknown as VirtualCard & {
    account: { id: string; purpose: string | null; service: { name: string; vendor: string } | null; member: { name: string; email: string } | null } | null
    org: { id: string; name: string } | null
  }

  // 전체번호 조회 감사 로그 (internal_only)
  const { data: revealLogs } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('target_type', 'virtual_card')
    .eq('target_id', params.id)
    .eq('action', 'vcn_full_number_reveal')
    .order('created_at', { ascending: false })
    .limit(5)

  const reveals = (revealLogs ?? []) as AuditLog[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/console/orgs/${vcnData.org?.id}`} className="text-sm text-gray-500 hover:text-gray-700">
            ← {vcnData.org?.name}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">
            VCN #{vcnData.card_last4 ?? '????'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {vcnData.account?.service?.name} · {vcnData.account?.member?.name} · {vcnData.card_issuer}
          </p>
        </div>
        <StatusBadge status={vcnData.status} />
      </div>

      {searchParams.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      {/* 상태 머신 시각화 */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">상태 전이</h2>
        <VcnStateMachine current={vcnData.status} />
      </div>

      {/* VCN 정보 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">카드 정보</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">카드 번호</dt>
              <dd className="font-mono font-medium">**** **** **** {vcnData.card_last4 ?? '????'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">카드사</dt>
              <dd className="capitalize">{vcnData.card_issuer}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">카드 유형</dt>
              <dd>{vcnData.card_type === 'primary' ? 'Primary' : 'Backup'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">월 한도</dt>
              <dd className="font-mono">{formatKrw(vcnData.monthly_limit_krw)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">해외결제</dt>
              <dd className={vcnData.allow_overseas ? 'text-green-600' : 'text-gray-400'}>
                {vcnData.allow_overseas ? '허용' : '미허용'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">MCC 화이트리스트</dt>
              <dd className="text-xs text-gray-600 font-mono">
                {vcnData.mcc_whitelist?.join(', ') ?? '전체'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">생명주기</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">생성</dt>
              <dd className="text-xs">{formatDateTime(vcnData.created_at)}</dd>
            </div>
            {vcnData.issued_at && (
              <div className="flex justify-between">
                <dt className="text-gray-500">발급 완료</dt>
                <dd className="text-xs">{formatDateTime(vcnData.issued_at)}</dd>
              </div>
            )}
            {vcnData.activated_at && (
              <div className="flex justify-between">
                <dt className="text-gray-500">활성화</dt>
                <dd className="text-xs">{formatDateTime(vcnData.activated_at)}</dd>
              </div>
            )}
            {vcnData.suspended_at && (
              <div className="flex justify-between">
                <dt className="text-gray-500">중지</dt>
                <dd className="text-xs text-orange-700">{formatDateTime(vcnData.suspended_at)}</dd>
              </div>
            )}
            {vcnData.revoked_at && (
              <div className="flex justify-between">
                <dt className="text-gray-500">폐기</dt>
                <dd className="text-xs text-red-700">{formatDateTime(vcnData.revoked_at)}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* 액션 + 전체번호 조회 (Super 전용) */}
      <VcnActions
        vcnId={vcnData.id}
        currentStatus={vcnData.status}
        adminRole={adminUser.role as 'super' | 'am' | 'finance' | 'ops'}
      />

      {/* 전체번호 조회 감사 이력 */}
      {reveals.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">🔒 전체번호 조회 이력 (internal_only)</h3>
          <ul className="space-y-2">
            {reveals.map(log => (
              <li key={log.id} className="text-xs text-gray-600 p-2 bg-gray-50 rounded">
                <div className="flex justify-between">
                  <span className="font-medium">{log.actor_email}</span>
                  <span className="text-gray-400">{formatDateTime(log.created_at)}</span>
                </div>
                <p className="mt-1 text-gray-500">
                  사유: {(log.detail as { reason?: string }).reason ?? '-'}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
