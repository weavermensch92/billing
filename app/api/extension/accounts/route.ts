import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Extension → GET /api/extension/accounts
// 현재 멤버가 접근 가능한 AI 서비스 계정 목록 (VCN 정보 포함, 단 card_last4 만)
// Owner/Admin → 조직 전체 / Member → 본인만
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: cors() })

  const { data: member } = await supabase
    .from('members').select('id, org_id, role').eq('user_id', user.id).eq('status', 'active').single()
  if (!member) return NextResponse.json({ error: 'no_member' }, { status: 403, headers: cors() })

  const m = member as { id: string; org_id: string; role: string }
  const isPrivileged = m.role === 'owner' || m.role === 'admin'

  // accounts + service + vcn 조인
  const accRes = await supabase.from('accounts')
    .select('id, status, monthly_limit_krw, member_id, service:services!service_id(id, name, vendor), member:members!member_id(name, email)')
    .eq('org_id', m.org_id)
    .eq('status', 'active')

  let accounts = (accRes.data ?? []) as unknown as Array<{
    id: string
    status: string
    monthly_limit_krw: number
    member_id: string
    service: { id: string; name: string; vendor: string } | null
    member: { name: string; email: string } | null
  }>

  if (!isPrivileged) {
    accounts = accounts.filter(a => a.member_id === m.id)
  }

  // 각 account 의 primary VCN (card_last4 만)
  const result = await Promise.all(accounts.map(async (a) => {
    const vcnRes = await supabase.from('virtual_cards')
      .select('id, card_last4, card_issuer, status')
      .eq('account_id', a.id)
      .eq('card_type', 'primary')
      .single()
    const vcn = vcnRes.data as { id: string; card_last4: string | null; card_issuer: string; status: string } | null
    return {
      account_id: a.id,
      member_name: a.member?.name ?? '',
      member_email: a.member?.email ?? '',
      service_name: a.service?.name ?? '',
      service_vendor: a.service?.vendor ?? '',
      monthly_limit_krw: a.monthly_limit_krw,
      vcn: vcn ? {
        id: vcn.id,
        card_last4: vcn.card_last4,
        card_issuer: vcn.card_issuer,
        status: vcn.status,
      } : null,
    }
  }))

  return NextResponse.json({ accounts: result }, { headers: cors() })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() })
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
