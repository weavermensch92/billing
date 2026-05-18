import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { issueVendorKeyOnBehalf } from '../actions'
import { listVendors } from '@/lib/vendor-api/catalog'

type AccountWithRefs = {
  id: string
  org_id: string
  status: string
  monthly_limit_krw: number | null
  provider_workspace_id: string | null
  org: { name: string } | null
  member: { id: string; name: string; email: string } | null
  service: { name: string; vendor: string } | null
}

type ApproverMember = {
  id: string
  name: string
  email: string
  role: string
  org_id: string
}

export default async function NewVendorKeyPage({
  searchParams,
}: {
  searchParams: { error?: string; org_id?: string; account_id?: string }
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
    redirect('/console/ai-api/vendor-keys?error=' + encodeURIComponent('Super 전용'))
  }

  // active 계정만 (vendor / workspace_id 둘 다 있어야)
  const { data: accountsRaw } = await supabase
    .from('accounts')
    .select('id, org_id, status, monthly_limit_krw, provider_workspace_id, org:orgs!org_id(name), member:members!member_id(id, name, email), service:services!service_id(name, vendor)')
    .eq('status', 'active')
    .not('provider_workspace_id', 'is', null)
    .order('org_id')
    .limit(300)
  const allAccounts = (accountsRaw ?? []) as unknown as AccountWithRefs[]

  // 어댑터 미지원 벤더(예: cursor)의 account 는 발급 불가 → 선택지에서 제외.
  // 진실의 원천: lib/vendor-api/catalog.ts (어댑터 등록 상태에서 자동 파생)
  const supportedVendors = new Set(listVendors().filter(v => v.status !== 'unsupported').map(v => v.name))
  const accounts = allAccounts.filter(a => a.service?.vendor && supportedVendors.has(a.service.vendor as never))
  const hiddenUnsupportedCount = allAccounts.length - accounts.length

  // 승인자 후보 (각 Org 의 Owner/Admin)
  const { data: approversRaw } = await supabase
    .from('members')
    .select('id, name, email, role, org_id')
    .in('role', ['owner', 'admin'])
    .eq('status', 'active')
    .order('org_id')
  const approvers = (approversRaw ?? []) as ApproverMember[]

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Link href="/console/ai-api/vendor-keys" className="text-xs text-gray-500 hover:text-gray-700">
          ← 벤더 키 대행 발급
        </Link>
        <h1 className="text-2xl font-semibold mt-2">벤더 키 대행 발급</h1>
        <p className="text-sm text-gray-500 mt-1">
          외부 벤더의 API 키를 그릿지가 대신 발급해 고객에게 전달합니다. 고객 Org 의 Quota 정책을 그대로 따릅니다 (Super override 없음).
        </p>
      </div>

      {searchParams.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      {accounts.length === 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          발급 가능한 active 계정이 없습니다. provider_workspace_id 가 채워진 active 계정만 표시됩니다.
        </div>
      )}

      {hiddenUnsupportedCount > 0 && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
          벤더 어댑터 미구현으로 {hiddenUnsupportedCount} 개 계정이 목록에서 제외됨 (예: Cursor — 준비중).
        </div>
      )}

      <form action={issueVendorKeyOnBehalf} className="card p-6 space-y-5">
        <div>
          <label htmlFor="account_id" className="block text-sm font-medium text-gray-700 mb-1">
            대상 계정 (Org · 서비스 · 멤버) <span className="text-red-500">*</span>
          </label>
          <select
            id="account_id"
            name="account_id"
            required
            defaultValue={searchParams.account_id ?? ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="" disabled>계정 선택</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id} data-org={a.org_id}>
                [{a.org?.name ?? '?'}] {a.service?.vendor ?? '?'} · {a.service?.name ?? '?'} → {a.member?.name ?? '?'} ({a.member?.email ?? ''})
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            account.status=&apos;active&apos; + provider_workspace_id 가 채워진 계정만.
          </p>
        </div>

        <div>
          <label htmlFor="proxy_member_id" className="block text-sm font-medium text-gray-700 mb-1">
            승인자 (고객 Owner/Admin) <span className="text-red-500">*</span>
          </label>
          <select
            id="proxy_member_id"
            name="proxy_member_id"
            required
            defaultValue=""
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="" disabled>승인자 선택</option>
            {approvers.map(m => (
              <option key={m.id} value={m.id} data-org={m.org_id}>
                [{m.org_id.slice(0, 8)}] {m.name} ({m.email}) — {m.role}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            대행 발급 시에도 고객 측 Owner/Admin 의 명시적 동의가 필요 (전화·메일 확인 필수). 감사 기록에 남음.
          </p>
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
            placeholder="예: 프로덕션 / 백오피스 / 임시 발급"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
          <div className="font-medium">⚠ 주의</div>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>고객 Org 의 Quota 정책을 그대로 따름 (시간당 한도 / 쿨다운). 차단 시 Org 정책 수정 후 재시도.</li>
            <li>벤더 API 호출이 실패하면 발급 실패. quota 카운터는 그대로 차감 (블록 정책).</li>
            <li>발급 후 평문 키는 화면에 1회만 노출. 분실 시 새로 발급.</li>
            <li>대행 발급 사실은 양측 감사 로그에 기록 (visibility=&apos;both&apos;).</li>
          </ul>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={accounts.length === 0 || approvers.length === 0}
            className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            대행 발급
          </button>
          <Link
            href="/console/ai-api/vendor-keys"
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}
