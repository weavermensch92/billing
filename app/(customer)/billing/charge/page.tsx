import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createChargeRequest } from './actions'

export default async function ChargePage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string; awaiting?: string }
}) {
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

  if (member.role !== 'owner' && member.role !== 'admin') {
    redirect('/billing/wallet?error=' + encodeURIComponent('어드민만 접근 가능'))
  }

  const orgRow = (member as unknown as { org?: { name?: string; business_registration_number?: string } }).org
  const { data: discount } = await supabase
    .from('v_org_active_discount')
    .select('discount_rate')
    .eq('org_id', member.org_id)
    .maybeSingle()
  const rate = discount?.discount_rate ?? 0

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-semibold">충전 신청</h1>

      {searchParams.error && (
        <div className="border-l-[3px] border-l-red-500 pl-3 py-2 text-sm text-red-700 bg-red-50">
          {searchParams.error}
        </div>
      )}
      {searchParams.ok && (
        <div className="border-l-[3px] border-l-green-500 pl-3 py-2 text-sm text-green-700 bg-green-50">
          신청 완료 · 슈퍼어드민 컨펌 대기 중 (요청 ID: {searchParams.ok})
        </div>
      )}

      <form action={createChargeRequest} className="space-y-5 border border-gray-200 p-6">
        <div>
          <label className="block text-sm font-medium mb-1">충전 신청 금액 (KRW, gross)</label>
          <input
            name="amount_krw_gross"
            type="number"
            min="0"
            step="100000"
            required
            className="w-full border border-gray-300 px-3 py-2 font-mono"
            placeholder="10000000"
          />
          {rate > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              현재 할인율 {(rate * 100).toFixed(0)}% 적용. 실 입금액 = gross × (1 - {rate}) (세금계산서 발행액)
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-medium mb-3">세금계산서 담당자</h3>
          <div className="grid grid-cols-2 gap-3">
            <input name="tax_contact_name" type="text" required placeholder="담당자 이름" className="border border-gray-300 px-3 py-2 text-sm" />
            <input name="tax_contact_email" type="email" required placeholder="이메일" className="border border-gray-300 px-3 py-2 text-sm" />
            <input name="tax_contact_phone" type="tel" placeholder="전화 (선택)" className="border border-gray-300 px-3 py-2 text-sm col-span-2" />
          </div>
        </div>

        {orgRow?.business_registration_number && (
          <div className="text-xs text-gray-500">
            사업자등록번호: <span className="font-mono">{orgRow.business_registration_number}</span>
          </div>
        )}

        <div className="pt-3 border-t border-gray-100">
          <button type="submit" className="w-full py-3 bg-black text-white text-sm font-medium">
            충전 신청
          </button>
          <div className="text-xs text-gray-500 mt-2 text-center">
            슈퍼어드민 컨펌 후 #세금계산서 채널에 자동 포스팅됩니다 (Gate #1)
          </div>
        </div>
      </form>
    </div>
  )
}
