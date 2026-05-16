'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { submitChargeRequest } from '@/lib/actions/v2-billing'

export async function createChargeRequest(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, org_id, role, org:orgs(name, business_registration_number)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!member) redirect('/login')

  // 어드민만 충전 신청 가능
  if (member.role !== 'owner' && member.role !== 'admin') {
    redirect(`/billing/charge?error=${encodeURIComponent('어드민만 충전 신청 가능합니다.')}`)
  }

  const grossKrw = Number(formData.get('amount_krw_gross') ?? 0)
  if (grossKrw <= 0) {
    redirect(`/billing/charge?error=${encodeURIComponent('충전 금액을 입력하세요.')}`)
  }

  // 현재 Org 할인율 조회
  const { data: discount } = await supabase
    .from('v_org_active_discount')
    .select('discount_rate')
    .eq('org_id', member.org_id)
    .maybeSingle()
  const rate = discount?.discount_rate ?? 0

  const taxContact = {
    name: String(formData.get('tax_contact_name') ?? ''),
    email: String(formData.get('tax_contact_email') ?? ''),
    phone: (formData.get('tax_contact_phone') as string) || undefined,
  }

  if (!taxContact.name || !taxContact.email) {
    redirect(`/billing/charge?error=${encodeURIComponent('세금계산서 담당자 정보를 입력하세요.')}`)
  }

  const orgRow = (member as unknown as { org?: { name?: string; business_registration_number?: string } | null }).org
  const orgName = orgRow?.name ?? ''
  const bizRegNo = orgRow?.business_registration_number

  const result = await submitChargeRequest(supabase as never, {
    orgId: member.org_id,
    requesterId: member.id,
    grossKrw,
    discountRate: rate,
    refundable: true,
    orgName,
    taxContact,
    businessRegistrationNumber: bizRegNo,
  })

  if (!result.ok) {
    redirect(`/billing/charge?error=${encodeURIComponent(result.error ?? '충전 신청 실패')}`)
  }

  revalidatePath('/billing/wallet')
  redirect(`/billing/charge?ok=${result.requestId}&awaiting=super_admin`)
}
