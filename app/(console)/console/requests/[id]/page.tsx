import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { AdminMessageThread } from '@/components/console/admin-message-thread'
import { formatDateTime } from '@/lib/utils/format'
import { ACTION_TYPE_LABELS } from '@/types/request.types'
import { decidePath, updateRequestStatus, updateProgressState, sendAdminMessage, setVcnLast4 } from './actions'
import type { ActionRequest, ActionType } from '@/types/billing.types'
import type { RequestEvent, RequestMessage } from '@/types/request.types'

// 유형별 처리 체크리스트 (PRD § 5.6 F6.3)
const CHECKLIST_TEMPLATES: Record<ActionType, { key: string; label: string }[]> = {
  new_account: [
    { key: 'tos_reviewed',       label: '서비스 약관 실사 확인 (approved/conditional)' },
    { key: 'limit_approved',     label: '월 한도 승인' },
    { key: 'vcn_issued',         label: '신한 V-Card 포털에서 VCN 발급' },
    { key: 'vcn_registered',     label: 'AI 서비스에 VCN 등록 (해외결제 허용)' },
    { key: 'onepw_shared',       label: '1Password 공유 링크 발송 (7일 유효)' },
    { key: 'customer_confirm',   label: '고객 확인 대기 상태로 전환' },
  ],
  limit_change: [
    { key: 'approval_path',      label: 'Fast/Full Path 판정' },
    { key: 'super_approval',     label: 'Super 2차 승인 (Full Path 시)' },
    { key: 'vcn_limit_updated',  label: '카드사 포털에서 VCN 한도 변경' },
    { key: 'customer_notified',  label: '고객 통지' },
  ],
  terminate: [
    { key: 'vcn_suspended',      label: 'VCN 일시중지 (suspended)' },
    { key: 'service_cancelled',  label: '서비스 측 구독 취소' },
    { key: 'final_invoice',      label: '일할 계산 처리 (즉시 해지 시)' },
    { key: 'vcn_revoked',        label: '7일 유예 후 VCN 폐기 (revoked)' },
  ],
  vcn_replace: [
    { key: 'primary_suspended',  label: '기존 VCN 일시중지' },
    { key: 'backup_issued',      label: '새 VCN 발급' },
    { key: 'service_updated',    label: '서비스 측 카드 변경' },
    { key: 'onepw_shared',       label: '1Password 새 링크 발송' },
    { key: 'old_vcn_revoked',    label: '기존 VCN 폐기' },
  ],
  decline_response: [
    { key: 'cause_identified',   label: '원인 파악 (한도/MCC/해외결제/카드사 이슈)' },
    { key: 'vcn_reconfigured',   label: 'VCN 설정 변경' },
    { key: 'customer_notified',  label: '고객 통지 (진행 상황)' },
    { key: 'retry_confirmed',    label: '재결제 성공 확인' },
  ],
  bulk_terminate: [
    { key: 'impact_reviewed',    label: '영향 범위 리뷰 (계정 N개)' },
    { key: 'child_requests',     label: '자식 요청 일괄 생성' },
    { key: 'waiver_expired',     label: '7일 유예 경과' },
    { key: 'all_terminated',     label: '전체 해지 완료' },
  ],
  headroom_increase: [
    { key: 'parent_reviewed',    label: '부모 요청 검토 (initiator 목적/금액 확인)' },
    { key: 'shortfall_verified', label: '증액 금액 타당성 확인' },
    { key: 'decision_recorded',  label: '승인/거부 결정 기록' },
  ],
}

const EVENT_LABELS: Record<string, string> = {
  created: '요청 생성', assigned: 'AM 배정', path_decided: '경로 결정',
  approved: '승인', rejected: '반려', awaiting_customer: '고객 확인 대기',
  customer_confirmed: '고객 확인', completed: '완료', cancelled: '취소',
  vcn_issued: 'VCN 발급', sla_warning: 'SLA 경고', sla_breach: 'SLA 위반',
  system_note: '시스템', message_sent: '메시지',
}

