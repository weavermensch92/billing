import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { updateProduct, toggleProductActive } from '../../actions'
import { formatDate } from '@/lib/utils/format'

type Product = {
  id: string
  code: string
  tier: 'standard' | 'pro' | 'enterprise'
  display_name: string
  description: string | null
  upstream_vendor: string
  upstream_model: string
  upstream_admin_token_id: string | null
  input_price_per_1k_krw: number
  output_price_per_1k_krw: number
  upstream_input_price_per_1k_usd: number
  upstream_output_price_per_1k_usd: number
  fx_rate_krw_per_usd: number | null
  markup_pct: number
  markup_fixed_krw: number
  pricing_source: 'manual' | 'vendor_fetch'
  pricing_updated_at: string
  min_charge_krw: number
  rate_limit_rpm: number
  daily_token_cap: number | null
  is_active: boolean
  released_at: string | null
  deprecated_at: string | null
  created_at: string
  updated_at: string
}

type VendorToken = {
  id: string
  vendor: string
  vendor_workspace_id: string
  token_label: string | null
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { ok?: string; error?: string }
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
    redirect('/console/ai-api?error=' + encodeURIComponent('Super 전용'))
  }

  const { data: productRaw } = await supabase
    .from('gridge_api_products')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()
  const product = productRaw as Product | null
  if (!product) {
    redirect('/console/ai-api?error=' + encodeURIComponent('상품을 찾을 수 없습니다.'))
  }

  const { data: tokensRaw } = await supabase
    .from('vendor_admin_tokens')
    .select('id, vendor, vendor_workspace_id, token_label')
    .eq('status', 'active')
    .order('vendor')
  const tokens = (tokensRaw ?? []) as VendorToken[]

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <Link href="/console/ai-api" className="text-xs text-gray-500 hover:text-gray-700">
          ← AI API 관리
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-2xl font-semibold">{product.display_name}</h1>
            <p className="text-sm text-gray-500 mt-1 font-mono">
              {product.code} · {product.tier} · {product.upstream_vendor}/{product.upstream_model}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {product.is_active ? (
              <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded">활성</span>
            ) : (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">비활성</span>
            )}
            <form action={toggleProductActive} className="inline">
              <input type="hidden" name="product_id" value={product.id} />
              <input type="hidden" name="next_active" value={String(!product.is_active)} />
              <button
                type="submit"
                className={`text-xs px-2 py-1 rounded border ${product.is_active ? 'border-red-300 text-red-600 hover:bg-red-50' : 'border-brand-300 text-brand-600 hover:bg-brand-50'}`}
              >
                {product.is_active ? '비활성화' : '활성화'}
              </button>
            </form>
          </div>
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

      <div className="card p-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-gray-500">등록일</div>
          <div className="text-gray-900 mt-0.5">{formatDate(product.created_at)}</div>
        </div>
        <div>
          <div className="text-gray-500">최종 수정</div>
          <div className="text-gray-900 mt-0.5">{formatDate(product.updated_at)}</div>
        </div>
        <div>
          <div className="text-gray-500">활성화 일시</div>
          <div className="text-gray-900 mt-0.5">{product.released_at ? formatDate(product.released_at) : '—'}</div>
        </div>
        <div>
          <div className="text-gray-500">비활성화 일시</div>
          <div className="text-gray-900 mt-0.5">{product.deprecated_at ? formatDate(product.deprecated_at) : '—'}</div>
        </div>
      </div>

      <form action={updateProduct} className="card p-6 space-y-5">
        <input type="hidden" name="product_id" value={product.id} />

        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-1">변경 불가 필드</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">코드</div>
              <div className="font-mono mt-0.5">{product.code}</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">등급</div>
              <div className="mt-0.5">{product.tier}</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">Upstream 벤더</div>
              <div className="mt-0.5">{product.upstream_vendor}</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500">Upstream 모델</div>
              <div className="font-mono mt-0.5">{product.upstream_model}</div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            코드·등급·upstream 변경은 회계 정합성상 금지. 변경 필요 시 신규 코드로 등록 + 구 코드 비활성화.
          </p>
        </div>

        <div className="border-t border-gray-200 pt-5">
          <div>
            <label htmlFor="display_name" className="block text-sm font-medium text-gray-700 mb-1">
              상품명 (고객 노출)
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              required
              maxLength={100}
              minLength={2}
              defaultValue={product.display_name}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="mt-3">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              설명
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              maxLength={1000}
              defaultValue={product.description ?? ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="border-t border-gray-200 pt-5">
          <label htmlFor="upstream_admin_token_id" className="block text-sm font-medium text-gray-700 mb-1">
            Upstream Admin Token
          </label>
          <select
            id="upstream_admin_token_id"
            name="upstream_admin_token_id"
            defaultValue={product.upstream_admin_token_id ?? ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">환경 변수 사용 (기본)</option>
            {tokens.map(t => (
              <option key={t.id} value={t.id}>
                [{t.vendor}] {t.token_label ?? t.vendor_workspace_id}
              </option>
            ))}
          </select>
        </div>

        <div className="border-t border-gray-200 pt-5">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">가격 정책 (M-2057)</h3>
            <span className="text-xs text-gray-500">
              가격 출처: <span className="font-mono">{product.pricing_source}</span> · 갱신 {formatDate(product.pricing_updated_at)}
            </span>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 mb-4 text-xs text-gray-700 space-y-1">
            <p>
              <strong>디폴트 정책:</strong> 그릿지가 고객에게 제공하는 순수 벤더 API (Claude / OpenAI / ...) 는
              <span className="text-brand-700 font-medium"> 마진 0% (pass-through) </span>
              가 디폴트. 운영 정책상 필요한 경우 아래 markup 으로 조정.
            </p>
            <p className="text-gray-500">
              <strong>vendor_fetch 모드</strong> (후속 PR): upstream USD × 환율 × (1 + markup%) 자동 계산.
              현재는 <strong>manual</strong> 모드 — 운영자가 input/output_price_per_1k_krw 를 직접 입력.
            </p>
          </div>

          <h4 className="text-xs font-semibold text-gray-700 mb-2">벤더 공식 단가 (USD per 1k tokens) — 외부 가격 기준</h4>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label htmlFor="upstream_input_price_per_1k_usd" className="block text-xs font-medium text-gray-600 mb-1">
                Upstream Input (USD)
              </label>
              <input
                id="upstream_input_price_per_1k_usd"
                name="upstream_input_price_per_1k_usd"
                type="number"
                step="0.000001"
                min="0"
                defaultValue={product.upstream_input_price_per_1k_usd}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="upstream_output_price_per_1k_usd" className="block text-xs font-medium text-gray-600 mb-1">
                Upstream Output (USD)
              </label>
              <input
                id="upstream_output_price_per_1k_usd"
                name="upstream_output_price_per_1k_usd"
                type="number"
                step="0.000001"
                min="0"
                defaultValue={product.upstream_output_price_per_1k_usd}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="fx_rate_krw_per_usd" className="block text-xs font-medium text-gray-600 mb-1">
                FX 환율 (KRW/USD)
              </label>
              <input
                id="fx_rate_krw_per_usd"
                name="fx_rate_krw_per_usd"
                type="number"
                step="0.01"
                min="0"
                placeholder="비워두면 NULL"
                defaultValue={product.fx_rate_krw_per_usd ?? ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <h4 className="text-xs font-semibold text-gray-700 mb-2">마진 (디폴트 0)</h4>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="markup_pct" className="block text-xs font-medium text-gray-600 mb-1">
                마진율 (%)
              </label>
              <input
                id="markup_pct"
                name="markup_pct"
                type="number"
                step="0.01"
                min="0"
                max="1000"
                defaultValue={product.markup_pct}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="markup_fixed_krw" className="block text-xs font-medium text-gray-600 mb-1">
                고정 마진 (KRW / 호출)
              </label>
              <input
                id="markup_fixed_krw"
                name="markup_fixed_krw"
                type="number"
                step="1"
                min="0"
                defaultValue={product.markup_fixed_krw}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <h4 className="text-xs font-semibold text-gray-700 mb-2">최종 청구가 (KRW per 1k tokens) — 호출 시 적용</h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="input_price_per_1k_krw" className="block text-xs font-medium text-gray-600 mb-1">
                Input KRW
              </label>
              <input
                id="input_price_per_1k_krw"
                name="input_price_per_1k_krw"
                type="number"
                step="0.0001"
                min="0"
                required
                defaultValue={product.input_price_per_1k_krw}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="output_price_per_1k_krw" className="block text-xs font-medium text-gray-600 mb-1">
                Output KRW
              </label>
              <input
                id="output_price_per_1k_krw"
                name="output_price_per_1k_krw"
                type="number"
                step="0.0001"
                min="0"
                required
                defaultValue={product.output_price_per_1k_krw}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="min_charge_krw" className="block text-xs font-medium text-gray-600 mb-1">
                최소 과금 (KRW)
              </label>
              <input
                id="min_charge_krw"
                name="min_charge_krw"
                type="number"
                min="0"
                step="1"
                defaultValue={product.min_charge_krw}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <p className="text-xs text-amber-600 mt-2">
            ⚠ 단가 변경은 이후 호출에만 적용. 과거 사용 이벤트는 발급 시점의 스냅샷 단가로 청구됩니다.
            <br />
            현재 manual 모드 — 최종 청구가는 직접 입력. vendor_fetch 자동 계산은 후속 PR.
          </p>
        </div>

        <div className="border-t border-gray-200 pt-5">
          <h3 className="text-sm font-medium text-gray-900 mb-3">제한·정책</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="rate_limit_rpm" className="block text-sm font-medium text-gray-700 mb-1">
                Rate Limit (rpm)
              </label>
              <input
                id="rate_limit_rpm"
                name="rate_limit_rpm"
                type="number"
                min="1"
                max="10000"
                required
                defaultValue={product.rate_limit_rpm}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="daily_token_cap" className="block text-sm font-medium text-gray-700 mb-1">
                일일 토큰 상한
              </label>
              <input
                id="daily_token_cap"
                name="daily_token_cap"
                type="number"
                min="0"
                placeholder="무제한"
                defaultValue={product.daily_token_cap ?? ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            저장
          </button>
          <Link
            href="/console/ai-api"
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}
