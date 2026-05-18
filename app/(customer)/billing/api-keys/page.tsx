import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { issueApiKey, revokeApiKey } from './actions'

interface ApiKeyRow {
  id: string
  account_id: string
  team_id: string | null
  provider: string
  provider_key_id: string
  label: string | null
  status: string
  created_at: string
  revoked_at: string | null
}

interface TeamRow {
  id: string
  name: string
  is_unassigned: boolean
}

interface QuotaStatusRow {
  org_id: string
  current_window_count: number
  current_window_start_at: string
  cooldown_until: string | null
  total_issued_count: number
}

interface PolicyRow {
  issuances_per_hour_limit: number
  cooldown_hours: number
}

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string; reveal?: string; keyId?: string; revoked?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, org_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!member) redirect('/login')

  const [keysRes, accountsRes, policyRes, quotaRes, teamsRes] = await Promise.all([
    supabase.from('api_keys').select('*').eq('org_id', member.org_id).neq('status', 'revoked').order('created_at', { ascending: false }),
    supabase.from('accounts').select('id, provider, monthly_limit_krw, member:members(name)').eq('org_id', member.org_id).eq('status', 'active'),
    supabase.from('key_issuance_policies').select('issuances_per_hour_limit, cooldown_hours').eq('org_id', member.org_id).maybeSingle(),
    supabase.from('key_issuance_quota').select('*').eq('org_id', member.org_id).maybeSingle(),
    supabase.from('teams').select('id, name, is_unassigned').eq('org_id', member.org_id).order('is_unassigned').order('name'),
  ])

  const keys = (keysRes.data ?? []) as ApiKeyRow[]
  const policy = (policyRes.data ?? { issuances_per_hour_limit: 3, cooldown_hours: 24 }) as PolicyRow
  const quota = quotaRes.data as QuotaStatusRow | null
  const accounts = (accountsRes.data ?? []) as Array<{ id: string; provider: string; member?: { name?: string } }>
  const teams = (teamsRes.data ?? []) as TeamRow[]
  const teamNameById = new Map<string, string>(teams.map((t) => [t.id, t.is_unassigned ? '미할당' : t.name]))

  const inCooldown = quota?.cooldown_until && new Date(quota.cooldown_until) > new Date()
  const remainingInWindow = quota
    ? Math.max(0, policy.issuances_per_hour_limit - quota.current_window_count)
    : policy.issuances_per_hour_limit

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-semibold">API 키</h1>

      {searchParams.reveal && (
        <div className="border-l-[3px] border-l-yellow-500 pl-4 py-3 bg-yellow-50">
          <div className="text-sm font-medium">발급 완료 · 키 값은 이 화면에서만 1회 노출됩니다</div>
          <div className="mt-2 font-mono text-xs break-all bg-white border border-gray-300 p-2">{searchParams.reveal}</div>
          <div className="text-xs text-gray-500 mt-2">위 키를 복사한 후 페이지를 이동하면 다시 볼 수 없습니다.</div>
        </div>
      )}
      {searchParams.error && (
        <div className="border-l-[3px] border-l-red-500 pl-3 py-2 text-sm text-red-700 bg-red-50">{searchParams.error}</div>
      )}

      <div className="border border-gray-200 p-4 bg-gray-50 text-sm space-y-1">
        <div>발급 임계: <span className="font-mono">{policy.issuances_per_hour_limit}회/시간</span> + 쿨다운 <span className="font-mono">{policy.cooldown_hours}h</span></div>
        <div>현재 윈도우 잔여: <span className="font-mono">{remainingInWindow}회</span></div>
        {inCooldown && (
          <div className="text-red-700">
            쿨다운 진행 중 · {new Date(quota!.cooldown_until!).toLocaleString('ko-KR')} 까지 발급 차단
          </div>
        )}
      </div>

      {(member.role === 'owner' || member.role === 'admin') && (
        <form action={issueApiKey} className="border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-medium">신규 키 발급</h3>
          <select name="account_id" required className="w-full border border-gray-300 px-3 py-2 text-sm">
            <option value="">계정 선택</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.provider} — {a.member?.name ?? a.id.slice(0, 8)}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input name="vendor" type="text" required placeholder="vendor (anthropic / openai)" className="border border-gray-300 px-3 py-2 text-sm" />
            <input name="vendor_workspace_id" type="text" required placeholder="vendor workspace id" className="border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <select name="team_id" defaultValue="" className="w-full border border-gray-300 px-3 py-2 text-sm">
            <option value="">조직 전체용 (팀 미지정)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.is_unassigned ? '미할당' : t.name}</option>
            ))}
          </select>
          <input name="key_label" type="text" placeholder="키 라벨 (선택)" className="w-full border border-gray-300 px-3 py-2 text-sm" />
          <input type="hidden" name="approved_by_org_admin" value={member.id} />
          <button type="submit" disabled={!!inCooldown} className="w-full py-2 bg-black text-white text-sm disabled:bg-gray-400">
            {inCooldown ? '쿨다운 중 (발급 불가)' : '발급'}
          </button>
          <p className="text-xs text-gray-500">
            팀 선택 시 해당 팀 전용 키. 미선택 시 조직 전체에서 사용 가능.
          </p>
        </form>
      )}

      <div>
        <h2 className="text-lg font-medium mb-3">활성 키</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500 border-b">
            <tr><th className="py-2">벤더</th><th className="py-2">팀</th><th className="py-2">라벨</th><th className="py-2">발급일</th><th className="py-2"></th></tr>
          </thead>
          <tbody>
            {keys.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-gray-400">활성 키 없음</td></tr>}
            {keys.map((k) => (
              <tr key={k.id} className="border-b border-gray-100">
                <td className="py-2">{k.provider}</td>
                <td className="py-2 text-xs">
                  {k.team_id ? (
                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{teamNameById.get(k.team_id) ?? '알 수 없음'}</span>
                  ) : (
                    <span className="text-gray-400">조직 전체</span>
                  )}
                </td>
                <td className="py-2">{k.label ?? '(없음)'}</td>
                <td className="py-2 font-mono text-xs">{new Date(k.created_at).toLocaleDateString('ko-KR')}</td>
                <td className="py-2 text-right">
                  <form action={revokeApiKey} className="inline">
                    <input type="hidden" name="key_id" value={k.id} />
                    <button type="submit" className="text-xs text-red-600 hover:underline">삭제</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
