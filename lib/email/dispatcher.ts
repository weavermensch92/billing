/**
 * Email Dispatcher — notification_preferences 3계층 fallback + enqueueEmail (PR C)
 *
 * 이벤트 발생 시 호출. 발송 대상 멤버 × 채널을 결정하고 각 메일을 큐에 INSERT.
 *
 * 흐름:
 *   1. 발송 대상 멤버 lookup (role 필터 또는 명시된 member_id 배열)
 *   2. 각 멤버 × 각 채널 조합에 대해 3계층 preference fallback
 *      - member 본인 설정 (scope='member')
 *      - 조직 기본값 (scope='org')
 *      - 시스템 기본값 (scope='system' or 하드코딩 fallback)
 *   3. enabled 인 (멤버, 채널) 쌍에 대해 enqueueEmail (email 채널만 처리 — slack/sms 는 별도 디스패처)
 *
 * 후속:
 *   - PR D: 이벤트 발생 사이트에서 dispatchNotification 호출
 *   - 별도 PR: Slack / SMS 채널 디스패처 (slack_messages 큐)
 */

import { enqueueEmail, type EnqueueResult } from './outbox'

type SBLike = {
  from: (t: string) => any
  rpc?: (name: string, params?: Record<string, unknown>) => any
}

export type NotificationChannel = 'email' | 'slack' | 'sms' | 'in_app'

// ─── 시스템 기본값 하드코딩 fallback ────────────────────────
// notification_preferences scope='system' row 가 비어 있어도 dispatcher 가 동작하도록
// 마지막 fallback. DB seed 가 채워지면 그 값 우선 (v_notification_defaults).
const HARDCODED_SYSTEM_DEFAULTS: Record<string, Partial<Record<NotificationChannel, boolean>>> = {
  payment_declined:          { email: true,  slack: true,  sms: false },
  vcn_suspended:             { email: true,  slack: true,  sms: false },
  overdue_warning:           { email: true,  slack: true,  sms: false },
  request_awaiting_customer: { email: true,  slack: true,  sms: false },
  request_completed:         { email: true,  slack: false, sms: false },
  member_invited:            { email: true,  slack: false, sms: false },
  invoice_issued:            { email: true,  slack: false, sms: false },
  tax_invoice_issued:        { email: true,  slack: false, sms: false },
  creditback_applied:        { email: true,  slack: false, sms: false },
  creditback_ending_soon:    { email: true,  slack: true,  sms: false },
  limit_breach_approach:     { email: true,  slack: false, sms: false },
  upsell_signal:             { email: false, slack: false, sms: false },
}

// ─── 발송 대상 lookup ──────────────────────────────────────
export type MemberRoleFilter = 'owner' | 'admin' | 'member' | 'all'

type MemberRow = {
  id: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'member'
}

async function resolveTargetMembers(
  supabase: SBLike,
  orgId: string,
  roles: MemberRoleFilter[] | undefined,
  memberIds: string[] | undefined,
): Promise<MemberRow[]> {
  // 명시된 member_id 가 있으면 그것을 우선
  if (memberIds && memberIds.length > 0) {
    const { data } = (await supabase
      .from('members')
      .select('id, email, name, role')
      .in('id', memberIds)
      .eq('status', 'active')) as { data: MemberRow[] | null }
    return data ?? []
  }

  const roleFilter = roles && !roles.includes('all') ? roles : null
  let query = supabase
    .from('members')
    .select('id, email, name, role')
    .eq('org_id', orgId)
    .eq('status', 'active')
  if (roleFilter) {
    query = query.in('role', roleFilter)
  }
  const { data } = (await query) as { data: MemberRow[] | null }
  return data ?? []
}

// ─── preference 3계층 fallback ─────────────────────────────
type PrefRow = {
  channel: string
  event_type: string
  enabled: boolean
  scope: 'system' | 'org' | 'member'
}

async function loadPreferences(
  supabase: SBLike,
  orgId: string,
  memberIds: string[],
  eventType: string,
): Promise<{
  byMember: Map<string, PrefRow[]>
  org: PrefRow[]
  system: { event_type: string; channel: string; enabled: boolean }[]
}> {
  const byMember = new Map<string, PrefRow[]>()
  for (const id of memberIds) byMember.set(id, [])

  if (memberIds.length > 0) {
    const { data: memberPrefs } = (await supabase
      .from('notification_preferences')
      .select('channel, event_type, enabled, scope, member_id')
      .eq('event_type', eventType)
      .in('member_id', memberIds)
      .eq('scope', 'member')) as { data: (PrefRow & { member_id: string })[] | null }
    for (const p of memberPrefs ?? []) {
      const list = byMember.get(p.member_id) ?? []
      list.push(p)
      byMember.set(p.member_id, list)
    }
  }

  const { data: orgPrefs } = (await supabase
    .from('notification_preferences')
    .select('channel, event_type, enabled, scope')
    .eq('event_type', eventType)
    .eq('org_id', orgId)
    .eq('scope', 'org')) as { data: PrefRow[] | null }

  const { data: sysPrefs } = (await supabase
    .from('v_notification_defaults')
    .select('event_type, channel, enabled')
    .eq('event_type', eventType)) as {
    data: { event_type: string; channel: string; enabled: boolean }[] | null
  }

  return {
    byMember,
    org: orgPrefs ?? [],
    system: sysPrefs ?? [],
  }
}

