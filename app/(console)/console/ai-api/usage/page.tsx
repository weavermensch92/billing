import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/format'

type UsageEvent = {
  id: string
  org_id: string
  product_id: string
  key_id: string
  request_id: string | null
  model_used: string
  input_tokens: number
  output_tokens: number
  latency_ms: number | null
  status_code: number
  error_code: string | null
  cost_krw: number
  upstream_cost_usd: number | null
  created_at: string
  org: { name: string } | null
  product: { code: string; display_name: string } | null
  key: { key_prefix: string; label: string | null } | null
}

type DailyAgg = {
  org_id: string
  product_id: string
  day: string
  request_count: number
  input_tokens_sum: number
  output_tokens_sum: number
  cost_krw_sum: number
  error_count: number
}

function formatKrw(v: number | null | undefined): string {
  if (v == null) return '—'
  return `₩${Math.round(v).toLocaleString('ko-KR')}`
}

export default async function GridgeUsagePage({
  searchParams,
}: {
  searchParams: { org?: string; product?: string; days?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: me } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!me) redirect('/console/login')
  if (me.role !== 'super') {
    redirect('/console/home?error=' + encodeURIComponent('Super 전용'))
  }

  const orgFilter = searchParams.org ?? ''
  const productFilter = searchParams.product ?? ''
  const days = Math.max(1, Math.min(90, Number(searchParams.days ?? 7)))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // 일별 집계
  let dailyQuery = supabase
    .from('v_gridge_usage_daily')
    .select('*')
    .gte('day', since.slice(0, 10))
    .order('day', { ascending: false })
    .limit(200)
  if (orgFilter) dailyQuery = dailyQuery.eq('org_id', orgFilter)
  if (productFilter) dailyQuery = dailyQuery.eq('product_id', productFilter)

  // 최근 이벤트 (Top 50)
  let eventQuery = supabase
    .from('gridge_api_usage_events')
    .select('id, org_id, product_id, key_id, request_id, model_used, input_tokens, output_tokens, latency_ms, status_code, error_code, cost_krw, upstream_cost_usd, created_at, org:orgs!org_id(name), product:gridge_api_products!product_id(code, display_name), key:gridge_api_keys!key_id(key_prefix, label)')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50)
  if (orgFilter) eventQuery = eventQuery.eq('org_id', orgFilter)
  if (productFilter) eventQuery = eventQuery.eq('product_id', productFilter)

  const [dailyRes, eventRes, orgsRes, productsRes] = await Promise.all([
    dailyQuery,
    eventQuery,
    supabase.from('orgs').select('id, name').order('name'),
    supabase.from('gridge_api_products').select('id, code, display_name').order('code'),
  ])

  const daily = (dailyRes.data ?? []) as DailyAgg[]
  const events = (eventRes.data ?? []) as unknown as UsageEvent[]
  const orgs = (orgsRes.data ?? []) as { id: string; name: string }[]
  const products = (productsRes.data ?? []) as { id: string; code: string; display_name: string }[]

  // 합산 통계
  const totalCost = daily.reduce((s, d) => s + (d.cost_krw_sum ?? 0), 0)
  const totalRequests = daily.reduce((s, d) => s + (d.request_count ?? 0), 0)
  const totalInputTokens = daily.reduce((s, d) => s + (d.input_tokens_sum ?? 0), 0)
  const totalOutputTokens = daily.reduce((s, d) => s + (d.output_tokens_sum ?? 0), 0)
  const totalErrors = daily.reduce((s, d) => s + (d.error_count ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/console/ai-api" className="text-xs text-gray-500 hover:text-gray-700">
          ← AI API 관리
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">사용량 대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">
          최근 {days}일 Gridge 게이트웨이 호출 통계. 단가는 호출 시점 스냅샷이 사용됨.
        </p>
      </div>

      <form method="GET" className="card p-4 flex flex-wrap gap-3 items-end text-xs">
        <div>
          <label className="block text-gray-500 mb-1">Org</label>
          <select name="org" defaultValue={orgFilter} className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white min-w-[180px]">
            <option value="">전체</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-gray-500 mb-1">상품</label>
          <select name="product" defaultValue={productFilter} className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white min-w-[180px]">
            <option value="">전체</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-gray-500 mb-1">기간 (일)</label>
          <select name="days" defaultValue={String(days)} className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white">
            <option value="1">1</option>
            <option value="7">7</option>
            <option value="30">30</option>
            <option value="90">90</option>
          </select>
        </div>
        <button type="submit" className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg">적용</button>
        <Link href="/console/ai-api/usage" className="px-3 py-1.5 text-gray-500 hover:text-gray-700">초기화</Link>
      </form>

      {/* StatCards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs text-gray-500">총 비용</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatKrw(totalCost)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">요청 수</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{totalRequests.toLocaleString('ko-KR')}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">입력/출력 토큰</div>
          <div className="text-sm font-bold text-gray-900 mt-1">
            {totalInputTokens.toLocaleString('ko-KR')} / {totalOutputTokens.toLocaleString('ko-KR')}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">에러 수</div>
          <div className={`text-2xl font-bold mt-1 ${totalErrors > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {totalErrors.toLocaleString('ko-KR')}
          </div>
        </div>
      </div>

      {/* 일별 집계 */}
      <div className="card overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
          <div className="text-xs font-medium text-gray-700">일별 집계 ({daily.length} 행)</div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">날짜</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Org</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">상품</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">요청</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">입력/출력 토큰</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">비용</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">에러</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {daily.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                  기간 내 사용 이력이 없습니다.
                </td>
              </tr>
            )}
            {daily.map((d, i) => {
              const org = orgs.find(o => o.id === d.org_id)
              const prod = products.find(p => p.id === d.product_id)
              return (
                <tr key={`${d.day}-${d.org_id}-${d.product_id}-${i}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{d.day}</td>
                  <td className="px-4 py-2 text-xs">{org?.name ?? d.org_id.slice(0, 8)}</td>
                  <td className="px-4 py-2 text-xs font-mono">{prod?.code ?? d.product_id.slice(0, 8)}</td>
                  <td className="px-4 py-2 text-right text-xs">{d.request_count.toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-2 text-right text-xs font-mono text-gray-600">
                    {d.input_tokens_sum.toLocaleString('ko-KR')} / {d.output_tokens_sum.toLocaleString('ko-KR')}
                  </td>
                  <td className="px-4 py-2 text-right text-xs font-mono">{formatKrw(d.cost_krw_sum)}</td>
                  <td className={`px-4 py-2 text-right text-xs ${d.error_count > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {d.error_count}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 최근 이벤트 */}
      <div className="card overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="text-xs font-medium text-gray-700">최근 호출 (최대 50건)</div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">시각</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Org</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">키</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">모델</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">토큰 (I/O)</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Latency</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">비용</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {events.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                  최근 호출 이벤트가 없습니다.
                </td>
              </tr>
            )}
            {events.map(e => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-xs font-mono">{formatDate(e.created_at)}</td>
                <td className="px-4 py-2 text-xs">{e.org?.name ?? e.org_id.slice(0, 8)}</td>
                <td className="px-4 py-2 text-xs">
                  <div className="font-mono">{e.key?.key_prefix ?? '?'}…</div>
                  {e.key?.label && <div className="text-gray-400">{e.key.label}</div>}
                </td>
                <td className="px-4 py-2 text-xs font-mono text-gray-600">{e.model_used}</td>
                <td className="px-4 py-2 text-right text-xs font-mono text-gray-600">
                  {e.input_tokens}/{e.output_tokens}
                </td>
                <td className="px-4 py-2 text-right text-xs text-gray-500">{e.latency_ms ? `${e.latency_ms}ms` : '—'}</td>
                <td className="px-4 py-2 text-right text-xs font-mono">{formatKrw(e.cost_krw)}</td>
                <td className="px-4 py-2 text-xs">
                  {e.status_code >= 400 ? (
                    <span className="text-red-600">{e.status_code} {e.error_code && `· ${e.error_code}`}</span>
                  ) : (
                    <span className="text-green-700">{e.status_code}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
