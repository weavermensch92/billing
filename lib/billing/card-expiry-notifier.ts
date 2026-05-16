/**
 * Card Expiry Notifier — 만료 알림 큐 처리 (13.4)
 *
 * D-30 / D-7 / D-0 / past_due 알림 큐를 채널별로 발송.
 *   - email     : SendGrid·SES 등 (실 구현은 lib/notifications/email)
 *   - slack     : chat.postMessage (lib/slack/poster 와 유사)
 *   - dashboard : DB 큐 유지 (UI에서 직접 조회)
 *   - phone     : 시스템 자동 발송 X — AM SOP. 대시보드에 표시만.
 *
 * 자동 카드 발급 없음 (D1 미채택). 알림 + 슈퍼어드민·AM 휴먼 액션.
 *
 * 참조:
 *   - detect_expiring_cards RPC (M-1013) — 큐 INSERT
 *   - mark_notification_sent RPC
 */

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export type NotificationType = 'D-30' | 'D-7' | 'D-0' | 'past_due'
export type NotificationChannel = 'email' | 'slack' | 'dashboard' | 'phone'

export interface CardExpiryNotification {
  id: string
  orgId: string
  cardId: string
  cardLabel: string | null
  cardExpiresAt: string
  notificationType: NotificationType
  targetAudience: string[]    // super_admin / org_admin / am
  channels: NotificationChannel[]
  status: 'queued' | 'sent' | 'failed' | 'acknowledged'
}

export interface DispatchResult {
  notificationId: string
  channel: NotificationChannel
  ok: boolean
  detail?: Record<string, unknown>
  error?: string
}

/** pg_cron 매일 진입점 — 임박 카드 식별 + 큐 INSERT */
export async function runDetectExpiringCards(supabase: SBLike): Promise<number> {
  const { data, error } = await supabase.rpc('detect_expiring_cards')
  if (error) throw new Error(`detect_expiring_cards failed: ${JSON.stringify(error)}`)
  return Number(data ?? 0)
}

/** 대기 중인 알림 조회 */
export async function listQueuedNotifications(
  supabase: SBLike,
  opts?: { type?: NotificationType; orgId?: string; limit?: number },
): Promise<CardExpiryNotification[]> {
  let query = supabase
    .from('card_expiry_notifications')
    .select('*')
    .eq('status', 'queued')
    .order('card_expires_at', { ascending: true })

  if (opts?.type) query = query.eq('notification_type', opts.type)
  if (opts?.orgId) query = query.eq('org_id', opts.orgId)
  if (opts?.limit) query = query.limit(opts.limit)

  const { data } = await query
  return (data ?? []).map(toNotification)
}

/**
 * 큐 일괄 발송.
 * phone 채널은 자동 발송 안 함 (SOP). 큐 status='queued' 유지.
 * 다른 채널은 시도. 모든 채널 성공 시 mark_notification_sent.
 */
export async function dispatchQueuedNotifications(
  supabase: SBLike,
  dispatchers: ChannelDispatchers,
): Promise<DispatchResult[]> {
  const queued = await listQueuedNotifications(supabase)
  const results: DispatchResult[] = []

  for (const notif of queued) {
    let allOk = true
    const detail: Record<string, unknown> = {}

    for (const ch of notif.channels) {
      if (ch === 'phone' || ch === 'dashboard') {
        // phone: SOP. dashboard: DB 큐 유지로 충분.
        detail[ch] = 'skipped_human_or_passive'
        results.push({ notificationId: notif.id, channel: ch, ok: true, detail: { skipped: true } })
        continue
      }

      const dispatcher = dispatchers[ch]
      if (!dispatcher) {
        results.push({ notificationId: notif.id, channel: ch, ok: false, error: 'no_dispatcher' })
        allOk = false
        continue
      }

      try {
        const r = await dispatcher(notif)
        results.push({ notificationId: notif.id, channel: ch, ok: r.ok, detail: r.detail, error: r.error })
        detail[ch] = r.detail ?? (r.ok ? 'sent' : r.error)
        if (!r.ok) allOk = false
      } catch (e) {
        results.push({ notificationId: notif.id, channel: ch, ok: false, error: String(e) })
        allOk = false
      }
    }

    if (allOk) {
      await supabase.rpc('mark_notification_sent', {
        p_notification_id: notif.id,
        p_success: true,
        p_detail: detail,
      })
    }
  }

  return results
}

export interface ChannelDispatcher {
  (notif: CardExpiryNotification): Promise<{ ok: boolean; detail?: Record<string, unknown>; error?: string }>
}

export interface ChannelDispatchers {
  email?: ChannelDispatcher
  slack?: ChannelDispatcher
  dashboard?: ChannelDispatcher
  phone?: ChannelDispatcher
}

function toNotification(row: any): CardExpiryNotification {
  return {
    id: row.id,
    orgId: row.org_id,
    cardId: row.card_id,
    cardLabel: row.card_label ?? null,
    cardExpiresAt: row.card_expires_at,
    notificationType: row.notification_type,
    targetAudience: row.target_audience ?? [],
    channels: row.channels ?? [],
    status: row.status,
  }
}
