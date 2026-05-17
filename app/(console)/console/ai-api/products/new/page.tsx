import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createProduct } from '../../actions'

type VendorToken = {
  id: string
  vendor: string
  vendor_workspace_id: string
  token_label: string | null
  status: string
}

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: { error?: string }
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

  // upstream_admin_token_id 후보 (active 만)
  const { data: tokensRaw } = await supabase
    .from('vendor_admin_tokens')
    .select('id, vendor, vendor_workspace_id, token_label, status')
    .eq('status', 'active')
    .order('vendor')
  const tokens = (tokensRaw ?? []) as VendorToken[]

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Link href="/console/ai-api" className="text-xs text-gray-500 hover:text-gray-700">
          ← AI API 관리
        </Link>
        <h1 className="text-2xl font-semibold mt-2">신규 AI API 상품 등록</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gridge 자체 게이트웨이의 상품을 등록합니다. 등록 후 PR #3 의 키 발급 화면에서 고객에게 발급 가능.
        </p>
      </div>

      {searchParams.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      <form action={createProduct} className="card p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
              상품 코드 <span className="text-red-500">*</span>
            </label>
            <input
              id="code"
              name="code"
              type="text"
              required
              pattern="[a-z0-9\-]{3,50}"
              maxLength={50}
              placeholder="gridge-ai-v1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-xs text-gray-500 mt-1">영문/숫자/하이픈 3~50자. 등록 후 변경 불가.</p>
          </div>

          <div>
            <label htmlFor="tier" className="block text-sm font-medium text-gray-700 mb-1">
              등급 <span className="text-red-500">*</span>
            </label>
            <select
              id="tier"
              name="tier"
              required
              defaultValue="standard"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="standard">Standard</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="display_name" className="block text-sm font-medium text-gray-700 mb-1">
            상품명 (고객 노출) <span className="text-red-500">*</span>
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            required
            maxLength={100}
            minLength={2}
            placeholder="Gridge AI API v1"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            설명 (선택)
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            maxLength={1000}
            placeholder="공식 모델·등급 안내. 고객에게 노출 가능."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="border-t border-gray-200 pt-5">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Upstream 라우팅 (내부, 고객 미노출)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="upstream_vendor" className="block text-sm font-medium text-gray-700 mb-1">
                벤더 <span className="text-red-500">*</span>
              </label>
              <select
                id="upstream_vendor"
                name="upstream_vendor"
                required
                defaultValue="anthropic"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google</option>
                <option value="self">자체 (proxy 없음)</option>
              </select>
            </div>

            <div>
              <label htmlFor="upstream_model" className="block text-sm font-medium text-gray-700 mb-1">
                모델 <span className="text-red-500">*</span>
              </label>
              <input
                id="upstream_model"
                name="upstream_model"
                type="text"
                required
                maxLength={100}
                placeholder="claude-sonnet-4-5"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="upstream_admin_token_id" className="block text-sm font-medium text-gray-700 mb-1">
              Upstream Admin Token (선택)
            </label>
            <select
              id="upstream_admin_token_id"
              name="upstream_admin_token_id"
              defaultValue=""
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">자동 선택 (vendor 의 최신 active 토큰)</option>
              {tokens.map(t => (
                <option key={t.id} value={t.id}>
                  [{t.vendor}] {t.token_label ?? t.vendor_workspace_id} · {t.vendor_workspace_id}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-500">
              상품 vendor 와 일치하는 토큰만 선택하세요. 제출 시 자동 검증되며, vendor 불일치/inactive 토큰은 차단됩니다.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              미선택 시 process.env 의 벤더별 키 사용. 특정 토큰 지정 시 그 토큰으로만 라우팅.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-5">
          <h3 className="text-sm font-medium text-gray-900 mb-3">가격 정책 (M-2057)</h3>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 mb-4 text-xs text-gray-700">
            <strong>디폴트:</strong> 그릿지가 고객에게 제공하는 순수 벤더 API 는
            <span className="text-brand-700 font-medium"> 마진 0% (pass-through) </span>
            가 기본. markup 컬럼 비워두면 디폴트 적용.
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
                defaultValue="0"
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
                defaultValue="0"
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
                defaultValue="0"
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
                defaultValue="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <h4 className="text-xs font-semibold text-gray-700 mb-2">최종 청구가 (KRW per 1k tokens) — 호출 시 적용</h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="input_price_per_1k_krw" className="block text-xs font-medium text-gray-600 mb-1">
                Input KRW <span className="text-red-500">*</span>
              </label>
              <input
                id="input_price_per_1k_krw"
                name="input_price_per_1k_krw"
                type="number"
                step="0.0001"
                min="0"
                required
                placeholder="4.5"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="output_price_per_1k_krw" className="block text-xs font-medium text-gray-600 mb-1">
                Output KRW <span className="text-red-500">*</span>
              </label>
              <input
                id="output_price_per_1k_krw"
                name="output_price_per_1k_krw"
                type="number"
                step="0.0001"
                min="0"
                required
                placeholder="22.5"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="min_charge_krw" className="block text-xs font-medium text-gray-600 mb-1">
                최소 과금 (₩)
              </label>
              <input
                id="min_charge_krw"
                name="min_charge_krw"
                type="number"
                min="0"
                step="1"
                defaultValue="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            현재 manual 모드 — 최종 청구가는 직접 입력. vendor_fetch 모드 자동 계산은 후속 PR.
          </p>
        </div>

        <div className="border-t border-gray-200 pt-5">
          <h3 className="text-sm font-medium text-gray-900 mb-3">제한·정책</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="rate_limit_rpm" className="block text-sm font-medium text-gray-700 mb-1">
                Rate Limit (요청/분) <span className="text-red-500">*</span>
              </label>
              <input
                id="rate_limit_rpm"
                name="rate_limit_rpm"
                type="number"
                min="1"
                max="10000"
                required
                defaultValue="60"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="daily_token_cap" className="block text-sm font-medium text-gray-700 mb-1">
                일일 토큰 상한 (선택)
              </label>
              <input
                id="daily_token_cap"
                name="daily_token_cap"
                type="number"
                min="0"
                placeholder="무제한"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked
              className="w-4 h-4 text-brand-600 rounded"
            />
            <span className="text-sm text-gray-700">즉시 활성화 (체크 해제 시 비활성 상태로 등록)</span>
          </label>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            상품 등록
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
