import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { issueGridgeKey } from '../actions'

export default async function NewGridgeKeyPage({
  searchParams,
}: {
  searchParams: { error?: string; org_id?: string; product_id?: string }
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
    redirect('/console/ai-api/keys?error=' + encodeURIComponent('Super 전용'))
  }

  const [orgsRes, productsRes] = await Promise.all([
    supabase.from('orgs').select('id, name, status').neq('status', 'terminated').order('name'),
    supabase.from('gridge_api_products').select('id, code, display_name, tier').eq('is_active', true).order('tier').order('code'),
  ])
  const orgs = (orgsRes.data ?? []) as { id: string; name: string; status: string }[]
  const products = (productsRes.data ?? []) as { id: string; code: string; display_name: string; tier: string }[]

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Link href="/console/ai-api/keys" className="text-xs text-gray-500 hover:text-gray-700">
          ← Gridge API 키
        </Link>
        <h1 className="text-2xl font-semibold mt-2">신규 키 발급</h1>
        <p className="text-sm text-gray-500 mt-1">
          Org × 활성 상품 단위 키 발급. 발급 직후 평문이 1회만 노출되니 즉시 고객에게 안전한 채널로 전달하세요.
        </p>
      </div>

      {searchParams.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      {products.length === 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          활성 상품이 없습니다. <Link href="/console/ai-api/products/new" className="underline">상품을 먼저 등록</Link>해 주세요.
        </div>
      )}

      <form action={issueGridgeKey} className="card p-6 space-y-5">
        <div>
          <label htmlFor="org_id" className="block text-sm font-medium text-gray-700 mb-1">
            대상 Org <span className="text-red-500">*</span>
          </label>
          <select
            id="org_id"
            name="org_id"
            required
            defaultValue={searchParams.org_id ?? ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="" disabled>Org 선택</option>
            {orgs.map(o => (
              <option key={o.id} value={o.id}>
                {o.name} {o.status !== 'active' && `[${o.status}]`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="product_id" className="block text-sm font-medium text-gray-700 mb-1">
            상품 <span className="text-red-500">*</span>
          </label>
          <select
            id="product_id"
            name="product_id"
            required
            defaultValue={searchParams.product_id ?? ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="" disabled>상품 선택</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                [{p.tier}] {p.display_name} ({p.code})
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">활성 상품만 표시.</p>
        </div>

        <div>
          <label htmlFor="label" className="block text-sm font-medium text-gray-700 mb-1">
            라벨 (선택)
          </label>
          <input
            id="label"
            name="label"
            type="text"
            maxLength={100}
            placeholder="예: 프로덕션 / 테스트 / 김부장 팀"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-xs text-gray-500 mt-1">키 식별용 메모. 고객·운영 모두 노출.</p>
        </div>

        <div>
          <label htmlFor="monthly_spend_cap_krw" className="block text-sm font-medium text-gray-700 mb-1">
            월 사용 한도 (₩, 선택)
          </label>
          <input
            id="monthly_spend_cap_krw"
            name="monthly_spend_cap_krw"
            type="number"
            min="0"
            step="1000"
            placeholder="비워두면 Org 잔액·rate limit 만 적용"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            이 키의 월 누적 사용금액 상한. 도달 시 라우터가 차단 (PR #5 에서 동작).
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
          <div className="font-medium">⚠ 발급 후 주의</div>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>평문 키는 발급 직후 화면에 1회만 노출됩니다. 새로고침 시 다시 볼 수 없음.</li>
            <li>분실 시 회전(rotate) 또는 폐기 후 재발급하세요.</li>
            <li>키는 SHA-256 해시로만 DB 저장됩니다 (역산 불가).</li>
          </ul>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={products.length === 0}
            className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            키 발급
          </button>
          <Link
            href="/console/ai-api/keys"
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}
