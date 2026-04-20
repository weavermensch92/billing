import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils/format'
import { exportAuditLogCsv } from './actions'
import type { AuditLog } from '@/types/billing.types'

type Visibility = 'all' | 'customer_only' | 'both'

const VIS_TABS: { id: Visibility; label: string }[] = [
  { id: 'all',           label: '전체' },
  { id: 'customer_only', label: '고객 전용' },
  { id: 'both',          label: '공통' },
]

const ACTION_LABELS: Record<string, string> = {
  member_invited:          '멤버 초대',
  member_active:           '멤버 가입',
  member_role_changed:     '역할 변경',
  member_status_suspended: '멤버 중지',
  member_status_offboarded:'멤버 오프보딩',
  account_status_active:   '계정 활성화',
  account_status_suspended:'계정 중지',
  account_status_terminated:'계정 해지',
  vcn_created:             'VCN 생성',
  vcn_status_active:       'VCN 활성화',
  vcn_status_suspended:    'VCN 중지',
  vcn_status_revoked:      'VCN 폐기',
  vcn_transitioned:        'VCN 상태 전이',
  invoice_issued:          '청구서 발행',
  invoice_paid:            '청구서 납부',
  tax_invoice_recorded:    '세금계산서 발행',
}

// 고객용 마스킹 — `both` 로그 중 민감 필드 제거 (actions.ts와 동기화)
const SENSITIVE_KEYS_UI = [
  'gridge_margin_krw', 'gridge_cost_krw', 'gridge_cost',
  'reason', 'card_last4', 'card_full_number',
  'internal_note', 'totp_secret', 'api_key', 'password',
  'previous_email', 'ip_address', 'user_agent',
]
function maskDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(detail)) {
    if (SENSITIVE_KEYS_UI.includes(k)) continue
    masked[k] = v
  }
  return masked
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { vis?: Visibility; action?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members').select('org_id, role').eq('user_id', user.id).eq('status', 'active').single()
  if (!member) redirect('/login')

  const vis = searchParams.vis ?? 'all'

  let query = supabase
    .from('audit_logs')
    .select('*')
    .eq('org_id', member.org_id)
    .in('visibility', ['customer_only', 'both'])   // 고객은 internal_only 미노출 (RLS)
    .order('created_at', { ascending: false })
    .limit(200)

  if (vis !== 'all') query = query.eq('visibility', vis)
  if (searchParams.action) query = query.eq('action', searchParams.action)

  const { data: logs } = await query
  const list = (logs ?? []) as AuditLog[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">감사 로그</h1>
        <p className="text-sm text-gray-500 mt-1">
          조직의 주요 활동 이력입니다. 수정·삭제 불가 (Immutable Ledger · PB-005).
        </p>
      </div>

      {/* 필터 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {VIS_TABS.map(t => (
            <Link
              key={t.id}
              href={`/settings/audit-log?vis=${t.id}`}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                vis === t.id
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <form action={exportAuditLogCsv}>
          <input type="hidden" name="vis" value={vis} />
          <button
            type="submit"
            className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            CSV 내보내기
          </button>
        </form>
      </div>

      {/* 테이블 */}
      {list.length === 0 ? (
        <div className="card p-12 text-center text-sm text-gray-400">
          조건에 맞는 감사 로그가 없습니다.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">시각</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">행위</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">수행자</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">대상</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map(log => {
                const detail = log.visibility === 'both' ? maskDetail(log.detail) : log.detail
                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-xs text-gray-500">{formatDateTime(log.created_at)}</td>
                    <td className="px-6 py-3 font-medium">
                      {ACTION_LABELS[log.action] ?? log.action}
                      {log.visibility === 'both' && (
                        <span className="ml-2 text-xs text-gray-400">(공통)</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-600 text-xs">
                      <span className="capitalize">{log.actor_type}</span>
                      {log.actor_email && <span className="block text-xs text-gray-400">{log.actor_email}</span>}
                    </td>
                    <td className="px-6 py-3 text-gray-600 text-xs">{log.target_type ?? '-'}</td>
                    <td className="px-6 py-3 text-xs font-mono text-gray-500">
                      {Object.keys(detail).length > 0
                        ? Object.entries(detail).map(([k, v]) => `${k}=${String(v)}`).join(' · ')
                        : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        보존 기간: 3년 · 내부 전용 로그 (internal_only)는 여기에 표시되지 않습니다.
      </p>
    </div>
  )
}
