import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'

/**
 * v2.0 재작성 — 월별 청구서 상세
 * 표시:
 *   - 고객 청구액 (subtotal + VAT)
 *   - 벤더 청구서 매칭 결과
 *   - 팀별 사용량 분배 (v_team_usage_breakdown)
 *   - 마진 정보는 슈퍼어드민 보기만 (고객에 미노출)
 */
export default async function CustomerInvoiceDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, org_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!member) redirect('/login')

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', member.org_id)
    .maybeSingle()
  if (!invoice) notFound()

  const inv = invoice as Record<string, unknown>
  const meta = (inv.meta ?? {}) as {
    vendor_invoice_id?: string
    vendor?: string
    vendor_total_krw?: number
    margin_rate?: number
    margin_amount_krw?: number
  }

  const [vendorInvoiceRes, teamBreakdownRes] = await Promise.all([
    meta.vendor_invoice_id
      ? supabase.from('vendor_invoices').select('*').eq('id', meta.vendor_invoice_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('v_team_usage_breakdown')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('month', String(inv.period_start).slice(0, 7) + '-01')
      .order('total_charged_krw', { ascending: false }),
  ])

  const vendorInvoice = (vendorInvoiceRes as { data: Record<string, unknown> | null }).data
  const teamBreakdown = teamBreakdownRes.data ?? []

  const subtotal = Number(inv.subtotal_krw ?? 0)
  const vat = Number(inv.vat_krw ?? 0)
  const total = Number(inv.total_due_krw ?? 0)

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div>
        <div className="text-xs text-gray-500 mb-1">청구서</div>
        <h1 className="text-2xl font-semibold">
          {String(inv.period_start).slice(0, 7)} ~ {String(inv.period_end).slice(8, 10)}
        </h1>
      </div>

      <div className="border border-gray-200 p-6">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Cell label="소계 (KRW)" value={subtotal} />
          <Cell label="VAT 10%" value={vat} />
          <Cell label="총 청구액" value={total} bold />
        </div>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">팀별 분배</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500 border-b">
            <tr>
              <th className="py-2">팀</th>
              <th className="py-2 text-right">멤버 수</th>
              <th className="py-2 text-right">라인 수</th>
              <th className="py-2 text-right">청구액</th>
            </tr>
          </thead>
          <tbody>
            {teamBreakdown.length === 0 && (
              <tr><td colSpan={4} className="py-8 text-center text-gray-400">분배 데이터 없음</td></tr>
            )}
            {teamBreakdown.map((t: Record<string, unknown>) => (
              <tr key={String(t.team_id)} className="border-b border-gray-100">
                <td className="py-2">
                  {String(t.team_name ?? '')}
                  {t.is_unassigned ? <span className="ml-2 text-xs text-gray-400">(미할당)</span> : null}
                </td>
                <td className="py-2 text-right font-mono">{String(t.member_count ?? 0)}</td>
                <td className="py-2 text-right font-mono">{String(t.line_count ?? 0)}</td>
                <td className="py-2 text-right font-mono">₩{Number(t.total_charged_krw ?? 0).toLocaleString('ko-KR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {vendorInvoice && (
        <section>
          <h2 className="text-lg font-medium mb-3">벤더 청구서 매칭</h2>
          <div className="border border-gray-200 p-4 text-sm space-y-2">
            <Row label="벤더" value={String(vendorInvoice.vendor ?? '')} />
            <Row label="청구액 (USD)" value={`$${Number(vendorInvoice.total_usd ?? 0).toFixed(2)}`} mono />
            <Row label="환율" value={`₩${Number(vendorInvoice.exchange_rate ?? 0).toFixed(2)}`} mono />
            <Row label="매칭 상태" value={String(vendorInvoice.match_status ?? '')} />
          </div>
        </section>
      )}

      <div className="text-xs text-gray-500 border-l-[3px] border-l-gray-300 pl-3 py-2">
        문의는 담당 AM 또는 슈퍼어드민에게 연락 (settings 페이지에서 확인).
      </div>
    </div>
  )
}

function Cell({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`font-mono mt-1 ${bold ? 'text-2xl font-semibold' : 'text-lg'}`}>
        ₩{value.toLocaleString('ko-KR')}
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={mono ? 'font-mono' : ''}>{value}</span>
    </div>
  )
}
