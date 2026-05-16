/**
 * Slack Acknowledger Whitelist — ✅ 권한자 관리
 *
 * 참조: slack_acknowledger_whitelist (M-1009)
 */

type SBLike = { from: (t: string) => any }

export interface AcknowledgerEntry {
  slack_user_id: string
  user_name: string | null
  user_email: string | null
  allowed_channels: string[] | null
  allowed_subjects: string[] | null
  active: boolean
  added_at: string
  revoked_at: string | null
}

export async function addAcknowledger(
  supabase: SBLike,
  params: {
    slackUserId: string
    userName?: string
    userEmail?: string
    allowedChannels?: string[]
    allowedSubjects?: string[]
    addedBy: string
  },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('slack_acknowledger_whitelist').insert({
    slack_user_id: params.slackUserId,
    user_name: params.userName ?? null,
    user_email: params.userEmail ?? null,
    allowed_channels: params.allowedChannels ?? null,
    allowed_subjects: params.allowedSubjects ?? null,
    active: true,
    added_by: params.addedBy,
  })
  if (error) return { ok: false, error: JSON.stringify(error) }
  return { ok: true }
}

export async function revokeAcknowledger(
  supabase: SBLike,
  slackUserId: string,
  revokedBy: string,
  reason?: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('slack_acknowledger_whitelist')
    .update({
      active: false,
      revoked_at: new Date().toISOString(),
      revoked_by: revokedBy,
      revoked_reason: reason ?? null,
    })
    .eq('slack_user_id', slackUserId)
  return !error
}

export async function listAcknowledgers(supabase: SBLike, opts?: { activeOnly?: boolean }): Promise<AcknowledgerEntry[]> {
  let query = supabase
    .from('slack_acknowledger_whitelist')
    .select('slack_user_id, user_name, user_email, allowed_channels, allowed_subjects, active, added_at, revoked_at')
    .order('added_at', { ascending: false })
  if (opts?.activeOnly) {
    query = query.eq('active', true).is('revoked_at', null)
  }
  const { data } = await query
  return (data ?? []) as AcknowledgerEntry[]
}

/** 특정 slack user가 특정 채널·주제에 대해 ack 권한이 있는지 검증 (Webhook 외 사전 체크) */
export async function isAuthorizedAcknowledger(
  supabase: SBLike,
  slackUserId: string,
  channelId: string,
  subject: string,
): Promise<boolean> {
  const { data } = (await supabase
    .from('slack_acknowledger_whitelist')
    .select('allowed_channels, allowed_subjects')
    .eq('slack_user_id', slackUserId)
    .eq('active', true)
    .is('revoked_at', null)
    .maybeSingle()) as { data: { allowed_channels: string[] | null; allowed_subjects: string[] | null } | null }

  if (!data) return false
  const channelOk = !data.allowed_channels || data.allowed_channels.includes(channelId)
  const subjectOk = !data.allowed_subjects || data.allowed_subjects.includes(subject)
  return channelOk && subjectOk
}
