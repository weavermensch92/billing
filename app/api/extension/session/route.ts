import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Extension → GET /api/extension/session
// 현재 로그인 상태 + 조직 정보 반환
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ authenticated: false }, {
      status: 200,
      headers: corsHeaders(),
    })
  }

  const { data: member } = await supabase
    .from('members').select('id, org_id, name, email, role').eq('user_id', user.id).eq('status', 'active').single()

  if (!member) {
    return NextResponse.json({ authenticated: false, reason: 'no_org_membership' }, {
      status: 200,
      headers: corsHeaders(),
    })
  }

  const { data: org } = await supabase
    .from('orgs').select('name').eq('id', (member as { org_id: string }).org_id).single()

  return NextResponse.json({
    authenticated: true,
    member: {
      id: (member as { id: string }).id,
      name: (member as { name: string }).name,
      email: (member as { email: string }).email,
      role: (member as { role: string }).role,
    },
    org: {
      id: (member as { org_id: string }).org_id,
      name: (org as { name: string } | null)?.name ?? '',
    },
  }, { headers: corsHeaders() })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}
