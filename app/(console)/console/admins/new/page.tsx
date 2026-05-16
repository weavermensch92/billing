import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { inviteAdmin } from './actions'

const ROLE_OPTIONS: { value: 'super' | 'am' | 'finance' | 'ops'; label: string; desc: string }[] = [
  { value: 'am',      label: 'AM',      desc: '요청 처리·CSM·고객사 운영 (기본값)' },
  { value: 'finance', label: 'Finance', desc: '청구서·매입·정산 (2FA 필수)' },
  { value: 'ops',     label: 'Ops',     desc: 'VCN·결제 모니터링·이상 감지' },
  { value: 'super',   label: 'Super',   desc: '모든 권한 (관리자 계정 관리 포함, 2FA 필수)' },
]

export default async function NewAdminPage({
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
    .eq('email', user.email ?? '')
    .eq('is_active', true)
    .maybeSingle()
  if (!me) redirect('/console/login')

  if (me.role !== 'super') {
    redirect('/console/admins?error=' + encodeURIComponent(`관리자 초대는 Super 권한 필요 (현재 역할: ${me.role})`))
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <Link href="/console/admins" className="text-xs text-gray-500 hover:underline">
          ← 관리자 목록
        </Link>
        <h1 className="text-2xl font-semibold mt-2">신규 관리자 초대</h1>
        <p className="text-xs text-gray-500 mt-1">
          입력한 이메일로 Supabase Auth 초대 링크가 발송됩니다. 수신자는 링크 클릭 후 본인이 비밀번호를 설정합니다.
        </p>
      </div>

      {searchParams.error && (
        <div className="border-l-[3px] border-l-red-500 pl-3 py-2 text-sm text-red-700 bg-red-50">
          {decodeURIComponent(searchParams.error)}
        </div>
      )}

      <form action={inviteAdmin} className="card p-6 bg-white space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input
            name="email"
            type="email"
            required
            placeholder="admin@gridge.ai"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">@gridge.ai 도메인 권장 (내부 운영 계정).</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
          <input
            name="name"
            type="text"
            required
            maxLength={50}
            placeholder="홍길동"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">역할</label>
          <div className="space-y-2">
            {ROLE_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="radio"
                  name="role"
                  value={opt.value}
                  defaultChecked={opt.value === 'am'}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-500">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
          · Super·Finance 는 첫 로그인 후 2FA(TOTP) 등록이 필요합니다.<br />
          · 초대 후에도 역할 변경·비활성화는 관리자 상세 페이지에서 가능합니다.<br />
          · 마지막 활성 Super 는 자신을 강등·비활성화할 수 없습니다.
        </div>

        <div className="flex justify-between pt-4 border-t border-gray-100">
          <Link href="/console/admins" className="text-sm text-gray-600 hover:text-gray-900">
            취소
          </Link>
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-6 py-2 rounded-lg"
          >
            초대 발송
          </button>
        </div>
      </form>
    </div>
  )
}
