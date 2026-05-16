import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { submitOnBehalf } from '../actions'

const ACTION_TYPE_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: 'new_account',       label: '신규 계정 발급',       desc: '새 서비스 계정을 발급하고 VCN 을 연결' },
  { value: 'limit_change',      label: '한도 변경',           desc: '특정 계정 / 카드의 월 한도 증감' },
  { value: 'terminate',         label: '계정 해지',           desc: '특정 계정 해지 (멤버 오프보딩 등)' },
  { value: 'bulk_terminate',    label: '일괄 해지',           desc: '여러 계정 동시 해지' },
  { value: 'vcn_replace',       label: '카드 교체',           desc: '분실·만료·이상 거래 등으로 VCN 재발급' },
  { value: 'decline_response',  label: '결제 거절 대응',       desc: '카드 결제 거절 발생 시 후속 처리' },
]

export default async function ConsoleNewRequestPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { error?: string; type?: string }
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
  if (me.role !== 'super' && me.role !== 'am') {
    redirect(`/console/orgs/${params.id}?error=` + encodeURIComponent('대신 제출은 Super 또는 AM 만 가능합니다.'))
  }

  const { data: org } = await supabase
    .from('orgs')
    .select('id, name')
    .eq('id', params.id)
    .maybeSingle()
  if (!org) {
    redirect('/console/orgs?error=' + encodeURIComponent('Org 를 찾을 수 없습니다.'))
  }

  // 폼 보조 옵션 — 같은 org 의 active 계정 / 멤버 목록
  const [accountsRes, membersRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, status, service:services!service_id(name, vendor), member:members!member_id(name)')
      .eq('org_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('members')
      .select('id, name, email, role, status')
      .eq('org_id', params.id)
      .neq('status', 'offboarded')
      .order('role'),
  ])

  type AccountRow = {
    id: string
    status: string
    service: { name: string; vendor: string } | null
    member: { name: string } | null
  }
  const accounts = (accountsRes.data ?? []) as unknown as AccountRow[]
  const members = (membersRes.data ?? []) as { id: string; name: string; email: string; role: string; status: string }[]

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Link
          href={`/console/orgs/${params.id}`}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          ← {org.name}
        </Link>
        <h1 className="text-2xl font-semibold mt-2">신규 요청 대신 제출</h1>
        <p className="text-sm text-gray-500 mt-1">
          고객이 전화·메일로 의뢰한 내용을 시스템에 기록합니다. 제출 후 즉시
          요청 상세 페이지로 이동하며, 본인에게 자동 배정됩니다 (status=in_review).
        </p>
      </div>

      {searchParams.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      <form action={submitOnBehalf} className="card p-6 space-y-5">
        <input type="hidden" name="org_id" value={params.id} />

        <div>
          <label htmlFor="action_type" className="block text-sm font-medium text-gray-700 mb-1">
            요청 유형 <span className="text-red-500">*</span>
          </label>
          <select
            id="action_type"
            name="action_type"
            required
            defaultValue={searchParams.type ?? ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          >
            <option value="" disabled>유형 선택</option>
            {ACTION_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
            제목 <span className="text-red-500">*</span>
          </label>
          <input
            id="subject"
            name="subject"
            type="text"
            required
            maxLength={200}
            minLength={3}
            placeholder="예: Claude Team 계정 1개 추가 발급 요청"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="detail" className="block text-sm font-medium text-gray-700 mb-1">
            상세 내용 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="detail"
            name="detail"
            required
            rows={5}
            maxLength={2000}
            minLength={5}
            placeholder="고객 의뢰 내용 그대로 기록. 예: 마케팅팀 김길동(gildong@acme.com) Claude Team 사용 위해 신규 계정 발급. 월 한도 50만원. 전화로 확인 — 5/16 14:30."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            누가 / 무엇을 / 왜 / 언제 — 후속 처리 담당자가 그대로 활용할 수 있게.
          </p>
        </div>

        <div>
          <label htmlFor="member_id" className="block text-sm font-medium text-gray-700 mb-1">
            관련 멤버 (선택)
          </label>
          <select
            id="member_id"
            name="member_id"
            defaultValue=""
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          >
            <option value="">없음</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.email}) — {m.role}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="account_id" className="block text-sm font-medium text-gray-700 mb-1">
            관련 계정 (선택)
          </label>
          <select
            id="account_id"
            name="account_id"
            defaultValue=""
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          >
            <option value="">없음</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.service?.vendor ?? '?'} · {a.service?.name ?? '?'} · {a.member?.name ?? '미할당'} [{a.status}]
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="customer_contact" className="block text-sm font-medium text-gray-700 mb-1">
            고객 연락처 (선택)
          </label>
          <input
            id="customer_contact"
            name="customer_contact"
            type="text"
            maxLength={200}
            placeholder="예: 김부장 010-1234-5678 / kim@acme.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            대신 제출 (in_review 로 생성)
          </button>
          <Link
            href={`/console/orgs/${params.id}`}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}
