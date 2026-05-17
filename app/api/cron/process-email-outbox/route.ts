import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { verifyCronAuth } from '@/lib/cron/auth'
import { processOutbox } from '@/lib/email/outbox'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: Request) {
  const unauth = verifyCronAuth(request)
  if (unauth) return unauth

  const supabase = createServiceRoleClient()
  try {
    const result = await processOutbox(supabase as never, { batchSize: 50 })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export const POST = GET
