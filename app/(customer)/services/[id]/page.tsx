import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'

export default async function ServiceDetailPage({
  params,
}: {
  params: { id: string }
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

  const { data: account } = await supabase
    .from('accounts')
    .select('*, service:services(name, vendor), member:members!member_id(name), virtual_cards(*)')
    .eq('id', params.id)
    .eq('org_id', member.org_id)
    .maybeSingle()

  if (!account) notFound()

  const acc = account as Record<string, unknown> & {
    service?: { name?: string; vendor?: string }
    member?: { name?: string }
    virtual_cards?: Array<{ id: string; masked_pan: string; status: string; expires_at: string }>
  }
  const vcns = acc.virtual_cards ?? []
  const activeVcn = vcns.find((v) => v.status === 'active')
  const isAdmin = member.role === 'owner' || member.role === 'admin'

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <div className="text-xs text-gray-500 mb-1">{acc.service?.vendor}</div>
        <h1 className="text-2xl font-semibold">{acc.service?.name}</h1>
        <div className="text-xs text-gray-500 mt-1">{acc.member?.name}</div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <Info label="상태" value={String(acc.status ?? '')} />
        <Info label="월 한도" value={`₩${Number(acc.monthly_limit_krw ?? 0).toLocaleString('ko-KR')}`} mono />
        <Info label="해외결제" value={acc.allow_overseas ? '허용' : '차단'} />
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">VCN</h2>
        {!activeVcn ? (
          <div className="text-sm text-gray-400 py-4">활성 VCN 없음</div>
        ) : (
          <div className="border border-gray-200 p-4">
            <div className="font-mono tracking-wider">{activeVcn.masked_pan ?? '•••• •••• •••• ••••'}</div>
            <div className="text-xs text-gray-500 mt-2">
              만료: {activeVcn.expires_at ? new Date(activeVcn.expires_at).toLocaleDateString('ko-KR') : '–'}
            </div>
          </div>
        )}
      </section>

      {isAdmin && activeVcn && (
        <section className="border border-gray-200 p-5 space-y-4">
          <h2 className="text-lg font-medium">카드 교체 (Idea 1)</h2>
          <ol className="text-sm space-y-3 list-decimal list-inside">
            <li>
              [전체번호 5분 조회] 클릭 후 2FA 재확인 → 카드번호 복사
              <Link href={`/billing/cards/${activeVcn.id}/reveal`} className="ml-2 text-xs text-blue-600 hover:underline">[조회 →]</Link>
            </li>
            <li>벤더 콘솔에서 Billing → Payment methods → 카드 수동 입력 (OTP 면제 사전 등록됨)</li>
            <li>입력 완료 후 아래 체크리스트 확인</li>
            <li>벤더 워크스페이스에서 admin token 1회 생성 (Q4-1) → 아래 토큰 재등록</li>
          </ol>

          <div className="border border-gray-100 p-3 bg-gray-50 space-y-2 text-xs">
            <CheckItem label="벤더 콘솔에서 카드 등록 완료" />
            <CheckItem label="결제 테스트 1건 성공 확인" />
            <CheckItem label="이전 카드 삭제 (혼선 방지)" />
          </div>

          <form className="space-y-3 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium">벤더 admin token 재등록 (1회 수동)</h3>
            <input
              name="token_label"
              type="text"
              required
              placeholder="토큰 라벨 (예: Anthropic Workspace-Acme)"
              className="w-full border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              name="plaintext_token"
              type="password"
              required
              placeholder="벤더 콘솔에서 발급한 admin token"
              className="w-full border border-gray-300 px-3 py-2 text-sm font-mono"
            />
            <input
              name="vendor_workspace_id"
              type="text"
              required
              placeholder="vendor workspace id"
              className="w-full border border-gray-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="w-full py-2 bg-black text-white text-sm">
              토큰 암호화 보관 (AES-256-GCM)
            </button>
            <div className="text-xs text-gray-500">
              평문 토큰은 DB에 저장되지 않습니다 (앱 레이어 암호화 → BYTEA). 등록 후 멤버 sync 1h 자동 시작.
            </div>
          </form>
        </section>
      )}
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}

function CheckItem({ label }: { label: string }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" className="border-gray-300" />
      <span>{label}</span>
    </label>
  )
}
