import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

interface PendingChargeRequest {
  id: string
  org_id: string
  request_data: Record<string, unknown>
  estimated_cost_krw: number
  created_at: string
  org?: { name?: string }
  requester?: { name?: string; email?: string }
}

export default async function ConsoleChargesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: admin } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!admin) redirect('/console/login')

  const { data: pending } = await supabase
    .from('action_requests')
    .select('id, org_id, request_data, estimated_cost_krw, created_at, org:orgs(name), requester:members!action_requests_requester_id_fkey(name, email)')
    .eq('action_type', 'charge_request')
    .in('status', ['pending', 'awaiting_gate'])
    .order('created_at', { ascending: true })

  const requests = (pending ?? []) as PendingChargeRequest[]

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">충전 컨펌 (Gate #1)</h1>
        <div className="text-sm text-gray-500">대기 {requests.length}건</div>
      </div>

      {requests.length === 0 && (
        <div className="border border-gray-200 p-8 text-center text-gray-400">
          대기 중인 충전 신청 없음
        </div>
      )}

      <div className="space-y-3">
        {requests.map((r) => {
          const gross = Number(r.request_data?.amount_krw_gross ?? 0)
          const rate = Number(r.request_data?.discount_rate ?? 0)
          const net = gross - Math.round(gross * rate)
          const taxContact = r.request_data?.tax_contact as { name?: string; email?: string } | undefined
          return (
            <div key={r.id} className="border border-gray-200 p-5 flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{r.org?.name ?? r.org_id.slice(0, 8)}</span>
                  <span className="text-xs text-gray-400 font-mono">{new Date(r.created_at).toLocaleString('ko-KR')}</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">신청 (gross)</div>
                    <div className="font-mono">₩{gross.toLocaleString('ko-KR')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">할인율</div>
                    <div className="font-mono">{(rate * 100).toFixed(0)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">세계 발행액 (net)</div>
                    <div className="font-mono font-semibold">₩{net.toLocaleString('ko-KR')}</div>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  신청자: {r.requester?.name ?? '?'} ({r.requester?.email ?? '?'}) ·
                  {taxContact && ` 세무 담당자: ${taxContact.name} (${taxContact.email})`}
                </div>
              </div>
              <Link
                href={`/console/charges/${r.id}`}
                className="px-4 py-2 bg-black text-white text-sm"
              >
                검토
              </Link>
            </div>
          )
        })}
      </div>

      <div className="text-xs text-gray-500 border-l-[3px] border-l-gray-300 pl-3 py-2">
        Gate #1: 컨펌 시 wallet_charges INSERT (pending) + 슬랙 #세금계산서 채널 자동 포스팅.
        Gate #2 (카드번호 입력)는 카드 발급 후 별도 콘솔에서 진행.
      </div>
    </div>
  )
}
