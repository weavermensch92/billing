/**
 * Usage Allocator — FIFO 다중 wallet 차감 + 환차 변환
 *
 * 벤더 청구서 1 라인 (USD)을 그릿지 wallet에서 KRW로 차감.
 * 한 라인이 여러 wallet에 FIFO 걸칠 수 있음 → 라인당 여러 usage_allocations row.
 *
 * 환차 흡수 (충전 시점 환율 기준):
 *   - 고객 차감액 KRW = USD × wallet.exchange_rate_at_charge
 *   - 그릿지 실 지출 KRW = USD × market_rate
 *   - fx_pnl_krw = market - charged (양수 = 그릿지 손실)
 *
 * 매핑 (멤버·팀):
 *   - api_key_match     : item.meta.api_key_id → accounts → team
 *   - member_email_match: item.meta.member_email → accounts → team
 *   - default_unassigned: 매핑 실패 → 미할당 팀
 *
 * 참조:
 *   - allocate_invoice_item_single (M-1008 RPC) — 단일 wallet 차감 1회
 *   - wallet_charges FIFO 조회 (M-1001)
 *   - accounts.approval_status (M-1012) — rejected 멤버 처리
 */

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export type AllocationBasis = 'api_key_match' | 'member_email_match' | 'manual' | 'default_unassigned'

export interface ItemAllocationResult {
  itemId: string
  allocations: Array<{
    id: string
    walletChargeId: string
    amountUsd: number
    amountKrwCharged: number
    amountKrwAtMarket: number
    fxPnlKrw: number
  }>
  totalChargedKrw: number
  totalMarketKrw: number
  totalFxPnlKrw: number
  unallocatedUsd: number // 잔액 부족 시 남은 USD
  basis: AllocationBasis
  teamId: string
  memberId: string | null
}

interface InvoiceItemMin {
  id: string
  invoice_id: string
  item_type: string
  amount_usd: number
  amount_krw: number
  meta: Record<string, unknown>
  invoice: {
    org_id: string
  }
}

interface WalletChargeMin {
  id: string
  exchange_rate_at_charge: number | null
  amount_krw_net: number
  amount_krw_used: number
  expires_at: string
  applied_at: string
}

/**
 * 벤더 청구서 라인 1개를 FIFO로 wallet 차감.
 *
 * 단계:
 *   1) 매핑 결정 (member·team·basis)
 *   2) 활성 wallet FIFO 조회
 *   3) USD 잔여만큼 각 wallet에서 wallet 환율로 변환·차감 (allocate_invoice_item_single RPC)
 *   4) USD 소진 또는 wallet 고갈까지 반복
 *
 * 매핑 안 된 멤버 (approval_status='rejected') 또는 매핑 실패는 미할당 팀.
 */
