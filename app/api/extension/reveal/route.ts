import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Extension → POST /api/extension/reveal { vcn_id, purpose_url }
 *
 * 응답: { card_number, expiry, cvv } (일시 반환, 서버 저장 없음)
 *
 * 보안 원칙:
 * - Mock 모드에서는 fake test card number 반환 (UI 검증 전용)
 * - 실제 Supabase 모드에서는 카드사 포털(신한 V-Card)에서 실시간 fetch 하는 프록시 필요
 *   → Phase 1 에서 구현. 현재는 "실제 DB에 번호 없음 — 카드사 포털에서 조회" 메시지 반환
 * - 어느 모드든 audit_logs 에 visibility='internal_only' 로 기록
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: cors() })

  const body = await request.json().catch(() => ({}))
  const vcn_id = body.vcn_id as string | undefined
  const purpose_url = (body.purpose_url as string | undefined) ?? ''
  if (!vcn_id) return NextResponse.json({ error: 'vcn_id required' }, { status: 400, headers: cors() })

  const { data: member } = await supabase
    .from('members').select('id, org_id, role').eq('user_id', user.id).eq('status', 'active').single()
  if (!member) return NextResponse.json({ error: 'no_member' }, { status: 403, headers: cors() })
  const m = member as { id: string; org_id: string; role: string }

  // VCN 조회 + 권한 검증
  const { data: vcnRaw } = await supabase
    .from('virtual_cards').select('id, account_id, org_id, card_last4, status').eq('id', vcn_id).single()
  const vcn = vcnRaw as { id: string; account_id: string; org_id: string; card_last4: string | null; status: string } | null
  if (!vcn) return NextResponse.json({ error: 'vcn_not_found' }, { status: 404, headers: cors() })
  if (vcn.org_id !== m.org_id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: cors() })
  }
  if (vcn.status !== 'active' && vcn.status !== 'issued' && vcn.status !== 'delivered') {
    return NextResponse.json({ error: `vcn_not_usable (status=${vcn.status})` }, { status: 400, headers: cors() })
  }

  // Member 제한: 본인 계정 VCN 만
  if (m.role === 'member') {
    const { data: acc } = await supabase
      .from('accounts').select('member_id').eq('id', vcn.account_id).single()
    if ((acc as { member_id?: string } | null)?.member_id !== m.id) {
      return NextResponse.json({ error: 'forbidden_foreign_account' }, { status: 403, headers: cors() })
    }
  }

  // 감사 로그 (internal_only 금액 민감)
  await supabase.from('audit_logs').insert({
    org_id: vcn.org_id,
    actor_type: 'member',
    actor_id: m.id,
    actor_email: user.email ?? null,
    action: 'vcn_reveal_extension',
    target_type: 'virtual_card',
    target_id: vcn_id,
    visibility: 'internal_only',
    detail: { purpose_url, card_last4: vcn.card_last4 },
  })

  // Mock 모드: 테스트용 가짜 카드번호
  // 실제: 카드사 포털 API 프록시 (Phase 1)
  const isMock = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'
  if (isMock) {
    // Stripe test card format + card_last4 일치 (예: 4242 4242 4242 1234)
    const last4 = vcn.card_last4 ?? '1234'
    return NextResponse.json({
      card_number: `4242 4242 4242 ${last4}`,
      expiry: '12/28',
      cvv: '123',
      card_last4: last4,
      mock: true,
      ttl_seconds: 120,
      warning: 'Mock test card. 실제 결제 불가.',
    }, { headers: cors() })
  }

  // 실제 모드 (Phase 0): 전체번호 DB 저장 안 함 원칙 → 카드사 포털 안내
  return NextResponse.json({
    error: 'card_data_not_in_db',
    message: '전체 카드번호는 신한 V-Card 포털에서 조회하세요. Phase 1에서 API 프록시 예정.',
    card_last4: vcn.card_last4,
    portal_url: 'https://vcard.shinhancard.com/corp/',
  }, { status: 501, headers: cors() })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() })
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
