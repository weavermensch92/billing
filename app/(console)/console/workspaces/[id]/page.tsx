import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/format'
import { vendorLabel } from '@/lib/vendor-api/catalog'

interface WorkspaceDetail {
  id: string
  org_id: string
  vendor_workspace_id: string
  display_name: string
  status: 'active' | 'suspended' | 'terminated'
  created_at: string
  org: { id: string; name: string } | null
  service: { id: string; name: string; vendor: string } | null
}

interface MemberRow {
  id: string
  account_id: string
  vendor_member_role: string
  joined_at: string
  left_at: string | null
  account: {
    member: { id: string; name: string; email: string } | null
  } | null
}

interface CardRow {
  id: string
  card_kind: string
  card_type: string
  card_last4: string | null
  status: string
  monthly_limit_krw: number
  issued_at: string | null
  activated_at: string | null
}

interface InvoiceRow {
  id: string
  vendor_invoice_id: string
  source_type: string
  billing_period_start: string
  billing_period_end: string
  total_krw: number | null
  fetched_at: string
}

interface TokenRow {
  id: string
  vendor: string
  token_label: string
  token_prefix: string | null
  status: string
  registered_at: string
  last_used_at: string | null
}

const STATUS_BADGE: Record<WorkspaceDetail['status'], string> = {
  active: 'text-green-700 bg-green-50',
  suspended: 'text-yellow-700 bg-yellow-50',
  terminated: 'text-gray-600 bg-gray-100',
}