export async function allocateInvoiceItem(
  supabase: SBLike,
  itemId: string,
  marketRate: number,
  opts?: {
    manualTeamId?: string
    manualMemberId?: string
  },
): Promise<ItemAllocationResult> {
  // 1) 아이템 + invoice 조회
  const item = await fetchItemWithInvoice(supabase, itemId)
  if (!item) {
    throw new Error(`invoice item not found: ${itemId}`)
  }

  // 2) 매핑 결정
  const mapping = await resolveMapping(supabase, item, opts)

  // 3) FIFO wallet 조회 (active + 잔여 있음)
  const wallets = await fetchActiveWalletsFifo(supabase, item.invoice.org_id)

  // 4) 차감 루프
  const allocations: ItemAllocationResult['allocations'] = []
  let remainingUsd = item.amount_usd
  let totalChargedKrw = 0
  let totalMarketKrw = 0

  for (const wallet of wallets) {
    if (remainingUsd <= 0) break
    if (!wallet.exchange_rate_at_charge) continue // 환율 미설정 wallet은 skip (안전장치)

    const walletRemainingKrw = wallet.amount_krw_net - wallet.amount_krw_used
    if (walletRemainingKrw <= 0) continue

    // 이 wallet에서 차감할 USD·KRW 계산
    const walletRate = Number(wallet.exchange_rate_at_charge)
    const usdAffordableByWallet = walletRemainingKrw / walletRate
    const takeUsd = Math.min(remainingUsd, usdAffordableByWallet)

    // RPC 호출 (단일 wallet 차감)
    const { data, error } = await supabase.rpc('allocate_invoice_item_single', {
      p_item_id: item.id,
      p_wallet_charge_id: wallet.id,
      p_amount_usd: takeUsd,
      p_market_rate: marketRate,
      p_team_id: mapping.teamId,
      p_member_id: mapping.memberId,
      p_basis: mapping.basis,
    })

    if (error) {
      throw new Error(`allocate_invoice_item_single failed: ${JSON.stringify(error)}`)
    }

    const allocationId = String(data)
    const amountKrwCharged = Math.round(takeUsd * walletRate)
    const amountKrwAtMarket = Math.round(takeUsd * marketRate)
    const fxPnlKrw = amountKrwAtMarket - amountKrwCharged

    allocations.push({
      id: allocationId,
      walletChargeId: wallet.id,
      amountUsd: takeUsd,
      amountKrwCharged,
      amountKrwAtMarket,
      fxPnlKrw,
    })

    totalChargedKrw += amountKrwCharged
    totalMarketKrw += amountKrwAtMarket
    remainingUsd -= takeUsd
  }

  return {
    itemId: item.id,
    allocations,
    totalChargedKrw,
    totalMarketKrw,
    totalFxPnlKrw: totalMarketKrw - totalChargedKrw,
    unallocatedUsd: remainingUsd,
    basis: mapping.basis,
    teamId: mapping.teamId,
    memberId: mapping.memberId,
  }
}

/** 벤더 청구서 전체 라인을 batch 처리 */
export async function allocateInvoice(
  supabase: SBLike,
  vendorInvoiceId: string,
  marketRate: number,
): Promise<{
  totalItems: number
  successfulAllocations: number
  unallocatedItems: string[] // 잔액 부족으로 일부/전부 미차감
  totalFxPnlKrw: number
}> {
  const { data: items } = (await supabase
    .from('vendor_invoice_items')
    .select('id')
    .eq('invoice_id', vendorInvoiceId)) as { data: Array<{ id: string }> | null }

  let totalItems = 0
  let success = 0
  let totalFxPnl = 0
  const unallocated: string[] = []

  for (const item of items ?? []) {
    totalItems += 1
    try {
      const result = await allocateInvoiceItem(supabase, item.id, marketRate)
      if (result.unallocatedUsd > 0.0001) {
        unallocated.push(item.id)
      } else {
        success += 1
      }
      totalFxPnl += result.totalFxPnlKrw
    } catch (e) {
      unallocated.push(item.id)
    }
  }

  return {
    totalItems,
    successfulAllocations: success,
    unallocatedItems: unallocated,
    totalFxPnlKrw: totalFxPnl,
  }
}

// ─── 내부 헬퍼 ────────────────────────────────────────────

async function fetchItemWithInvoice(supabase: SBLike, itemId: string): Promise<InvoiceItemMin | null> {
  const { data } = (await supabase
    .from('vendor_invoice_items')
    .select('id, invoice_id, item_type, amount_usd, amount_krw, meta, invoice:vendor_invoices(org_id)')
    .eq('id', itemId)
    .maybeSingle()) as { data: InvoiceItemMin | null }
  return data
}

async function fetchActiveWalletsFifo(supabase: SBLike, orgId: string): Promise<WalletChargeMin[]> {
  const { data } = (await supabase
    .from('wallet_charges')
    .select('id, exchange_rate_at_charge, amount_krw_net, amount_krw_used, expires_at, applied_at')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('expires_at', { ascending: true })
    .order('applied_at', { ascending: true })) as { data: WalletChargeMin[] | null }

  return (data ?? []).filter((w) => w.amount_krw_net > w.amount_krw_used)
}

