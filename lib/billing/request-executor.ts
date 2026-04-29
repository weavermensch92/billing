/**
 * Request Execution Pipeline
 *
 * 요청이 completed 로 전이될 때 실제 업무 테이블(accounts / virtual_cards / transactions)을
 * 자동으로 변경하는 단일 진입점. action_type 별 executor가 세부 DB 반영을 담당.
 *
 * 사용처:
 *   - app/(console)/console/requests/[id]/actions.ts::updateRequestStatus (status='completed')
 *   - app/(customer)/services/new/actions.ts::createRequest (self-approve 분기)
 *   - app/(customer)/requests/[id]/actions.ts::approveSelfByAdmin
 *
 * Idempotency: action_requests.status === 'completed' 이면 early return.
 */

import { calculateProrate, prorateMerchantName, billingMonthOf } from './prorate'
import { validateLimitDecrease } from './limit-validator'
import { getVendorAdapter, logVendorCall, type VendorName } from '@/lib/vendor-api'

type SB = {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (k: string, v: unknown) => {
        single: () => Promise<{ data: unknown; error: unknown }>
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>
      }
    }
    insert: (v: Record<string, unknown> | Record<string, unknown>[]) => Promise<{ error: unknown; data?: unknown }> & {
      select: (cols: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>
      }
    }
    update: (v: Record<string, unknown>) => {
      eq: (k: string, v: unknown) => Promise<{ error: unknown }>
    }
  }
}

export interface ExecResult {
  ok: boolean
  error?: string
  affected?: Record<string, string[]> // { accounts: [id], virtual_cards: [id], transactions: [id] }
}

interface ActionRequestRow {
  id: string
  org_id: string
  action_type: string
  status: string
  account_id: string | null
  member_id: string | null
  request_data: Record<string, unknown>
  progress_state: Record<string, unknown>
  estimated_cost_krw: number
  requester_id: string | null
  resolved_at: string | null
  resolved_by: string | null
}

interface AccountRow {
  id: string
  org_id: string
  member_id: string
  service_id: string
  status: string
  monthly_limit_krw: number
  allow_overseas: boolean
}

interface ServiceRow {
  id: string
  name: string
  vendor: string
  unit_price_krw: number | null
  registration_api_mode?: string
}

interface VcnRow {
  id: string
  account_id: string
  org_id: string
  card_type: string
  card_last4: string | null
  monthly_limit_krw: number
  status: string
  allow_overseas: boolean
  mcc_whitelist: string[] | null
}

