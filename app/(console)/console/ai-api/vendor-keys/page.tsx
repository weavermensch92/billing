import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/format'
import { revokeVendorKey } from './actions'
import { listVendors, vendorLabel } from '@/lib/vendor-api/catalog'

type ApiKey = {
  id: string
  org_id: string
  account_id: string
  provider: string
  provider_key_id: string
  key_prefix: string | null
  label: string | null
  status: 'active' | 'rotating' | 'revoked'
  issued_at: string
  revoked_at: string | null
  last_used_at: string | null
  org: { name: string } | null
  account: {
    member: { name: string; email: string } | null
    service: { name: string; vendor: string } | null
  } | null
}

function statusBadge(status: ApiKey['status']) {
  if (status === 'active') return <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">활성</span>
  if (status === 'rotating') return <span className="text-xs font-medium text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded">회전 중</span>
  return <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">폐기됨</span>
}

export default async function VendorKeysPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; show?: string; org?: string; vendor?: string; reveal_id?: string; reveal_key?: string }
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
  const vendorFilter = searchParams.vendor ?? ''

  let query = supabase
    .from('api_keys')
    .select('id, org_id, account_id, provider, provider_key_id, key_prefix, label, status, issued_at, revoked_at, last_used_at, org:orgs!org_id(name), account:accounts!account_id(member:members!member_id(name, email), service:services!service_id(name, vendor))')
    .order('issued_at', { ascending: false })
    .limit(500)

  if (!showAll) query = query.neq('status', 'revoked')
  if (orgFilter) query = query.eq('org_id', orgFilter)
  if (vendorFilter) query = query.eq('provider', vendorFilter)

  const [keysRes, orgsRes] = await Promise.all([
    query,
    supabase.from('orgs').select('id, name').order('name'),
  ])

  const keys = (keysRes.data ?? []) as unknown as ApiKey[]
  const orgs = (orgsRes.data ?? []) as { id: string; name: string }[]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/console/ai-api" className="text-xs text-gray-500 hover:text-gray-700">
            ← AI API 관리
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">벤더 키 대행 발급</h1>
          <p className="text-sm text-gray-500 mt-1">
            외부 벤더 (Anthropic / OpenAI / Cursor / ...) 키를 그릿지가 대신 발급해 고객에게 전달.
            <br />
            고객의 quota·계정 제약을 그대로 따르며, 평문은 발급 직후 1회만 노출.
          </p>
        </div>
        <Link
          href="/console/ai-api/vendor-keys/new"
          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg"
        >
          + 대행 발급
        </Link>
      </div>

      {/* 평문 1회 노출 */}
      {searchParams.reveal_id && searchParams.reveal_key && (
        <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg space-y-2">
          <div className="text-sm font-bold text-yellow-900">
            ⚠ {searchParams.vendor ? vendorLabel(searchParams.vendor) : ''} 키 발급 완료
            — 이 화면을 벗어나면 다시 볼 수 없습니다
          </div>
          <div className="text-xs text-yellow-900">
            <strong>고객 Owner/Admin 에게 안전한 채널로 전달 후 즉시 이 페이지를 닫으세요.</strong>
            그릿지 DB 에는 SHA-256 해시만 저장됨.
          </div>
          <code className="block bg-white border border-yellow-300 rounded px-3 py-2 font-mono text-sm break-all select-all">
            {searchParams.reveal_key}
          </code>
          <Link
            href="/console/ai-api/vendor-keys"
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
          <label className="block text-gray-500 mb-1">벤더</label>
          <select name="vendor" defaultValue={vendorFilter} className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white">
            <option value="">전체</option>
            {listVendors().map(v => (
              <option key={v.name} value={v.name}>
                {v.label}{v.status === 'unsupported' ? ' (준비중)' : ''}
              </option>
            ))}
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
        <Link href="/console/ai-api/vendor-keys" className="px-3 py-1.5 text-gray-500 hover:text-gray-700">
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
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">벤더 · 서비스</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">멤버</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Prefix / Provider ID</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">라벨</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">상태</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">발급일</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {keys.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                  조건에 맞는 벤더 키가 없습니다.
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
                  <div className="font-medium">{vendorLabel(k.provider)}</div>
                  <div className="text-gray-500">{k.account?.service?.name ?? '?'}</div>
                </td>
                <td className="px-4 py-2 text-xs">
                  <div>{k.account?.member?.name ?? '—'}</div>
                  <div className="font-mono text-gray-400">{k.account?.member?.email ?? ''}</div>
                </td>
                <td className="px-4 py-2 font-mono text-xs">
                  {k.key_prefix ? <div>{k.key_prefix}…</div> : null}
                  <div className="text-gray-400">{k.provider_key_id.slice(0, 24)}{k.provider_key_id.length > 24 && '…'}</div>
                </td>
                <td className="px-4 py-2 text-xs text-gray-600">{k.label ?? '—'}</td>
                <td className="px-4 py-2">{statusBadge(k.status)}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{formatDate(k.issued_at)}</td>
                <td className="px-4 py-2 text-right">
                  {k.status !== 'revoked' ? (
                    <form action={revokeVendorKey} className="inline">
                      <input type="hidden" name="key_id" value={k.id} />
                      <button
                        type="submit"
                        className="text-xs text-red-600 hover:underline"
                        title="DB 폐기 (벤더 측 실제 키 무효화는 PR #5 에서 자동화 예정)"
                      >
                        폐기
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
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
