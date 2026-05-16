import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

interface VcnRow {
  id: string
  account_id: string
  status: string
  masked_pan: string | null
  expires_at: string | null
  vendor_label: string | null
  created_at: string
  account?: { provider?: string; member?: { name?: string } }
}

export default async function CardsPage() {
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

  const isAdmin = member.role === 'owner' || member.role === 'admin'

  const { data: vcns } = await supabase
    .from('virtual_cards')
    .select('id, account_id, status, masked_pan, expires_at, vendor_label, created_at, account:accounts(provider, member:members(name))')
    .eq('org_id', member.org_id)
    .neq('status', 'terminated')
    .order('created_at', { ascending: false })

  const cards = (vcns ?? []) as VcnRow[]

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-semibold">카드</h1>

      <div className="border border-gray-200 p-4 bg-gray-50 text-xs space-y-1">
        <div>모든 카드번호는 영구 마스킹됩니다.</div>
        {isAdmin && <div>어드민은 5분 한시 조회를 통해 전체 번호 확인 가능 (감사 기록).</div>}
      </div>

      <div className="space-y-3">
        {cards.length === 0 && <div className="py-8 text-center text-gray-400">활성 카드 없음</div>}
        {cards.map((v) => {
          const isExpiringSoon = v.expires_at && (new Date(v.expires_at).getTime() - Date.now()) < 30 * 86400 * 1000
          return (
            <div key={v.id} className="border border-gray-200 p-4 flex items-start justify-between">
              <div className="space-y-1">
                <div className="font-mono text-lg tracking-wider">
                  {v.masked_pan ?? '•••• •••• •••• ••••'}
                </div>
                <div className="text-xs text-gray-500">
                  {v.account?.provider} · {v.account?.member?.name ?? v.account_id.slice(0, 8)}
                </div>
                {v.expires_at && (
                  <div className={`text-xs ${isExpiringSoon ? 'text-red-600' : 'text-gray-500'}`}>
                    만료: {new Date(v.expires_at).toLocaleDateString('ko-KR')}
                    {isExpiringSoon && ' · 만료 임박 (AM·슈퍼어드민에 알림 전송됨)'}
                  </div>
                )}
                {v.vendor_label && (
                  <div className="text-xs text-gray-400">{v.vendor_label}</div>
                )}
              </div>
              <div className="flex gap-2">
                {isAdmin && (
                  <Link
                    href={`/billing/cards/${v.id}/reveal`}
                    className="text-xs px-3 py-1 border border-gray-300 hover:bg-gray-50"
                  >
                    5분 조회
                  </Link>
                )}
                <Link
                  href={`/services/${v.account_id}`}
                  className="text-xs px-3 py-1 bg-black text-white"
                >
                  교체
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      <div className="text-xs text-gray-500 border-l-[3px] border-l-gray-300 pl-3 py-2">
        5분 조회는 2FA 재확인 후 활성화됩니다. 조회는 audit_logs(visibility=&apos;org_internal&apos;)에 기록됩니다.
        카드 교체는 Idea 1 가이드 (수동 입력 + 1회 토큰 등록).
      </div>
    </div>
  )
}
