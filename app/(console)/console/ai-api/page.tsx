import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/format'

type Product = {
  id: string
  code: string
  tier: 'standard' | 'pro' | 'enterprise'
  display_name: string
  upstream_vendor: string
  upstream_model: string
  input_price_per_1k_krw: number
  output_price_per_1k_krw: number
  rate_limit_rpm: number
  daily_token_cap: number | null
  is_active: boolean
  released_at: string | null
  deprecated_at: string | null
  created_at: string
}

function tierBadge(tier: Product['tier']) {
  const map: Record<Product['tier'], { label: string; cls: string }> = {
    standard: { label: 'Standard', cls: 'bg-gray-100 text-gray-700' },
    pro: { label: 'Pro', cls: 'bg-brand-100 text-brand-700' },
    enterprise: { label: 'Enterprise', cls: 'bg-purple-100 text-purple-700' },
  }
  const { label, cls } = map[tier]
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${cls}`}>{label}</span>
}

export default async function ConsoleAiApiPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; show?: string }
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
    redirect('/console/home?error=' + encodeURIComponent('AI API 관리는 Super 전용'))
  }

  const showAll = searchParams.show === 'all'

  let query = supabase
    .from('gridge_api_products')
    .select('id, code, tier, display_name, upstream_vendor, upstream_model, input_price_per_1k_krw, output_price_per_1k_krw, rate_limit_rpm, daily_token_cap, is_active, released_at, deprecated_at, created_at')
    .order('tier')
    .order('code')
  if (!showAll) query = query.eq('is_active', true)

  const { data: productsRaw } = await query
  const products = (productsRaw ?? []) as Product[]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI API 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gridge 자체 게이트웨이 (api.gridge.ai) 의 API 상품 카탈로그. 등급·단가·upstream 매핑·rate limit 관리.
            <br />
            고객별 키 발급·회전·폐기는 <Link href="/console/ai-api/keys" className="text-brand-600 hover:underline">🔑 키 관리</Link>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/console/ai-api/keys"
            className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg"
          >
            🔑 키 관리
          </Link>
          <Link
            href="/console/ai-api/products/new"
            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg"
          >
            + 신규 상품
          </Link>
        </div>
      </div>

      {searchParams.ok && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          {searchParams.ok}
        </div>
      )}
      {searchParams.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      <div className="flex gap-3 items-center text-xs">
        <Link
          href="/console/ai-api"
          className={`px-2 py-1 rounded ${!showAll ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          활성만
        </Link>
        <Link
          href="/console/ai-api?show=all"
          className={`px-2 py-1 rounded ${showAll ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          전체 ({products.length})
        </Link>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">코드</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">상품명</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">등급</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Upstream</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">단가 (input / output / 1k tokens)</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Rate (rpm)</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">상태</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                  등록된 상품이 없습니다. {!showAll && '비활성 상품도 보려면 "전체" 클릭.'}
                </td>
              </tr>
            )}
            {products.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs">{p.code}</td>
                <td className="px-4 py-2 font-medium">{p.display_name}</td>
                <td className="px-4 py-2">{tierBadge(p.tier)}</td>
                <td className="px-4 py-2 text-xs text-gray-600">
                  <span className="text-gray-400">{p.upstream_vendor}</span> · {p.upstream_model}
                </td>
                <td className="px-4 py-2 text-right text-xs font-mono">
                  ₩{p.input_price_per_1k_krw} / ₩{p.output_price_per_1k_krw}
                </td>
                <td className="px-4 py-2 text-right text-xs">{p.rate_limit_rpm}</td>
                <td className="px-4 py-2">
                  {p.is_active ? (
                    <span className="text-xs font-medium text-green-700">활성</span>
                  ) : (
                    <span className="text-xs text-gray-400">
                      비활성 {p.deprecated_at && `(${formatDate(p.deprecated_at)})`}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/console/ai-api/products/${p.id}`}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    상세
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-400 text-right">
        총 {products.length} 개 상품
      </div>
    </div>
  )
}
