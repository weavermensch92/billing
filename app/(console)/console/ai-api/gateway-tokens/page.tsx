import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/format'
import { registerGatewayToken, revokeGatewayToken } from './actions'
import { GRIDGE_SELF_ORG_ID } from '@/lib/billing/gateway/constants'

type Token = {
  id: string
  vendor: string
  vendor_workspace_id: string
  workspace_id: string | null
  token_label: string
  token_prefix: string | null
  status: 'active' | 'rotated' | 'revoked' | 'expired'
  registered_at: string
  expires_at: string | null
  last_used_at: string | null
  last_used_for: string | null
  use_count: number
  revoked_at: string | null
  revoked_reason: string | null
  rotated_at: string | null
}

type SelfWorkspace = {
  id: string
  vendor_workspace_id: string
  display_name: string
  service: { vendor: string; name: string } | null
}

const VENDOR_LABEL: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  cursor: 'Cursor',
}

function statusBadge(status: Token['status']) {
  if (status === 'active') return <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">활성</span>
  if (status === 'rotated') return <span className="text-xs font-medium text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded">회전됨</span>
  if (status === 'expired') return <span className="text-xs font-medium text-orange-700 bg-orange-50 px-2 py-0.5 rounded">만료</span>
  return <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">폐기</span>
}

export default async function GatewayTokensPage({
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
    redirect('/console/home?error=' + encodeURIComponent('Gateway 토큰 관리는 Super 전용'))
  }

  const showAll = searchParams.show === 'all'

  let query = supabase
    .from('vendor_admin_tokens')
    .select('id, vendor, vendor_workspace_id, workspace_id, token_label, token_prefix, status, registered_at, expires_at, last_used_at, last_used_for, use_count, revoked_at, revoked_reason, rotated_at')
    .eq('org_id', GRIDGE_SELF_ORG_ID)
    .order('registered_at', { ascending: false })

  if (!showAll) query = query.eq('status', 'active')

  const { data: tokensRaw } = await query
  const tokens = (tokensRaw ?? []) as Token[]

  // Gridge self org 의 active vendor_workspaces 목록 (등록 폼 드롭다운)
  // service.vendor 를 JOIN 으로 가져와 vendor 매칭 검증에 사용.
  const { data: workspacesRaw } = await supabase
    .from('vendor_workspaces')
    .select('id, vendor_workspace_id, display_name, service:services(vendor, name)')
    .eq('org_id', GRIDGE_SELF_ORG_ID)
    .eq('status', 'active')
    .order('vendor_workspace_id')
  const workspaces = (workspacesRaw ?? []) as SelfWorkspace[]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gateway Upstream 토큰</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gridge AI Gateway 가 upstream 벤더 (Anthropic 등) 를 호출할 때 사용하는 admin 토큰.
            <br />
            <span className="text-amber-700">평문은 등록 시 1회만 입력 — 저장 후 절대 노출되지 않음.</span> AES-256-GCM 암호화.
          </p>
        </div>
        <Link
          href="/console/ai-api"
          className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg"
        >
          ← AI API 관리
        </Link>
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

      {/* 등록 폼 */}
      <div className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">신규 토큰 등록</h2>
        <p className="text-xs text-gray-500">
          기존 (vendor, vendor_workspace_id) 에 active 토큰이 있으면 <strong>자동 회전</strong>됩니다.
        </p>
        <form action={registerGatewayToken} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vendor</label>
            <select
              name="vendor"
              required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">선택</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
              <option value="cursor">Cursor</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vendor Workspace ID</label>
            <input
              type="text"
              name="vendor_workspace_id"
              required
              placeholder="예: gridge-master-prod"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Token Label</label>
            <input
              type="text"
              name="token_label"
              required
              placeholder="예: Anthropic Master Token (prod)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Token 평문</label>
            <input
              type="password"
              name="plaintext_token"
              required
              autoComplete="off"
              placeholder="sk-ant-..."
              className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Workspace 매핑 (M-2054, 선택)
            </label>
            <select
              name="workspace_id"
              defaultValue=""
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">매핑 안 함 (nullable 유지)</option>
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>
                  [{w.service?.vendor ?? '?'}] {w.display_name} · {w.vendor_workspace_id}
                </option>
              ))}
            </select>
            {workspaces.length === 0 ? (
              <p className="mt-1.5 text-xs text-amber-700">
                Gridge self org 에 등록된 active vendor_workspaces 가 없습니다.
                Workspace 매핑 없이 토큰만 등록 가능 (workspace_id = NULL).
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-gray-500">
                선택한 workspace 의 service.vendor 와 위 Vendor 가 일치해야 합니다 (서버 가드).
                미선택 시 토큰의 workspace_id 는 NULL (점진적 도입).
              </p>
            )}
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg"
            >
              등록 / 회전
            </button>
          </div>
        </form>
      </div>

      {/* 필터 */}
      <div className="flex gap-3 items-center text-xs">
        <Link
          href="/console/ai-api/gateway-tokens"
          className={`px-2 py-1 rounded ${!showAll ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          활성만
        </Link>
        <Link
          href="/console/ai-api/gateway-tokens?show=all"
          className={`px-2 py-1 rounded ${showAll ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          전체 ({tokens.length})
        </Link>
      </div>

      {/* 목록 */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Workspace</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Label</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Prefix</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">상태</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">사용</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">최근 사용</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">등록</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tokens.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">
                  등록된 토큰이 없습니다. {!showAll && '비활성 토큰도 보려면 "전체" 클릭.'}
                </td>
              </tr>
            )}
            {tokens.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">{VENDOR_LABEL[t.vendor] ?? t.vendor}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {t.vendor_workspace_id}
                  {t.workspace_id ? (
                    <span className="ml-1 inline-block text-[10px] text-green-700 bg-green-50 px-1 rounded">FK</span>
                  ) : (
                    <span className="ml-1 inline-block text-[10px] text-amber-700 bg-amber-50 px-1 rounded">미매핑</span>
                  )}
                </td>
                <td className="px-4 py-2">{t.token_label}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-600">
                  {t.token_prefix ?? '—'}<span className="text-gray-300">·····</span>
                </td>
                <td className="px-4 py-2">{statusBadge(t.status)}</td>
                <td className="px-4 py-2 text-right text-xs">{t.use_count.toLocaleString()}</td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {t.last_used_at ? (
                    <>
                      {formatDate(t.last_used_at)}
                      {t.last_used_for && <span className="text-gray-400"> · {t.last_used_for}</span>}
                    </>
                  ) : '—'}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">{formatDate(t.registered_at)}</td>
                <td className="px-4 py-2 text-right">
                  {t.status === 'active' ? (
                    <form action={revokeGatewayToken} className="inline-flex items-center gap-2">
                      <input type="hidden" name="token_id" value={t.id} />
                      <input
                        type="text"
                        name="reason"
                        required
                        placeholder="사유"
                        className="w-32 px-2 py-1 text-xs border border-gray-300 rounded"
                      />
                      <button
                        type="submit"
                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                      >
                        폐기
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-gray-400">
                      {t.revoked_at && `폐기 ${formatDate(t.revoked_at)}`}
                      {t.rotated_at && !t.revoked_at && `회전 ${formatDate(t.rotated_at)}`}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-400 text-right">
        총 {tokens.length} 개 토큰 · 등록 org = <span className="font-mono">gridge_self</span>
      </div>
    </div>
  )
}
