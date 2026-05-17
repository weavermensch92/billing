import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createWorkspace } from '../actions'

const STATUS_OPTIONS = [
  { value: 'active',     label: '활성 (active)' },
  { value: 'suspended',  label: '정지 (suspended)' },
  { value: 'terminated', label: '종료 (terminated)' },
]

export default async function NewWorkspacePage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: me } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!me) redirect('/console/login')

  if (me.role !== 'super') {
    redirect('/console/workspaces?error=' + encodeURIComponent(`워크스페이스 등록은 Super 권한 필요 (현재: ${me.role})`))
  }

  const [{ data: orgs }, { data: services }] = await Promise.all([
    supabase.from('orgs').select('id, name').order('name'),
    supabase.from('services').select('id, name, vendor').eq('is_active', true).order('vendor').order('name'),
  ])

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <Link href="/console/workspaces" className="text-xs text-gray-500 hover:underline">
          ← 워크스페이스 목록
        </Link>
        <h1 className="text-2xl font-semibold mt-2">벤더 워크스페이스 등록</h1>
        <p className="text-xs text-gray-500 mt-1">
          Anthropic Console / OpenAI Platform 등 벤더 측 워크스페이스를 등록합니다.
        </p>
      </div>

      {searchParams.error && (
        <div className="border-l-[3px] border-l-red-500 pl-3 py-2 text-sm text-red-700 bg-red-50">
          {decodeURIComponent(searchParams.error)}
        </div>
      )}

      <form action={createWorkspace} className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Org <span className="text-red-500">*</span>
          </label>
          <select
            name="org_id"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Org 선택</option>
            {(orgs ?? []).map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            서비스 <span className="text-red-500">*</span>
          </label>
          <select
            name="service_id"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">서비스 선택</option>
            {(services ?? []).map((svc) => (
              <option key={svc.id} value={svc.id}>
                [{svc.vendor}] {svc.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Workspace ID <span className="text-red-500">*</span>
          </label>
          <input
            name="vendor_workspace_id"
            type="text"
            required
            maxLength={200}
            placeholder="org_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          />
          <p className="mt-1 text-xs text-gray-500">
            벤더 콘솔의 워크스페이스/조직 ID. 서비스 내에서 유일해야 합니다.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            표시명 <span className="text-red-500">*</span>
          </label>
          <input
            name="display_name"
            type="text"
            required
            maxLength={200}
            placeholder="Gridge — Anthropic 메인 콘솔"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">내부 식별을 위한 이름.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
          <select
            name="status"
            defaultValue="active"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-between pt-4 border-t border-gray-100">
          <Link href="/console/workspaces" className="text-sm text-gray-600 hover:text-gray-900">
            취소
          </Link>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2 rounded-lg"
          >
            등록
          </button>
        </div>
      </form>
    </div>
  )
}
