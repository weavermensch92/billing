/**
 * Vendor Member Sync — 1h 주기 멤버 동기화 + 그림자 감지
 *
 * 흐름:
 *   1) 활성 vendor_admin_tokens 전체 조회
 *   2) 각 토큰별로 벤더 어댑터 listMembers 호출
 *   3) 그릿지 accounts(org, vendor, workspace)와 diff
 *      - 벤더에만 있음 → 그림자 → register_shadow_member_pending RPC (M-1012)
 *      - 그릿지에만 있음 (status active) → 벤더에서 삭제됨 → status='terminated'
 *   4) member_sync_jobs / events 기록
 *
 * 참조:
 *   - member_sync_jobs / member_sync_events (M-1004)
 *   - register_shadow_member_pending (M-1012, f3 24h 검수)
 */

import { getDecryptedToken } from './token-broker'
import { getVendorAdapter } from './index'

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface SyncJobResult {
  jobId: string
  tokenId: string
  orgId: string
  vendor: string
  vendorWorkspaceId: string
  added: number
  removed: number
  unchanged: number
  errors: string[]
  durationMs: number
}

/** 단일 토큰 sync. */
export async function syncTokenMembers(
  supabase: SBLike,
  tokenRow: {
    id: string
    org_id: string
    vendor: string
    vendor_workspace_id: string
  },
): Promise<SyncJobResult> {
  const started = Date.now()
  const errors: string[] = []
  let added = 0
  let removed = 0
  let unchanged = 0

  // job 시작 기록
  const { data: job } = (await supabase
    .from('member_sync_jobs')
    .insert({
      vendor: tokenRow.vendor,
      vendor_workspace_id: tokenRow.vendor_workspace_id,
      org_id: tokenRow.org_id,
      token_id: tokenRow.id,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()) as { data: { id: string } | null }

  const jobId = job?.id ?? ''

  try {
    // 1) 토큰 복호화
    const decrypted = await getDecryptedToken(supabase, {
      orgId: tokenRow.org_id,
      vendor: tokenRow.vendor,
      vendorWorkspaceId: tokenRow.vendor_workspace_id,
      usedFor: 'member_sync',
    })
    if (!decrypted) throw new Error('token missing or revoked')

    // 2) 벤더 어댑터 호출
    const adapter = getVendorAdapter(tokenRow.vendor)
    if (!adapter || typeof adapter.listWorkspaceMembers !== 'function') {
      throw new Error(`vendor adapter ${tokenRow.vendor} does not implement listWorkspaceMembers`)
    }
    const vendorListResult = await adapter.listWorkspaceMembers({
      vendorWorkspaceId: tokenRow.vendor_workspace_id,
      adminToken: decrypted.token,
    })
    if (!vendorListResult.ok) {
      throw new Error(`vendor listWorkspaceMembers failed: ${vendorListResult.error}`)
    }
    const vendorMembers = vendorListResult.members // [{ vendorUserId, email, role, addedAt? }, ...]

    // 3) 그릿지 accounts 조회
    const { data: gridgeAccounts } = (await supabase
      .from('accounts')
      .select('id, provider_user_id, email, status, approval_status')
      .eq('org_id', tokenRow.org_id)
      .eq('provider', tokenRow.vendor)
      .neq('status', 'terminated')) as { data: Array<{ id: string; provider_user_id: string; email: string | null; status: string; approval_status?: string }> | null }

    const gridgeMap = new Map((gridgeAccounts ?? []).map((a) => [a.provider_user_id, a]))
    const vendorIdSet = new Set(vendorMembers.map((m) => m.vendorUserId))

    // 4a) 신규 멤버 → 그림자
    for (const vm of vendorMembers) {
      if (gridgeMap.has(vm.vendorUserId)) {
        unchanged += 1
        continue
      }

      // shadow finding INSERT + register_shadow_member_pending
      const { data: finding } = (await supabase
        .from('shadow_member_findings')
        .upsert(
          {
            vendor: tokenRow.vendor,
            vendor_workspace_id: tokenRow.vendor_workspace_id,
            vendor_user_id: vm.vendorUserId,
            vendor_user_email: vm.email ?? null,
            org_id: tokenRow.org_id,
            detected_at: new Date().toISOString(),
          },
          { onConflict: 'vendor,vendor_workspace_id,vendor_user_id' },
        )
        .select('id')
        .single()) as { data: { id: string } | null }

      if (finding) {
        const { error: regErr } = await supabase.rpc('register_shadow_member_pending', {
          p_finding_id: finding.id,
          p_vendor: tokenRow.vendor,
          p_vendor_user_id: vm.vendorUserId,
          p_vendor_user_email: vm.email ?? null,
          p_org_id: tokenRow.org_id,
          p_default_team_id: null, // 미할당 팀 자동 fallback
        })
        if (regErr) {
          errors.push(`register_shadow ${vm.vendorUserId}: ${JSON.stringify(regErr)}`)
        } else {
          added += 1
        }
      }

      await supabase.from('member_sync_events').insert({
        job_id: jobId,
        event_type: 'added',
        account_id: null,
        vendor_user_id: vm.vendorUserId,
        vendor_user_email: vm.email ?? null,
        detail: { source: 'sync', role: vm.role },
      })
    }

    // 4b) 사라진 멤버 → terminated
    for (const [vendorUserId, account] of gridgeMap) {
      if (vendorIdSet.has(vendorUserId)) continue
      // 벤더에서 더 이상 안 보임 → 그릿지 측 terminated
      await supabase
        .from('accounts')
        .update({ status: 'terminated' })
        .eq('id', account.id)

      await supabase.from('member_sync_events').insert({
        job_id: jobId,
        event_type: 'removed',
        account_id: account.id,
        vendor_user_id: vendorUserId,
        vendor_user_email: account.email,
      })
      removed += 1
    }
  } catch (e) {
    errors.push(String(e))
  }

  const finalStatus = errors.length === 0 ? 'completed' : 'failed'
  await supabase
    .from('member_sync_jobs')
    .update({
      status: finalStatus,
      finished_at: new Date().toISOString(),
      added_count: added,
      removed_count: removed,
      unchanged_count: unchanged,
      error_detail: errors.length > 0 ? { errors } : null,
    })
    .eq('id', jobId)

  return {
    jobId,
    tokenId: tokenRow.id,
    orgId: tokenRow.org_id,
    vendor: tokenRow.vendor,
    vendorWorkspaceId: tokenRow.vendor_workspace_id,
    added,
    removed,
    unchanged,
    errors,
    durationMs: Date.now() - started,
  }
}

/** pg_cron 1h 진입점 — 모든 활성 토큰 일괄 sync */
export async function runHourlyMemberSync(supabase: SBLike): Promise<SyncJobResult[]> {
  const { data: tokens } = (await supabase
    .from('vendor_admin_tokens')
    .select('id, org_id, vendor, vendor_workspace_id')
    .eq('status', 'active')) as {
    data: Array<{ id: string; org_id: string; vendor: string; vendor_workspace_id: string }> | null
  }

  const results: SyncJobResult[] = []
  for (const t of tokens ?? []) {
    try {
      results.push(await syncTokenMembers(supabase, t))
    } catch (e) {
      results.push({
        jobId: '',
        tokenId: t.id,
        orgId: t.org_id,
        vendor: t.vendor,
        vendorWorkspaceId: t.vendor_workspace_id,
        added: 0,
        removed: 0,
        unchanged: 0,
        errors: [String(e)],
        durationMs: 0,
      })
    }
  }
  return results
}
