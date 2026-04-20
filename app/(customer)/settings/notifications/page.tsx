import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { updatePref } from './actions'

const EVENT_CATEGORIES: { id: string; label: string; events: { id: string; label: string }[] }[] = [
  {
    id: 'urgent',
    label: '긴급',
    events: [
      { id: 'payment_declined',  label: '결제 거절' },
      { id: 'vcn_suspended',     label: 'VCN 중지' },
      { id: 'overdue_warning',   label: '청구서 연체 경고' },
    ],
  },
  {
    id: 'action',
    label: '액션 필요',
    events: [
      { id: 'request_awaiting_customer', label: '요청 — 고객 확인 대기' },
      { id: 'request_completed',         label: '요청 — 완료' },
      { id: 'member_invited',            label: '멤버 — 초대됨' },
    ],
  },
  {
    id: 'info',
    label: '정보성',
    events: [
      { id: 'invoice_issued',         label: '청구서 — 발행됨' },
      { id: 'tax_invoice_issued',     label: '세금계산서 — 발행됨' },
      { id: 'creditback_applied',     label: '크레딧백 — 적용됨' },
      { id: 'creditback_ending_soon', label: '크레딧백 — 종료 D-30' },
      { id: 'limit_breach_approach',  label: '한도 90% 도달' },
    ],
  },
]

const CHANNELS = [
  { id: 'email', label: 'Email' },
  { id: 'slack', label: 'Slack' },
  { id: 'sms',   label: 'SMS' },
] as const

interface Pref {
  channel: string
  event_type: string
  enabled: boolean
  scope: string
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { success?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members').select('id, org_id, role').eq('user_id', user.id).eq('status', 'active').single()
  if (!member) redirect('/login')

  // 본인 설정 + 조직 기본값 + 시스템 기본값 조회
  const [myPrefsRes, orgPrefsRes, sysDefaultsRes] = await Promise.all([
    supabase.from('notification_preferences').select('channel, event_type, enabled, scope')
      .eq('member_id', member.id),
    supabase.from('notification_preferences').select('channel, event_type, enabled, scope')
      .eq('org_id', member.org_id).eq('scope', 'org'),
    supabase.from('v_notification_defaults').select('*'),
  ])

  const myPrefs = (myPrefsRes.data ?? []) as Pref[]
  const orgPrefs = (orgPrefsRes.data ?? []) as Pref[]
  const sysDefaults = (sysDefaultsRes.data ?? []) as { channel: string; event_type: string; enabled: boolean }[]

  // 3계층 fallback: 본인 → 조직 → 시스템
  const resolvePref = (eventType: string, channel: string): boolean => {
    const mine = myPrefs.find(p => p.event_type === eventType && p.channel === channel)
    if (mine) return mine.enabled
    const org = orgPrefs.find(p => p.event_type === eventType && p.channel === channel)
    if (org) return org.enabled
    const sys = sysDefaults.find(p => p.event_type === eventType && p.channel === channel)
    return sys?.enabled ?? false
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">알림 설정</h1>
        <p className="text-sm text-gray-500 mt-1">
          이벤트별로 전달받을 채널을 선택하세요.
          {member.role === 'owner' && ' Owner 설정은 조직 기본값으로 반영됩니다.'}
        </p>
      </div>

      {searchParams.success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {searchParams.success}
        </div>
      )}

      <div className="space-y-5">
        {EVENT_CATEGORIES.map(cat => (
          <div key={cat.id} className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-900">{cat.label}</h3>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">이벤트</th>
                  {CHANNELS.map(c => (
                    <th key={c.id} className="text-center px-5 py-2 text-xs font-medium text-gray-500 w-24">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cat.events.map(ev => (
                  <tr key={ev.id}>
                    <td className="px-5 py-3 text-gray-700">{ev.label}</td>
                    {CHANNELS.map(ch => {
                      const enabled = resolvePref(ev.id, ch.id)
                      return (
                        <td key={ch.id} className="px-5 py-3 text-center">
                          <form action={updatePref} className="inline">
                            <input type="hidden" name="event_type" value={ev.id} />
                            <input type="hidden" name="channel" value={ch.id} />
                            <input type="hidden" name="enabled" value={String(!enabled)} />
                            <button
                              type="submit"
                              className={`w-10 h-5 rounded-full relative transition-colors ${
                                enabled ? 'bg-brand-600' : 'bg-gray-200'
                              }`}
                              aria-label={`${ev.label} ${ch.label} 토글`}
                            >
                              <span
                                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                  enabled ? 'translate-x-5' : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                          </form>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        SMS 알림은 사전 동의 후 활성화됩니다.
        Slack 알림은 조직의 Slack Connect 연동이 필요합니다.
      </p>
    </div>
  )
}
