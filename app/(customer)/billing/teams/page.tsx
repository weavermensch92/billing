import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { setTeamHeadroom } from './actions'

interface TeamRow {
  id: string
  name: string
  is_unassigned: boolean
  member_count?: number
}

interface HeadroomRow {
  team_id: string
  headroom_limit_krw: number
  headroom_used_krw: number
}

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string }
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

  const [orgRes, teamsRes, headroomRes] = await Promise.all([
    supabase.from('orgs').select('self_approval_headroom_krw, self_approval_used_krw').eq('id', member.org_id).single(),
    supabase.from('teams').select('id, name, is_unassigned').eq('org_id', member.org_id).order('is_unassigned').order('name'),
    supabase.from('team_headroom').select('*').eq('org_id', member.org_id),
  ])

  const org = (orgRes.data ?? { self_approval_headroom_krw: 0, self_approval_used_krw: 0 }) as { self_approval_headroom_krw: number; self_approval_used_krw: number }
  const teams = (teamsRes.data ?? []) as TeamRow[]
  const headroomRows = (headroomRes.data ?? []) as HeadroomRow[]
  const headroomMap = new Map<string, HeadroomRow>(headroomRows.map((h) => [h.team_id, h]))

  const totalAllocated = headroomRows.reduce((s, h) => s + (h.headroom_limit_krw ?? 0), 0)
  const orgHeadroom = org.self_approval_headroom_krw ?? 0
  const orgUsed = org.self_approval_used_krw ?? 0
  const allocationGapKrw = orgHeadroom - totalAllocated

  const isAdmin = member.role === 'owner' || member.role === 'admin'

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-semibold">팀 헤드룸 분배</h1>

      {searchParams.error && (
        <div className="border-l-[3px] border-l-red-500 pl-3 py-2 text-sm text-red-700 bg-red-50">{searchParams.error}</div>
      )}
      {searchParams.ok && (
        <div className="border-l-[3px] border-l-green-500 pl-3 py-2 text-sm text-green-700 bg-green-50">분배 저장됨</div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Org headroom" value={orgHeadroom} />
        <Stat label="Org 사용액" value={orgUsed} />
        <Stat label={allocationGapKrw < 0 ? '초과 분배' : '미분배'} value={Math.abs(allocationGapKrw)} negative={allocationGapKrw < 0} />
      </div>

      <div className="border border-gray-200">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500 bg-gray-50">
            <tr>
              <th className="py-2 px-3">팀</th>
              <th className="py-2 px-3 text-right">한도</th>
              <th className="py-2 px-3 text-right">사용액</th>
              <th className="py-2 px-3 text-right">잔여</th>
              {isAdmin && <th className="py-2 px-3"></th>}
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const h = headroomMap.get(t.id)
              const limit = h?.headroom_limit_krw ?? 0
              const used = h?.headroom_used_krw ?? 0
              return (
                <tr key={t.id} className="border-t border-gray-100">
                  <td className="py-2 px-3">
                    {t.name}
                    {t.is_unassigned && <span className="ml-2 text-xs text-gray-400">(미할당)</span>}
                  </td>
                  <td className="py-2 px-3 text-right font-mono">₩{limit.toLocaleString('ko-KR')}</td>
                  <td className="py-2 px-3 text-right font-mono">₩{used.toLocaleString('ko-KR')}</td>
                  <td className="py-2 px-3 text-right font-mono">₩{Math.max(0, limit - used).toLocaleString('ko-KR')}</td>
                  {isAdmin && (
                    <td className="py-2 px-3">
                      <form action={setTeamHeadroom} className="flex gap-1">
                        <input type="hidden" name="team_id" value={t.id} />
                        <input
                          name="headroom_limit_krw"
                          type="number"
                          min="0"
                          step="100000"
                          defaultValue={limit}
                          className="w-24 border border-gray-300 px-2 py-1 text-xs font-mono"
                        />
                        <button type="submit" className="px-2 py-1 bg-black text-white text-xs">저장</button>
                      </form>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500 border-l-[3px] border-l-gray-300 pl-3 py-2">
        팀 합계 ≤ Org headroom 한도 (트리거 자동 검증). 초과 저장 시 EXCEPTION으로 거부됨.
      </div>
    </div>
  )
}

function Stat({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="border border-gray-200 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-mono mt-1 ${negative ? 'text-red-600' : ''}`}>
        ₩{value.toLocaleString('ko-KR')}
      </div>
    </div>
  )
}
