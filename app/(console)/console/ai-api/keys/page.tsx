import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/format'
import { rotateGridgeKey, revokeGridgeKey } from './actions'

type Key = {
  id: string
  org_id: string
  product_id: string
  key_prefix: string
  status: 'active' | 'rotating' | 'revoked'
  label: string | null
  monthly_spend_cap_krw: number | null
  last_used_at: string | null
  use_count: number
  rotated_from_key_id: string | null
  auto_revoke_at: string | null
  revoked_at: string | null
  issued_at: string
  org: { name: string } | null
  product: { code: string; display_name: string; tier: string } | null
}

function statusBadge(status: Key['status']) {
  if (status === 'active') return <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">활성</span>
  if (status === 'rotating') return <span className="text-xs font-medium text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded">회전 중</span>
  return <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">폐기됨</span>
}

export default async function GridgeKeysPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; show?: string; org?: string; product?: string; reveal_id?: string; reveal_key?: string; rotated?: string }
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

  const showAll = searchParams.show === 'all'
  const orgFilter = searchParams.org ?? ''
  const productFilter = searchParams.product ?? ''

  let query = supabase
    .from('gridge_api_keys')
    .select('id, org_id, product_id, key_prefix, status, label, monthly_spend_cap_krw, last_used_at, use_count, rotated_from_key_id, auto_revoke_at, revoked_at, issued_at, org:orgs!org_id(name), product:gridge_api_products!product_id(code, display_name, tier)')
    .order('issued_at', { ascending: false })
    .limit(500)

  if (!showAll) query = query.neq('status', 'revoked')
  if (orgFilter) query = query.eq('org_id', orgFilter)
  if (productFilter) query = query.eq('product_id', productFilter)

  const [keysRes, orgsRes, productsRes] = await Promise.all([
    query,
    supabase.from('orgs').select('id, name').order('name'),
    supabase.from('gridge_api_products').select('id, code, display_name').order('code'),
  ])

  const keys = (keysRes.data ?? []) as unknown as Key[]
  const orgs = (orgsRes.data ?? []) as { id: string; name: string }[]
  const products = (productsRes.data ?? []) as { id: string; code: string; display_name: string }[]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/console/ai-api" className="text-xs text-gray-500 hover:text-gray-700">
            ← AI API 관리
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">Gridge API 키 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            Org × 상품 단위로 발급된 게이트웨이 키. 평문은 발급 직후 1회만 노출. 회전 시 24h 동안 신/구 키 양쪽 인증 허용.
          </p>
        </div>
        <Link
          href="/console/ai-api/keys/new"
          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg"
        >
          + 신규 키 발급
        </Link>
      </div>

      {/* 평문 1회 노출 (발급 / 회전 직후) */}
      {searchParams.reveal_id && searchParams.reveal_key && (
        <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg space-y-2">
          <div className="text-sm font-bold text-yellow-900">
            ⚠ {searchParams.rotated ? '키 회전 완료 — 신규 키' : '키 발급 완료'} (이 화면을 벗어나면 다시 볼 수 없습니다)
          </div>
          <div className="text-xs text-yellow-900">
            <strong>고객에게 안전한 채널로 전달 후 즉시 이 페이지를 닫으세요.</strong>
          </div>
          <code className="block bg-white border border-yellow-300 rounded px-3 py-2 font-mono text-sm break-all select-all">
            {searchParams.reveal_key}
          </code>
          <Link
            href="/console/ai-api/keys"
            className="inline-block text-xs text-yellow-700 hover:underline"
          >
            확인했습니다. 목록으로 →
          </Link>
        </div>
      )}

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
          <select name="product" defaultValue={productFilter} className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white min-w-[200px]">
            <option value="">전체</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.display_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-gray-500 mb-1">상태</label>
          <select name="show" defaultValue={showAll ? 'all' : ''} className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white">
            <option value="">활성·회전 중</option>
            <option value="all">전체 (폐기 포함)</option>
          </select>
        </div>
        <button type="submit" className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg">
          적용
        </button>
        <Link href="/console/ai-api/keys" className="px-3 py-1.5 text-gray-500 hover:text-gray-700">
          초기화
        </Link>
      </form>

      <div className="card overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100 text-xs text-gray-500">
          {keys.length} 건 {keys.length === 500 && '(상한 도달 — 필터로 좁히세요)'}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Org</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">상품</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Prefix</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">라벨</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">월 한도</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">상태</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">발급일</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {keys.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                  조건에 맞는 키가 없습니다.
                </td>
              </tr>
            )}
            {keys.map(k => (
              <tr key={k.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/console/orgs/${k.org_id}`} className="hover:underline">
                    {k.org?.name ?? k.org_id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-2 text-xs">
                  <div>{k.product?.display_name ?? '?'}</div>
                  <div className="font-mono text-gray-400">{k.product?.code}</div>
                </td>
                <td className="px-4 py-2 font-mono text-xs">{k.key_prefix}…</td>
                <td className="px-4 py-2 text-xs text-gray-600">{k.label ?? '—'}</td>
                <td className="px-4 py-2 text-right text-xs font-mono">
                  {k.monthly_spend_cap_krw == null ? '—' : `₩${k.monthly_spend_cap_krw.toLocaleString('ko-KR')}`}
                </td>
                <td className="px-4 py-2">
                  {statusBadge(k.status)}
                  {k.status === 'rotating' && k.auto_revoke_at && (
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      자동 폐기: {formatDate(k.auto_revoke_at)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">{formatDate(k.issued_at)}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {k.status === 'active' && (
                      <form action={rotateGridgeKey} className="inline">
                        <input type="hidden" name="key_id" value={k.id} />
                        <button
                          type="submit"
                          className="text-xs text-brand-600 hover:underline"
                          title="신규 키 발급 + 구 키 24h 유예 후 자동 폐기"
                        >
                          회전
                        </button>
                      </form>
                    )}
                    {k.status !== 'revoked' && (
                      <form action={revokeGridgeKey} className="inline">
                        <input type="hidden" name="key_id" value={k.id} />
                        <button
                          type="submit"
                          className="text-xs text-red-600 hover:underline"
                          title="즉시 폐기"
                        >
                          폐기
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
