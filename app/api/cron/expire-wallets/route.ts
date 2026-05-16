/**
 * Cron — 일별 만료 처리 (wallet + vendor token)
 * Vercel Cron: 매일 자정 (KST 09:00 UTC)
 *
 * 처리:
 *   1) expire_wallet_charges RPC — 만료된 wallet status='expired' + writeoff ledger
 *   2) expire_vendor_tokens RPC — 만료된 vendor_admin_tokens status='expired'
 */

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { expireExpiredCharges } from '@/lib/billing/wallet'
import { expireVendorTokens } from '@/lib/vendor-api/token-broker'
import { verifyCronAuth } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const unauth = verifyCronAuth(request)
  if (unauth) return unauth

  const supabase = createServiceRoleClient()
  try {
    const walletExpired = await expireExpiredCharges(supabase as never)
    const tokenExpired = await expireVendorTokens(supabase as never)
    return NextResponse.json({ ok: true, walletExpired, tokenExpired })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export const POST = GET
