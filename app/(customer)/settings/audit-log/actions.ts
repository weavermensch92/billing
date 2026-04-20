'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { AuditLog } from '@/types/billing.types'

// 고객 포털에서 제외할 민감 필드 (마스킹 대상 확장)
const SENSITIVE_KEYS = [
  'gridge_margin_krw', 'gridge_cost_krw', 'gridge_cost',
  'reason',                  // 내부 사유 (VCN reveal 등)
  'card_last4',              // 카드 식별자
  'card_full_number',        // 만일 실수로 기록되면 제거
  'internal_note',
  'totp_secret',
  'api_key',
  'password',
  'previous_email',
  'ip_address',
  'user_agent',
]

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export async function exportAuditLogCsv(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members').select('id, org_id').eq('user_id', user.id).eq('status', 'active').single()
  if (!member) redirect('/login')

  const vis = (formData.get('vis') as string) ?? 'all'

  let query = supabase
    .from('audit_logs')
    .select('*')
    .eq('org_id', member.org_id)
    .in('visibility', ['customer_only', 'both'])
    .order('created_at', { ascending: false })
    .limit(5000)

  if (vis !== 'all') query = query.eq('visibility', vis)

  const { data: logs } = await query
  const list = (logs ?? []) as AuditLog[]

  // 감사 로그 export 자체를 기록
  await supabase.from('audit_logs').insert({
    org_id: member.org_id,
    actor_type: 'member',
    actor_id: member.id,
    actor_email: user.email ?? null,
    action: 'audit_log_exported',
    target_type: 'audit_log',
    visibility: 'both',
    detail: { vis, row_count: list.length, format: 'csv' },
  })

  const header = ['created_at', 'action', 'actor_type', 'actor_email', 'target_type', 'target_id', 'visibility', 'detail']
  const rows = list.map(log => {
    const detail = { ...log.detail }
    for (const key of SENSITIVE_KEYS) delete detail[key]
    return [
      log.created_at,
      log.action,
      log.actor_type,
      log.actor_email ?? '',
      log.target_type ?? '',
      log.target_id ?? '',
      log.visibility,
      JSON.stringify(detail),
    ].map(csvEscape).join(',')
  })

  const csv = '\uFEFF' + [header.join(','), ...rows].join('\n')  // BOM for Excel UTF-8
  const filename = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`

  // Server Action은 Response 직접 반환 불가 → data URL redirect 사용 불가
  // 대신 Supabase Storage에 임시 업로드 후 signed URL 발급
  const storagePath = `${member.org_id}/audit/${filename}`
  const { error: upErr } = await supabase.storage
    .from('billing-exports')
    .upload(storagePath, csv, { contentType: 'text/csv; charset=utf-8', upsert: true })

  if (upErr) {
    redirect(`/settings/audit-log?error=${encodeURIComponent('CSV 생성 실패: ' + upErr.message)}`)
  }

  const { data: signed } = await supabase.storage
    .from('billing-exports')
    .createSignedUrl(storagePath, 60 * 60 * 24)  // 24h 유효

  if (signed?.signedUrl) {
    redirect(signed.signedUrl)
  }

  redirect('/settings/audit-log?error=CSV 링크 발급 실패')
}
