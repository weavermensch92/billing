import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { MessageThread } from '@/components/customer/message-thread'
import { formatDateTime } from '@/lib/utils/format'
import { ACTION_TYPE_LABELS } from '@/types/request.types'
import { sendMessage, confirmCustomerAction, approveSelfByAdmin } from './actions'
import { formatKrw } from '@/lib/utils/format'
import type { ActionRequest } from '@/types/billing.types'
import type { RequestEvent, RequestMessage } from '@/types/request.types'

const EVENT_LABELS: Record<string, string> = {
  created:            '요청 생성',
  assigned:           'AM 배정',
  path_decided:       '처리 경로 결정',
  approved:           '승인',
  rejected:           '반려',
  awaiting_customer:  '고객 확인 대기',
  customer_confirmed: '고객 확인 완료',
  completed:          '완료',
  cancelled:          '취소',
  vcn_issued:         'VCN 발급',
  message_sent:       '메시지 전송',
  sla_warning:        'SLA 경고',
  sla_breach:         'SLA 위반',
  system_note:        '시스템 알림',
}

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { created?: string; self?: string; self_approved?: string; error?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, org_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!member) redirect('/login')

  const [requestRes, eventsRes, messagesRes, orgRes] = await Promise.all([
    supabase.from('action_requests').select('*').eq('id', params.id).single(),
    supabase.from('request_events').select('*').eq('request_id', params.id).order('created_at'),
    supabase.from('request_messages').select('*').eq('request_id', params.id).order('created_at'),
    supabase.from('orgs').select('self_approval_headroom_krw, self_approval_used_krw').eq('id', member.org_id).single(),
  ])

  const headroomRow = (orgRes.data as { self_approval_headroom_krw?: number; self_approval_used_krw?: number } | null) ?? {}
  const headroomKrw = headroomRow.self_approval_headroom_krw ?? 0
  const headroomUsed = headroomRow.self_approval_used_krw ?? 0
  const remainingKrw = Math.max(0, headroomKrw - headroomUsed)

  if (!requestRes.data) notFound()

  const request = requestRes.data as ActionRequest
  const events = (eventsRes.data ?? []) as RequestEvent[]
  const messages = (messagesRes.data ?? []) as RequestMessage[]

  const info = ACTION_TYPE_LABELS[request.action_type]
  const canConfirm = request.status === 'awaiting_customer' && request.requester_id === member.id

  // Admin/Owner가 pending 요청을 즉시 승인할 수 있는지
  const isPrivileged = member.role === 'owner' || member.role === 'admin'
  const cost = request.estimated_cost_krw ?? 0
  const canSelfApprove = isPrivileged
    && request.status === 'pending'
    && headroomKrw > 0
    && cost <= remainingKrw

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href="/requests" className="text-sm text-gray-500 hover:text-gray-700">
        ← 요청 내역
      </Link>

      {searchParams.created && !searchParams.self && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          요청이 제출되었습니다. Luna가 검토 후 진행합니다.
        </div>
      )}
      {searchParams.self === '1' && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <strong>자율 승인 완료</strong> — 요청이 즉시 승인되었습니다. VCN 발급 등 후속 작업은 AM이 진행합니다.
        </div>
      )}
      {searchParams.self_approved === '1' && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <strong>즉시 승인 처리됨</strong> — 자율 승인 한도에서 차감되었으며 AM 큐에 승인된 요청으로 전달됩니다.
        </div>
      )}
      {searchParams.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      {/* 헤더 */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <span className="text-3xl">{info.icon}</span>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{info.label}</h1>
              <p className="text-sm text-gray-500 mt-1">{info.description}</p>
              <p className="text-xs text-gray-400 mt-2 font-mono">#{request.id.slice(0, 8)}</p>
            </div>
          </div>
          <StatusBadge status={request.status} />
        </div>

        {canSelfApprove && (
          <div className="mt-6 p-4 bg-green-50 border-2 border-green-300 rounded-lg">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-green-900">즉시 승인 가능</p>
                <p className="text-sm text-green-700 mt-1">
                  예상 월 비용 <strong className="font-mono">{formatKrw(cost)}</strong>
                  {' — '}
                  자율 승인 한도 내입니다 (잔여 <strong className="font-mono">{formatKrw(remainingKrw)}</strong>).
                </p>
                <p className="text-xs text-green-600 mt-1">
                  AM 검토 없이 바로 승인하면 Luna는 VCN 발급 등 후속 실행만 담당합니다.
                </p>
              </div>
            </div>
            <form action={approveSelfByAdmin} className="mt-3 flex gap-2">
              <input type="hidden" name="request_id" value={request.id} />
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                바로 승인하기
              </button>
              <span className="flex-1" />
              <span className="text-xs text-gray-500 self-center">또는 AM 검토를 기다립니다</span>
            </form>
          </div>
        )}

        {canConfirm && (
          <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <p className="text-sm font-medium text-orange-900">고객 확인이 필요합니다</p>
            <p className="text-sm text-orange-700 mt-1">
              AM이 처리를 완료했습니다. 아래 버튼을 눌러 확인해 주세요.
            </p>
            <form action={confirmCustomerAction} className="mt-3">
              <input type="hidden" name="request_id" value={request.id} />
              <button
                type="submit"
                className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                교체 완료 확인
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 진행 타임라인 */}
        <div className="card">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">진행 상황</h3>
          </div>
          <div className="p-5">
            {events.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">이력이 없습니다.</p>
            ) : (
              <ol className="relative border-l-2 border-gray-200 ml-2">
                {events.map(ev => (
                  <li key={ev.id} className="ml-4 mb-5 last:mb-0">
                    <span className="absolute -left-[9px] w-4 h-4 rounded-full bg-brand-600 border-2 border-white" />
                    <p className="text-sm font-medium text-gray-900">
                      {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(ev.created_at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* 요청 상세 */}
          <div className="px-5 pb-5 border-t border-gray-100 pt-4">
            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">요청 내용</h4>
            <pre className="text-xs text-gray-700 bg-gray-50 rounded p-3 overflow-x-auto">
              {JSON.stringify(request.request_data, null, 2)}
            </pre>
          </div>
        </div>

        {/* 메시지 스레드 */}
        <MessageThread
          requestId={request.id}
          orgId={request.org_id}
          memberId={member.id}
          initialMessages={messages}
          sendMessage={sendMessage}
        />
      </div>
    </div>
  )
}