export default async function WorkspaceDetailPage({ params }: { params: { id: string } }) {
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

  const { data: wsRaw } = await supabase
    .from('vendor_workspaces')
    .select('id, org_id, vendor_workspace_id, display_name, status, created_at, org:orgs(id, name), service:services(id, name, vendor)')
    .eq('id', params.id)
    .maybeSingle()
  const ws = wsRaw as unknown as WorkspaceDetail | null
  if (!ws) {
    redirect('/console/workspaces?error=' + encodeURIComponent('워크스페이스를 찾을 수 없습니다.'))
  }

  // 병렬 조회: 멤버 / 카드 / 청구서 / 토큰
  const [membersRes, cardsRes, invoicesRes, tokensRes] = await Promise.all([
    supabase
      .from('workspace_members')
      .select('id, account_id, vendor_member_role, joined_at, left_at, account:accounts(member:members(id, name, email))')
      .eq('workspace_id', ws.id)
      .order('joined_at', { ascending: false })
      .limit(100),
    supabase
      .from('virtual_cards')
      .select('id, card_kind, card_type, card_last4, status, monthly_limit_krw, issued_at, activated_at')
      .eq('workspace_id', ws.id)
      .order('issued_at', { ascending: false, nullsFirst: false })
      .limit(30),
    supabase
      .from('vendor_invoices')
      .select('id, vendor_invoice_id, source_type, billing_period_start, billing_period_end, total_krw, fetched_at')
      .eq('workspace_id', ws.id)
      .order('billing_period_start', { ascending: false })
      .limit(20),
    supabase
      .from('vendor_admin_tokens')
      .select('id, vendor, token_label, token_prefix, status, registered_at, last_used_at')
      .eq('workspace_id', ws.id)
      .order('registered_at', { ascending: false })
      .limit(20),
  ])

  const members = (membersRes.data ?? []) as unknown as MemberRow[]
  const cards = (cardsRes.data ?? []) as CardRow[]
  const invoices = (invoicesRes.data ?? []) as InvoiceRow[]
  const tokens = (tokensRes.data ?? []) as TokenRow[]

  const activeMembers = members.filter(m => m.left_at === null).length
  const activeCards = cards.filter(c => c.status === 'active').length
  const stat = STATUS_BADGE[ws.status]

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div>
        <Link href="/console/workspaces" className="text-xs text-gray-500 hover:text-gray-700">
          ← 벤더 워크스페이스
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{ws.display_name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {ws.org?.name ?? ws.org_id.slice(0, 8)} · {vendorLabel(ws.service?.vendor ?? '?')} · {ws.service?.name ?? '?'}
            </p>
            <p className="text-xs font-mono text-gray-400 mt-1">{ws.vendor_workspace_id}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 text-xs ${stat}`}>{ws.status}</span>
            {me.role === 'super' && (
              <Link
                href={`/console/orgs/${ws.org_id}/vendor-tokens`}
                className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
              >
                토큰 관리
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Stat label="활성 멤버" value={activeMembers} />
        <Stat label="활성 카드" value={activeCards} />
        <Stat label="청구서" value={invoices.length} />
        <Stat label="등록 토큰" value={tokens.filter(t => t.status === 'active').length} />
      </div>

      {/* 토큰 */}
      <Section title="벤더 admin 토큰" hint="키 발급·청구서 조회 시 사용. AES-256-GCM 암호화.">
        {tokens.length === 0 ? (
          <Empty>등록된 토큰 없음</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b">
              <tr>
                <th className="text-left py-2 px-3">벤더</th>
                <th className="text-left py-2 px-3">라벨</th>
                <th className="text-left py-2 px-3">Prefix</th>
                <th className="text-left py-2 px-3">상태</th>
                <th className="text-left py-2 px-3">최근 사용</th>
                <th className="text-left py-2 px-3">등록</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map(t => (
                <tr key={t.id} className="border-b border-gray-100">
                  <td className="py-2 px-3">{vendorLabel(t.vendor)}</td>
                  <td className="py-2 px-3">{t.token_label}</td>
                  <td className="py-2 px-3 font-mono text-xs">{t.token_prefix ?? '—'}·····</td>
                  <td className="py-2 px-3 text-xs">{t.status}</td>
                  <td className="py-2 px-3 text-xs text-gray-500">{t.last_used_at ? formatDate(t.last_used_at) : '—'}</td>
                  <td className="py-2 px-3 text-xs text-gray-500">{formatDate(t.registered_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* 카드 */}
      <Section
        title="연결된 카드"
        hint="card_kind=workspace_card 인 가상카드. 워크스페이스 1:1 청구 단위."
      >
        {cards.length === 0 ? (
          <Empty>이 워크스페이스에 발급된 카드 없음</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b">
              <tr>
                <th className="text-left py-2 px-3">종류</th>
                <th className="text-left py-2 px-3">타입</th>
                <th className="text-left py-2 px-3">Last4</th>
                <th className="text-left py-2 px-3">상태</th>
                <th className="text-right py-2 px-3">월 한도</th>
                <th className="text-left py-2 px-3">발급</th>
                <th className="text-left py-2 px-3">활성화</th>
              </tr>
            </thead>
            <tbody>
              {cards.map(c => (
                <tr key={c.id} className="border-b border-gray-100">
                  <td className="py-2 px-3 text-xs">{c.card_kind}</td>
                  <td className="py-2 px-3 text-xs">{c.card_type}</td>
                  <td className="py-2 px-3 font-mono text-xs">{c.card_last4 ? `****${c.card_last4}` : '—'}</td>
                  <td className="py-2 px-3 text-xs">{c.status}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs">₩{c.monthly_limit_krw.toLocaleString('ko-KR')}</td>
                  <td className="py-2 px-3 text-xs text-gray-500">{c.issued_at ? formatDate(c.issued_at) : '—'}</td>
                  <td className="py-2 px-3 text-xs text-gray-500">{c.activated_at ? formatDate(c.activated_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* 청구서 */}
      <Section
        title="최근 청구서"
        hint="source_type=workspace_invoice. 매칭 실패 청구서는 /console/workspaces 의 미연결 청구서 알림에서 관리."
      >
        {invoices.length === 0 ? (
          <Empty>이 워크스페이스 청구서 없음</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b">
              <tr>
                <th className="text-left py-2 px-3">기간</th>
                <th className="text-left py-2 px-3">출처</th>
                <th className="text-right py-2 px-3">금액 (KRW)</th>
                <th className="text-left py-2 px-3">External ID</th>
                <th className="text-left py-2 px-3">수신</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(i => (
                <tr key={i.id} className="border-b border-gray-100">
                  <td className="py-2 px-3 text-xs">{i.billing_period_start} ~ {i.billing_period_end}</td>
                  <td className="py-2 px-3 text-xs">{i.source_type}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs">
                    {i.total_krw == null ? '—' : `₩${i.total_krw.toLocaleString('ko-KR')}`}
                  </td>
                  <td className="py-2 px-3 font-mono text-xs text-gray-500">{i.vendor_invoice_id}</td>
                  <td className="py-2 px-3 text-xs text-gray-500">{formatDate(i.fetched_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* 멤버 */}
      <Section title="워크스페이스 멤버" hint="vendor 측 워크스페이스에 가입된 그릿지 멤버.">
        {members.length === 0 ? (
          <Empty>등록 멤버 없음</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b">
              <tr>
                <th className="text-left py-2 px-3">이름</th>
                <th className="text-left py-2 px-3">이메일</th>
                <th className="text-left py-2 px-3">역할</th>
                <th className="text-left py-2 px-3">합류</th>
                <th className="text-left py-2 px-3">이탈</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className={`border-b border-gray-100 ${m.left_at ? 'text-gray-400' : ''}`}>
                  <td className="py-2 px-3">{m.account?.member?.name ?? '—'}</td>
                  <td className="py-2 px-3 font-mono text-xs">{m.account?.member?.email ?? '—'}</td>
                  <td className="py-2 px-3 text-xs">{m.vendor_member_role}</td>
                  <td className="py-2 px-3 text-xs text-gray-500">{formatDate(m.joined_at)}</td>
                  <td className="py-2 px-3 text-xs text-gray-500">{m.left_at ? formatDate(m.left_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-mono mt-1">{value}</div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
      <div className="overflow-x-auto">
        {children}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-gray-400">{children}</div>
}
