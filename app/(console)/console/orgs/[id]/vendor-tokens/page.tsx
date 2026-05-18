import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { VendorTokensPanel } from '../../../_shared/vendor-tokens/panel'

export default async function OrgVendorTokensPage({
  params,
  searchParams,
}: {
  params: { id: string }
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
    redirect(`/console/orgs/${params.id}?error=` + encodeURIComponent('Super 전용'))
  }

  const { data: org } = await supabase
    .from('orgs')
    .select('id, name')
    .eq('id', params.id)
    .maybeSingle()
  if (!org) {
    redirect('/console/orgs?error=' + encodeURIComponent('조직을 찾을 수 없습니다.'))
  }

  const backHref = `/console/orgs/${params.id}/vendor-tokens`
  const showAll = searchParams.show === 'all'

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/console/orgs/${params.id}`} className="text-xs text-gray-500 hover:text-gray-700">
          ← {org.name}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">벤더 토큰 — {org.name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          이 조직의 벤더 (Anthropic / OpenAI / ...) admin 토큰. 그릿지가 위임 보관하며, 키 발급·폐기·청구서 조회 시 자동 사용.
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

      <div className="flex gap-3 items-center text-xs">
        <Link
          href={backHref}
          className={`px-2 py-1 rounded ${!showAll ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          활성만
        </Link>
        <Link
          href={`${backHref}?show=all`}
          className={`px-2 py-1 rounded ${showAll ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          전체
        </Link>
      </div>

      <VendorTokensPanel
        orgId={org.id}
        orgName={org.name}
        backHref={backHref}
        showAll={showAll}
      />
    </div>
  )
}