export function resolveEnabled(
  eventType: string,
  channel: NotificationChannel,
  memberPrefs: PrefRow[],
  orgPrefs: PrefRow[],
  systemPrefs: { event_type: string; channel: string; enabled: boolean }[],
): boolean {
  const m = memberPrefs.find(p => p.channel === channel)
  if (m) return m.enabled
  const o = orgPrefs.find(p => p.channel === channel)
  if (o) return o.enabled
  const s = systemPrefs.find(p => p.channel === channel)
  if (s) return s.enabled
  // 마지막 fallback: 하드코딩
  return HARDCODED_SYSTEM_DEFAULTS[eventType]?.[channel] ?? false
}

// ─── dispatchNotification (메인) ───────────────────────────
export interface DispatchInput {
  eventType: string
  orgId: string
  payload: {
    subject: string
    html?: string
    text?: string
    /** 발신자 override (선택). 미지정 시 client.ts 의 EMAIL_FROM */
    from?: string
    replyTo?: string
  }
  /** 발송 대상 역할 필터. 미지정 시 ['owner','admin'] */
  targetRoles?: MemberRoleFilter[]
  /** 명시 멤버 id (역할 필터 무시) */
  targetMemberIds?: string[]
  /** 사용할 채널. 현재 email 만 처리. 미지정 시 ['email'] */
  channels?: NotificationChannel[]
  /** 추적용 */
  refTable?: string
  refId?: string | null
}

export interface DispatchResult {
  /** 대상 멤버 수 */
  targets: number
  /** enqueue 된 메일 수 */
  enqueued: number
  /** 스킵 (preference disabled) 수 */
  skipped: number
  /** 실패한 outbox INSERT 수 */
  failed: number
  /** outboxId 목록 (성공한 것만) */
  outboxIds: string[]
}

export async function dispatchNotification(
  supabase: SBLike,
  input: DispatchInput,
): Promise<DispatchResult> {
  const channels = input.channels ?? ['email']
  const targetRoles = input.targetRoles ?? ['owner', 'admin']

  // 1. 대상 멤버
  const members = await resolveTargetMembers(
    supabase,
    input.orgId,
    targetRoles,
    input.targetMemberIds,
  )

  if (members.length === 0) {
    return { targets: 0, enqueued: 0, skipped: 0, failed: 0, outboxIds: [] }
  }

  // 2. preference 로드
  const memberIds = members.map(m => m.id)
  const prefs = await loadPreferences(supabase, input.orgId, memberIds, input.eventType)

  // 3. 각 멤버 × 각 채널 → enqueue
  let enqueued = 0
  let skipped = 0
  let failed = 0
  const outboxIds: string[] = []

  for (const member of members) {
    const memberPrefs = prefs.byMember.get(member.id) ?? []
    for (const ch of channels) {
      // 현재 email 채널만 처리. slack / sms / in_app 은 별도 디스패처 (TODO).
      if (ch !== 'email') {
        skipped++
        continue
      }
      const enabled = resolveEnabled(input.eventType, ch, memberPrefs, prefs.org, prefs.system)
      if (!enabled) {
        skipped++
        continue
      }

      const result: EnqueueResult = await enqueueEmail(supabase, {
        to: member.email,
        subject: input.payload.subject,
        html: input.payload.html,
        text: input.payload.text,
        from: input.payload.from,
        replyTo: input.payload.replyTo,
        eventType: input.eventType,
        orgId: input.orgId,
        refTable: input.refTable,
        refId: input.refId ?? null,
        tags: [
          { name: 'event', value: input.eventType },
          { name: 'org', value: input.orgId },
          { name: 'member', value: member.id },
        ],
      })

      if (result.ok) {
        enqueued++
        outboxIds.push(result.outboxId)
      } else {
        failed++
      }
    }
  }

  return {
    targets: members.length,
    enqueued,
    skipped,
    failed,
    outboxIds,
  }
}