// ─── 진입점 ──────────────────────────────────────────────
export async function executeRequestCompletion(
  supabase: SB,
  requestId: string,
  context: { resolved_by?: string | null } = {},
): Promise<ExecResult> {
  const { data: reqRaw } = await supabase
    .from('action_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  const req = reqRaw as ActionRequestRow | null
  if (!req) return { ok: false, error: '요청을 찾을 수 없습니다.' }
  if (req.status === 'completed') {
    return { ok: true, affected: {} } // idempotent
  }

  let affected: ExecResult['affected'] = {}
  try {
    switch (req.action_type) {
      case 'new_account':      affected = await executeNewAccount(supabase, req); break
      case 'limit_change':     affected = await executeLimitChange(supabase, req); break
      case 'terminate':        affected = await executeTerminate(supabase, req); break
      case 'vcn_replace':      affected = await executeVcnReplace(supabase, req); break
      case 'decline_response': affected = {}; break
      case 'bulk_terminate':   affected = await executeBulkTerminate(supabase, req); break
      default:
        return { ok: false, error: `지원하지 않는 action_type: ${req.action_type}` }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  // 성공 → action_requests 를 completed 로 전이
  const now = new Date().toISOString()
  await supabase.from('action_requests').update({
    status: 'completed',
    resolved_at: now,
    resolved_by: context.resolved_by ?? null,
  }).eq('id', requestId)

  // 감사 로그
  await supabase.from('audit_logs').insert({
    org_id: req.org_id,
    actor_type: context.resolved_by ? 'admin' : 'system',
    actor_id: context.resolved_by ?? null,
    actor_email: null,
    action: 'request_executed',
    target_type: 'action_request',
    target_id: req.id,
    visibility: 'both',
    detail: {
      action_type: req.action_type,
      affected,
    },
  })

  return { ok: true, affected }
}

// ─── A. 신규 계정 ─────────────────────────────────────
async function executeNewAccount(supabase: SB, req: ActionRequestRow): Promise<ExecResult['affected']> {
  const rd = req.request_data
  const service_id = rd.service_id as string
  const member_id = (rd.target_member_id as string) ?? req.member_id
  const monthly_limit_krw = Number(rd.monthly_limit_krw ?? 0)
  const allow_overseas = Boolean(rd.allow_overseas ?? true)
  const purpose = (rd.purpose as string) ?? null

  if (!service_id || !member_id || monthly_limit_krw <= 0) {
    throw new Error('new_account: service_id / target_member_id / monthly_limit_krw 누락')
  }

  const now = new Date().toISOString()

  // 서비스 조회 — vendor / registration_api_mode 분기용
  const { data: svcRaw } = await supabase
    .from('services').select('id, name, vendor, unit_price_krw, registration_api_mode').eq('id', service_id).single()
  const svc = svcRaw as ServiceRow | null

  // 멤버 이메일 조회 (벤더 API 초대에 사용)
  const { data: memRaw } = await supabase
    .from('members').select('email').eq('id', member_id).single()
  const memberEmail = (memRaw as { email?: string } | null)?.email ?? null

  // ─── 벤더 Admin API 초대 (admin_api 모드 서비스만) ───
  let provider_user_id: string | null = null
  let provider_invite_id: string | null = null

  if (svc?.registration_api_mode === 'admin_api' && memberEmail) {
    const adapter = getVendorAdapter(svc.vendor as VendorName)
    if (adapter) {
      const inviteResult = await adapter.inviteMember({ email: memberEmail, role: 'user' })
      await logVendorCall(supabase, {
        org_id: req.org_id,
        vendor: svc.vendor as VendorName,
        operation: 'invite_member',
        request_id: req.id,
        request_body: { email: memberEmail, service_id },
        result: inviteResult,
      })

      if (!inviteResult.ok) {
        throw new Error(`벤더 초대 실패 (${svc.vendor}): ${inviteResult.error ?? 'unknown'}`)
      }
      provider_invite_id = inviteResult.data?.invite_id ?? null
    }
  }

  // accounts INSERT
  const { data: accRaw, error: accErr } = await supabase.from('accounts').insert({
    org_id: req.org_id,
    member_id,
    service_id,
    status: 'active',
    monthly_limit_krw,
    allow_overseas,
    purpose,
    activated_at: now,
    provider_user_id,
    provider_invite_id,
  }).select('id').single()
  if (accErr || !accRaw) throw new Error('accounts INSERT 실패: ' + JSON.stringify(accErr))
  const account = accRaw as { id: string }

  // virtual_cards INSERT — card_last4 는 AM 체크리스트에서 입력한 progress_state.vcn_last4 사용
  const vcn_last4 = (req.progress_state?.vcn_last4 as string) ?? null
  const { data: vcnRaw, error: vcnErr } = await supabase.from('virtual_cards').insert({
    account_id: account.id,
    org_id: req.org_id,
    card_type: 'primary',
    card_last4: vcn_last4,
    card_issuer: 'shinhan_vcn',
    status: 'issued',
    monthly_limit_krw,
    allow_overseas,
    mcc_whitelist: null,
    issued_at: now,
  }).select('id').single()
  if (vcnErr || !vcnRaw) throw new Error('virtual_cards INSERT 실패: ' + JSON.stringify(vcnErr))
  const vcn = vcnRaw as { id: string }

  return {
    accounts: [account.id],
    virtual_cards: [vcn.id],
  }
}

// ─── B/C. 한도 변경 (증액·감액 공통) ────────────────────
async function executeLimitChange(supabase: SB, req: ActionRequestRow): Promise<ExecResult['affected']> {
  const account_id = req.account_id
  const new_limit_krw = Number(req.request_data.new_limit_krw ?? 0)

  if (!account_id || new_limit_krw <= 0) {
    throw new Error('limit_change: account_id / new_limit_krw 누락')
  }

  // 감액 시 당월 사용액 초과 최종 방어 (createRequest에서 사전 차단되지만 race 대응)
  const { data: accCheck } = await supabase
    .from('accounts').select('monthly_limit_krw').eq('id', account_id).single()
  const currentLimit = (accCheck as { monthly_limit_krw?: number } | null)?.monthly_limit_krw ?? 0
  if (new_limit_krw < currentLimit) {
    const v = await validateLimitDecrease(supabase, account_id, new_limit_krw)
    if (!v.ok) {
      throw new Error(v.error ?? '감액 불가')
    }
  }

  await supabase.from('accounts').update({
    monthly_limit_krw: new_limit_krw,
  }).eq('id', account_id)

  // 해당 account의 primary VCN 한도 동기화
  const { data: vcnsRaw } = await supabase
    .from('virtual_cards').select('id').eq('account_id', account_id).single()
  const vcn = vcnsRaw as { id: string } | null
  const affected_vcn: string[] = []
  if (vcn) {
    await supabase.from('virtual_cards').update({
      monthly_limit_krw: new_limit_krw,
    }).eq('id', vcn.id)
    affected_vcn.push(vcn.id)
  }

  return { accounts: [account_id], virtual_cards: affected_vcn }
}

// ─── D. 해지 ─────────────────────────────────────────
async function executeTerminate(supabase: SB, req: ActionRequestRow): Promise<ExecResult['affected']> {
  const account_id = req.account_id
  const terminate_mode = (req.request_data.terminate_mode as string) ?? 'end_of_billing_cycle'
  if (!account_id) throw new Error('terminate: account_id 누락')

  const now = new Date()
  const nowIso = now.toISOString()

  // account 조회 (service + provider 식별자 필요)
  const { data: accRaw } = await supabase
    .from('accounts').select('*').eq('id', account_id).single()
  const account = accRaw as (AccountRow & {
    provider_user_id?: string | null
    provider_invite_id?: string | null
  }) | null
  if (!account) throw new Error('해지 대상 계정을 찾을 수 없습니다.')

  // 서비스 조회 — admin_api 모드면 벤더 측 멤버 제거
  const { data: svcEarly } = await supabase
    .from('services').select('id, name, vendor, unit_price_krw, registration_api_mode').eq('id', account.service_id).single()
  const svcForRemove = svcEarly as ServiceRow | null

  if (svcForRemove?.registration_api_mode === 'admin_api' &&
      (account.provider_user_id || account.provider_invite_id)) {
    const adapter = getVendorAdapter(svcForRemove.vendor as VendorName)
    if (adapter) {
      const removeResult = await adapter.removeMember({
        provider_user_id: account.provider_user_id ?? undefined,
        provider_invite_id: account.provider_invite_id ?? undefined,
      })
      await logVendorCall(supabase, {
        org_id: req.org_id,
        vendor: svcForRemove.vendor as VendorName,
        operation: 'remove_member',
        account_id,
        request_id: req.id,
        request_body: {
          provider_user_id: account.provider_user_id,
          provider_invite_id: account.provider_invite_id,
        },
        result: removeResult,
      })
      // 벤더 제거 실패는 경고만 — 고객 DB는 terminated 전이 계속 (AM 수동 후속 조치)
    }
  }

  // accounts → terminated
  await supabase.from('accounts').update({
    status: 'terminated',
    terminated_at: nowIso,
  }).eq('id', account_id)

  // virtual_cards → suspended (현재 active 상태인 것만)
  const { data: vcnRaw } = await supabase
    .from('virtual_cards').select('id, status').eq('account_id', account_id).single()
  const vcn = vcnRaw as { id: string; status: string } | null
  const affected_vcn: string[] = []
  if (vcn && vcn.status === 'active') {
    await supabase.from('virtual_cards').update({
      status: 'suspended',
      suspended_at: nowIso,
    }).eq('id', vcn.id)
    affected_vcn.push(vcn.id)
  }

  // immediate → pro-rated transactions INSERT
  const affected_tx: string[] = []
  if (terminate_mode === 'immediate') {
    const { data: svcRaw } = await supabase
      .from('services').select('id, name, vendor, unit_price_krw').eq('id', account.service_id).single()
    const svc = svcRaw as ServiceRow | null
    const prorate = calculateProrate(now, account.monthly_limit_krw)

    if (prorate.amountKrw > 0 && svc) {
      const { data: txRaw } = await supabase.from('transactions').insert({
        org_id: req.org_id,
        account_id,
        virtual_card_id: vcn?.id ?? null,
        service_id: account.service_id,
        amount_krw: prorate.amountKrw,
        gridge_cost_krw: prorate.amountKrw,
        customer_charge_krw: prorate.amountKrw,
        gridge_margin_krw: 0,
        is_anthropic_passthrough: svc.vendor === 'anthropic',
        status: 'settled',
        currency: 'KRW',
        merchant_name: prorateMerchantName(svc.name),
        billing_month: billingMonthOf(now),
        transacted_at: nowIso,
        settled_at: nowIso,
      }).select('id').single()
      const tx = txRaw as { id: string } | null
      if (tx) affected_tx.push(tx.id)
    }
  }

  return {
    accounts: [account_id],
    virtual_cards: affected_vcn,
    transactions: affected_tx,
  }
}

// ─── E. VCN 교체 ─────────────────────────────────────
async function executeVcnReplace(supabase: SB, req: ActionRequestRow): Promise<ExecResult['affected']> {
  const account_id = req.account_id
  if (!account_id) throw new Error('vcn_replace: account_id 누락')

  const now = new Date().toISOString()

  const { data: accRaw } = await supabase
    .from('accounts').select('id, org_id, monthly_limit_krw, allow_overseas').eq('id', account_id).single()
  const account = accRaw as Pick<AccountRow, 'id' | 'org_id' | 'monthly_limit_krw' | 'allow_overseas'> | null
  if (!account) throw new Error('계정을 찾을 수 없습니다.')

  // 기존 primary VCN → suspended
  const { data: oldRaw } = await supabase
    .from('virtual_cards').select('id, status').eq('account_id', account_id).single()
  const old = oldRaw as VcnRow | null
  const affected_old: string[] = []
  if (old && old.status === 'active') {
    await supabase.from('virtual_cards').update({
      status: 'suspended', suspended_at: now,
    }).eq('id', old.id)
    affected_old.push(old.id)
  }

  // 새 VCN INSERT (primary, issued) — card_last4는 progress_state.vcn_last4 참조
  const new_last4 = (req.progress_state?.vcn_last4 as string) ?? null
  const { data: newRaw, error: newErr } = await supabase.from('virtual_cards').insert({
    account_id,
    org_id: req.org_id,
    card_type: 'primary',
    card_last4: new_last4,
    card_issuer: 'shinhan_vcn',
    status: 'issued',
    monthly_limit_krw: account.monthly_limit_krw,
    allow_overseas: account.allow_overseas,
    issued_at: now,
  }).select('id').single()
  if (newErr || !newRaw) throw new Error('새 VCN INSERT 실패')
  const newVcn = newRaw as { id: string }

  return {
    virtual_cards: [...affected_old, newVcn.id],
  }
}

// ─── F. 일괄 해지 (부모) ───────────────────────────
async function executeBulkTerminate(supabase: SB, req: ActionRequestRow): Promise<ExecResult['affected']> {
  // 자식 요청 전체 조회 (배열)
  const childrenResp = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (k: string, v: unknown) => {
          then: (r: (v: { data: ActionRequestRow[] | null; error: unknown }) => unknown) => Promise<unknown>
        }
      }
    }
  }).from('action_requests')
    .select('*')
    .eq('parent_id', req.id)

  const children = (((childrenResp as unknown as { data: ActionRequestRow[] | null }).data) ?? [])

  const allAffected: Record<string, string[]> = {
    action_requests: [],
    accounts: [],
    virtual_cards: [],
    transactions: [],
  }

  let allSucceeded = true
  const failures: string[] = []

  for (const child of children) {
    if (child.status === 'completed') {
      allAffected.action_requests.push(child.id)
      continue
    }
    // 재귀: 자식 action_type별 executor 호출
    const r = await executeRequestCompletion(supabase, child.id, {
      resolved_by: req.resolved_by ?? null,
    })
    if (!r.ok) {
      allSucceeded = false
      failures.push(`${child.id.slice(0, 8)}: ${r.error ?? 'unknown'}`)
    } else {
      allAffected.action_requests.push(child.id)
      for (const [table, ids] of Object.entries(r.affected ?? {})) {
        if (!allAffected[table]) allAffected[table] = []
        allAffected[table].push(...ids)
      }
    }
  }

  // offboarding_events 상태: 모든 자식 성공 시 completed, 부분 실패 시 in_progress 유지
  const { data: offRaw } = await supabase
    .from('offboarding_events').select('id').eq('parent_request_id', req.id).maybeSingle()
  const off = offRaw as { id: string } | null
  if (off && allSucceeded) {
    await supabase.from('offboarding_events').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', off.id)
  }

  allAffected.offboarding_events = off ? [off.id] : []

  if (!allSucceeded) {
    throw new Error(`부분 실패: ${failures.join(' / ')}`)
  }

  return allAffected
}