interface RequestWithOrg extends Omit<ActionRequest, 'requester' | 'assigned_admin'> {
  org: { id: string; name: string; plan: string } | null
  requester: { id: string; name: string; email: string } | null
  account: { id: string; monthly_limit_krw: number; service: { name: string } | null } | null
}

export default async function ConsoleRequestDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const [requestRes, eventsRes, messagesRes] = await Promise.all([
    supabase
      .from('action_requests')
      .select(`*,
        org:orgs!org_id(id, name, plan),
        requester:members!requester_id(id, name, email),
        account:accounts!account_id(id, monthly_limit_krw, service:services!service_id(name))`)
      .eq('id', params.id)
      .single(),
    supabase.from('request_events').select('*').eq('request_id', params.id).order('created_at'),
    supabase.from('request_messages').select('*').eq('request_id', params.id).order('created_at'),
  ])

  if (!requestRes.data) notFound()

  const request = requestRes.data as unknown as RequestWithOrg
  const events = (eventsRes.data ?? []) as RequestEvent[]
  const messages = (messagesRes.data ?? []) as RequestMessage[]
  const checklist = CHECKLIST_TEMPLATES[request.action_type] ?? []
  const progress = (request.progress_state as Record<string, boolean>) ?? {}
  const info = ACTION_TYPE_LABELS[request.action_type]

  // Fast/Full Path 자동 제안 (PB-008-05)
  const suggestedPath: 'fast' | 'full' = (() => {
    if (request.action_type === 'limit_change' && request.account) {
      const newLimit = Number(request.request_data.new_limit_krw ?? 0)
      return newLimit <= request.account.monthly_limit_krw * 1.5 ? 'fast' : 'full'
    }
    if (request.action_type === 'new_account') {
      const limit = Number(request.request_data.monthly_limit_krw ?? 0)
      return limit <= 1000000 ? 'fast' : 'full'
    }
    return 'full'
  })()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/console/requests" className="text-sm text-gray-500 hover:text-gray-700">
          ← 요청 큐
        </Link>
      </div>

      {/* 헤더 */}
      <div className="card p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {info.icon} {info.label}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {request.org?.name} · {request.requester?.name} ({request.requester?.email})
            </p>
            <p className="text-xs text-gray-400 mt-1 font-mono">#{request.id.slice(0, 8)}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={request.status} />
            {request.path_type && (
              <span className={`text-xs font-medium px-2 py-1 rounded ${
                request.path_type === 'fast' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {request.path_type === 'fast' ? 'Fast Path' : 'Full Path'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Fast/Full Path 선택 (pending 상태일 때) */}
      {request.status === 'pending' && (
        <div className="card p-5 border-2 border-orange-300 bg-orange-50">
          <h3 className="text-sm font-semibold text-orange-900 mb-2">처리 경로 선택 필요</h3>
          <p className="text-sm text-orange-700 mb-3">
            자동 제안: <strong>{suggestedPath === 'fast' ? 'Fast Path' : 'Full Path'}</strong>
          </p>
          <div className="flex gap-3">
            {(['fast', 'full'] as const).map(p => (
              <form key={p} action={decidePath}>
                <input type="hidden" name="request_id" value={request.id} />
                <input type="hidden" name="org_id" value={request.org_id} />
                <input type="hidden" name="path_type" value={p} />
                <button
                  type="submit"
                  className={`text-sm font-medium px-4 py-2 rounded-lg ${
                    p === 'fast'
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {p === 'fast' ? 'Fast Path (즉시 승인)' : 'Full Path (상세 검토)'}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      {/* 3컬럼 레이아웃 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 1. 요청 정보 */}
        <div className="card">
          <div className="px-4 py-2 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">요청 정보</h3>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">고객사</p>
              <p className="font-medium">
                <Link href={`/console/orgs/${request.org?.id}`} className="hover:text-brand-600">
                  {request.org?.name}
                </Link>
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">요청자</p>
              <p className="font-medium">{request.requester?.name}</p>
              <p className="text-xs text-gray-400">{request.requester?.email}</p>
            </div>
            {request.sla_deadline && (
              <div>
                <p className="text-xs text-gray-500">SLA</p>
                <p className="font-medium text-xs">{formatDateTime(request.sla_deadline)}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 mb-1">request_data</p>
              <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                {JSON.stringify(request.request_data, null, 2)}
              </pre>
            </div>

            {/* 상태 전이 버튼 */}
            {request.status === 'in_review' && (
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <form action={updateRequestStatus}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <input type="hidden" name="next_status" value="awaiting_customer" />
                  <button
                    type="submit"
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium py-2 rounded"
                  >
                    고객 확인 대기로 전환
                  </button>
                </form>
                <form action={updateRequestStatus}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <input type="hidden" name="next_status" value="completed" />
                  <button
                    type="submit"
                    className="w-full bg-green-600 hover:bg-green-700 text-white text-xs font-medium py-2 rounded"
                  >
                    즉시 완료 처리
                  </button>
                </form>
                <form action={updateRequestStatus}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <input type="hidden" name="next_status" value="rejected" />
                  <button
                    type="submit"
                    className="w-full border border-red-300 text-red-600 text-xs font-medium py-2 rounded hover:bg-red-50"
                  >
                    반려
                  </button>
                </form>
              </div>
            )}

            {/* 이벤트 타임라인 */}
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">이벤트</p>
              <ol className="space-y-1">
                {events.map(ev => (
                  <li key={ev.id} className="text-xs text-gray-600">
                    <span className="font-medium">{EVENT_LABELS[ev.event_type] ?? ev.event_type}</span>
                    <span className="text-gray-400 ml-1">· {formatDateTime(ev.created_at)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        {/* 2. 처리 체크리스트 */}
        <div className="card">
          <div className="px-4 py-2 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">처리 체크리스트</h3>
          </div>
          <div className="p-4 space-y-2">
            {checklist.map(item => (
              <div key={item.key}>
                <form action={updateProgressState}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <input type="hidden" name="key" value={item.key} />
                  <input type="hidden" name="value" value={String(!progress[item.key])} />
                  <button
                    type="submit"
                    className="w-full flex items-start gap-2 p-2 hover:bg-gray-50 rounded text-left text-sm"
                  >
                    <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      progress[item.key] ? 'bg-green-600 border-green-600 text-white text-xs' : 'border-gray-300'
                    }`}>
                      {progress[item.key] && '✓'}
                    </span>
                    <span className={progress[item.key] ? 'line-through text-gray-400' : 'text-gray-700'}>
                      {item.label}
                    </span>
                  </button>
                </form>

                {/* vcn_issued / old_vcn_revoked 단계에서 card_last4 입력 */}
                {(item.key === 'vcn_issued' || item.key === 'backup_issued') && (
                  <form action={setVcnLast4} className="ml-6 mt-1 flex gap-2 items-center">
                    <input type="hidden" name="request_id" value={request.id} />
                    <span className="text-xs text-gray-500">카드 끝 4자리:</span>
                    <input
                      type="text"
                      name="vcn_last4"
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      defaultValue={(request.progress_state as { vcn_last4?: string }).vcn_last4 ?? ''}
                      placeholder="1234"
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-xs font-mono text-center"
                    />
                    <button
                      type="submit"
                      className="text-xs text-brand-600 hover:underline"
                    >
                      저장
                    </button>
                    {(request.progress_state as { vcn_last4?: string }).vcn_last4 && (
                      <span className="text-xs text-green-600">
                        ✓ {(request.progress_state as { vcn_last4?: string }).vcn_last4}
                      </span>
                    )}
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 3. 메시지 스레드 */}
        <AdminMessageThread
          requestId={request.id}
          orgId={request.org_id}
          initialMessages={messages}
          sendMessage={sendAdminMessage}
        />
      </div>
    </div>
  )
}
