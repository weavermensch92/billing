import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { VendorTokensPanel } from '../../_shared/vendor-tokens/panel'

export default async function AiApiVendorTokensPage({
  searchParams,
}: {
  searchParams: { org?: string; ok?: string; error?: string; show?: string }
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

  const { data: orgsRaw } = await supabase.from('orgs').select('id, name').order('name')
  const orgs = (orgsRaw ?? []) as Array<{ id: string; name: string }>
  const selectedOrgId = searchParams.org ?? ''
  const selectedOrg = orgs.find(o => o.id === selectedOrgId) ?? null
  const showAll = searchParams.show === 'all'
  const backHref = selectedOrgId
    ? `/console/ai-api/vendor-tokens?org=${selectedOrgId}`
    : `/console/ai-api/vendor-tokens`

  return (
    <div className="space-y-6">
      <div>
        <Link href="/console/ai-api" className="text-xs text-gray-500 hover:text-gray-700">
          ← AI API 관리
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">고객사별 벤더 토큰</h1>
        <p className="text-sm text-gray-500 mt-1">
          고객 조직이 벤더 콘솔에서 발급받은 admin 토큰을 그릿지가 위임 보관.
          <br />
          그릿지 자체 게이트웨이 (gridge_self) upstream 토큰은
          {' '}<Link href="/console/ai-api/gateway-tokens" className="underline">Gridge Gateway Upstream 토큰</Link>{' '}에서 별도 관리.
        </p>
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

      <form method="GET" className="card p-4 flex flex-wrap gap-3 items-end text-xs">
        <div>
          <label className="block text-gray-500 mb-1">고객사</label>
          <select
            name="org"
            defaultValue={selectedOrgId}
            className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white min-w-[240px]"
          >
            <option value="">선택</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        {selectedOrgId && (
          <div>
            <label className="block text-gray-500 mb-1">상태</label>
            <select
              name="show"
              defaultValue={showAll ? 'all' : ''}
              className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white"
            >
              <option value="">활성만</option>
              <option value="all">전체</option>
            </select>
          </div>
        )}
        <button type="submit" className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg">
          적용
        </button>
        {selectedOrgId && (
          <Link
            href={`/console/orgs/${selectedOrgId}/vendor-tokens`}
            className="px-3 py-1.5 text-gray-600 hover:text-gray-900 underline ml-auto"
          >
            조직 상세에서 열기 →
          </Link>
        )}
      </form>

      {!selectedOrg ? (
        <div className="card p-10 text-center text-sm text-gray-400">
          위에서 고객사를 선택하세요.
        </div>
      ) : (
        <VendorTokensPanel
          orgId={selectedOrg.id}
          orgName={selectedOrg.name}
          backHref={backHref}
          showAll={showAll}
        />
      )}
    </div>
  )
}
