import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { confirmCharge } from './actions'

export default async function ChargeDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { error?: string; ok?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: admin } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!admin) redirect('/console/login')

  const { data: req } = await supabase
    .from('action_requests')
    .select('*, org:orgs(name, business_registration_number, default_discount_rate), requester:members!action_requests_requester_id_fkey(name, email)')
    .eq('id', params.id)
    .eq('action_type', 'charge_request')
    .maybeSingle()

  if (!req) notFound()

  const rd = (req.request_data ?? {}) as Record<string, unknown>
  const gross = Number(rd.amount_krw_gross ?? 0)
  const rate = Number(rd.discount_rate ?? 0)
  const net = gross - Math.round(gross * rate)
  const taxContact = rd.tax_contact as { name?: string; email?: string; phone?: string } | undefined
  const bizNo = rd.business_registration_number as string | undefined
  const status = (req as Record<string, unknown>).status as string
  const isPending = status === 'pending' || status === 'awaiting_gate'

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <div className="text-xs text-gray-500 mb-1">충전 신청 검토</div>
        <h1 className="text-2xl font-semibold">{(req.org as { name?: string } | null)?.name ?? '?'}</h1>
      </div>

      {searchParams.error && (
        <div className="border-l-[3px] border-l-red-500 pl-3 py-2 text-sm text-red-700 bg-red-50">{searchParams.error}</div>
      )}
      {searchParams.ok && (
        <div className="border-l-[3px] border-l-green-500 pl-3 py-2 text-sm text-green-700 bg-green-50">
          컨펌 완료 · wallet_charges INSERT + 슬랙 자동 포스팅됨
        </div>
      )}

      <div className="border border-gray-200 p-5 space-y-3 text-sm">
        <Row label="신청자" value={`${(req as Record<string, { name?: string; email?: string } | null>).requester?.name ?? '?'} (${(req as Record<string, { name?: string; email?: string } | null>).requester?.email ?? '?'})`} />
        <Row label="신청 시각" value={new Date(req.created_at).toLocaleString('ko-KR')} />
        <Row label="신청 (gross)" value={`₩${gross.toLocaleString('ko-KR')}`} mono />
        <Row label="할인율" value={`${(rate * 100).toFixed(0)}%`} mono />
        <Row label="세계 발행액 (net)" value={`₩${net.toLocaleString('ko-KR')}`} mono bold />
        {bizNo && <Row label="사업자등록번호" value={bizNo} mono />}
        {taxContact && (
          <>
            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs text-gray-500 mb-2">세금계산서 담당자</div>
              <Row label="이름" value={taxContact.name ?? '?'} />
              <Row label="이메일" value={taxContact.email ?? '?'} />
              {taxContact.phone && <Row label="전화" value={taxContact.phone} />}
            </div>
          </>
        )}
      </div>

      {isPending ? (
        <form action={confirmCharge.bind(null, params.id)} className="space-y-3">
          <button type="submit" className="w-full py-3 bg-black text-white text-sm font-medium">
            컨펌 (Gate #1)
          </button>
          <div className="text-xs text-gray-500 text-center">
            컨펌 시 wallet_charges(pending) INSERT + #세금계산서 채널 자동 포스팅.
            세무 담당자가 슬랙 ✅ 리액션 시 자동 active 전이.
          </div>
        </form>
      ) : (
        <div className="border-l-[3px] border-l-gray-300 pl-3 py-2 text-sm text-gray-600">
          상태: <span className="font-mono">{status}</span>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`${mono ? 'font-mono' : ''} ${bold ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  )
}