/**
 * 매핑 결정 우선순위:
 *   1) opts.manualTeamId/memberId → 'manual'
 *   2) item.meta.api_key_id → accounts.provider_user_id 등으로 멤버·팀 찾기 → 'api_key_match'
 *   3) item.meta.member_email → accounts.email로 찾기 → 'member_email_match'
 *   4) 매핑 실패 또는 멤버.approval_status='rejected' → 미할당 팀 → 'default_unassigned'
 */
async function resolveMapping(
  supabase: SBLike,
  item: InvoiceItemMin,
  opts?: { manualTeamId?: string; manualMemberId?: string },
): Promise<{ basis: AllocationBasis; teamId: string; memberId: string | null }> {
  // 1) Manual
  if (opts?.manualTeamId) {
    return { basis: 'manual', teamId: opts.manualTeamId, memberId: opts.manualMemberId ?? null }
  }

  // 2) api_key_match
  const apiKeyId = typeof item.meta?.api_key_id === 'string' ? item.meta.api_key_id : null
  if (apiKeyId) {
    const mapped = await mapByApiKey(supabase, item.invoice.org_id, apiKeyId)
    if (mapped) return { basis: 'api_key_match', ...mapped }
  }

  // 3) member_email_match
  const memberEmail = typeof item.meta?.member_email === 'string' ? item.meta.member_email : null
  if (memberEmail) {
    const mapped = await mapByEmail(supabase, item.invoice.org_id, memberEmail)
    if (mapped) return { basis: 'member_email_match', ...mapped }
  }

  // 4) Fallback: 미할당 팀
  const unassignedTeam = await fetchUnassignedTeam(supabase, item.invoice.org_id)
  return { basis: 'default_unassigned', teamId: unassignedTeam, memberId: null }
}

async function mapByApiKey(
  supabase: SBLike,
  orgId: string,
  apiKeyId: string,
): Promise<{ teamId: string; memberId: string | null } | null> {
  // 키 → account → member → team
  // 가정: api_keys 테이블이 있고 (provider_key_id, account_id, member_id)
  const { data } = (await supabase
    .from('api_keys')
    .select('member:members(id, team_id, approval_status:account_approval_status)')
    .eq('provider_key_id', apiKeyId)
    .eq('org_id', orgId)
    .maybeSingle()) as { data: { member: { id: string; team_id: string | null; approval_status?: string } | null } | null }

  if (!data?.member) return null
  if (data.member.approval_status === 'rejected') return null // f3: rejected 멤버 매핑 X
  if (!data.member.team_id) return null

  return { teamId: data.member.team_id, memberId: data.member.id }
}

async function mapByEmail(
  supabase: SBLike,
  orgId: string,
  email: string,
): Promise<{ teamId: string; memberId: string | null } | null> {
  const { data } = (await supabase
    .from('members')
    .select('id, team_id, account_approval_status')
    .eq('org_id', orgId)
    .eq('email', email)
    .maybeSingle()) as { data: { id: string; team_id: string | null; account_approval_status?: string } | null }

  if (!data) return null
  if (data.account_approval_status === 'rejected') return null
  if (!data.team_id) return null

  return { teamId: data.team_id, memberId: data.id }
}

async function fetchUnassignedTeam(supabase: SBLike, orgId: string): Promise<string> {
  const { data } = (await supabase
    .from('teams')
    .select('id')
    .eq('org_id', orgId)
    .eq('is_unassigned', true)
    .maybeSingle()) as { data: { id: string } | null }

  if (!data) {
    throw new Error(`unassigned team not found for org ${orgId}. M-1007 트리거가 자동 생성해야 함.`)
  }
  return data.id
}
