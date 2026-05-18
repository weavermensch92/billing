/**
 * Vendor Admin Tokens 패널 — 임의 org 의 토큰 목록 + 등록/폐기 폼.
 *
 * 두 진입점에서 재사용:
 *   - /console/orgs/[id]/vendor-tokens  (조직 상세 탭)
 *   - /console/ai-api/vendor-tokens     (AI API 허브, ?org=<id>)
 *
 * 권한: Super 만 (액션에서 한 번 더 검증). 페이지 가드는 호출자가 책임.
 */

import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils/format'
import { listVendors, vendorLabel } from '@/lib/vendor-api/catalog'
import { registerCustomerVendorToken, revokeCustomerVendorToken } from './actions'

type Token = {
  id: string
  vendor: string
  vendor_workspace_id: string
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

function statusBadge(status: Token['status']) {
  if (status === 'active') return <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">활성</span>
  if (status === 'rotated') return <span className="text-xs font-medium text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded">회전됨</span>
  if (status === 'expired') return <span className="text-xs font-medium text-orange-700 bg-orange-50 px-2 py-0.5 rounded">만료</span>
  return <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">폐기</span>
}

export async function VendorTokensPanel({
  orgId,
  orgName,
  backHref,
  showAll = false,
}: {
  orgId: string
  orgName: string
  backHref: string
  showAll?: boolean
}) {
  const supabase = await createClient()

  let query = supabase
    .from('vendor_admin_tokens')
    .select('id, vendor, vendor_workspace_id, token_label, token_prefix, status, registered_at, expires_at, last_used_at, last_used_for, use_count, revoked_at, revoked_reason, rotated_at')
    .eq('org_id', orgId)
    .order('registered_at', { ascending: false })
  if (!showAll) query = query.eq('status', 'active')

  const { data: tokensRaw } = await query
  const tokens = (tokensRaw ?? []) as Token[]

  return (
    <div className="space-y-6">
      <div className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">
          신규 토큰 등록 — {orgName}
        </h2>
        <p className="text-xs text-gray-500">
          고객이 벤더 콘솔 (Anthropic / OpenAI 등) 에서 발급받은 admin 토큰을 그릿지가 위임 보관.
          평문은 등록 시 1회만 입력 — AES-256-GCM 암호화 후 저장. 같은 (vendor, workspace) 에 active 토큰이 있으면 자동 회전.
        </p>
        <form action={registerCustomerVendorToken} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input type="hidden" name="org_id" value={orgId} />
          <input type="hidden" name="back_href" value={backHref} />
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vendor</label>
            <select
              name="vendor"
              required
              defaultValue=""
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">선택</option>
              {listVendors().map(v => (
                <option key={v.name} value={v.name} disabled={v.status === 'unsupported'}>
                  {v.label}{v.status === 'unsupported' ? ' (준비중)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vendor Workspace ID</label>
            <input
              type="text"
              name="vendor_workspace_id"
              required
              placeholder="예: ws_xxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Token Label</label>
            <input
              type="text"
              name="token_label"
              required
              placeholder="예: Acme - Anthropic Admin (prod)"
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

      <div className="card overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100 text-xs text-gray-500 flex justify-between">
          <span>{tokens.length} 건 {showAll ? '(전체)' : '(활성만)'}</span>
        </div>
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
                  등록된 토큰이 없습니다.
                </td>
              </tr>
            )}
            {tokens.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">{vendorLabel(t.vendor)}</td>
                <td className="px-4 py-2 font-mono text-xs">{t.vendor_workspace_id}</td>
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
                    <form action={revokeCustomerVendorToken} className="inline-flex items-center gap-2">
                      <input type="hidden" name="org_id" value={orgId} />
                      <input type="hidden" name="back_href" value={backHref} />
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
    </div>
  )
}
