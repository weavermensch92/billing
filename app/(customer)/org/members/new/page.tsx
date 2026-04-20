import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { inviteMember } from './actions'

export default async function InviteMemberPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentMember } = await supabase
    .from('members').select('role').eq('user_id', user.id).eq('status', 'active').single()

  if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
    redirect('/org/members?error=권한이 없습니다.')
  }

  return (
    <div className="max-w-xl mx-auto">
      <Link href="/org/members" className="text-sm text-gray-500 hover:text-gray-700">
        ← 멤버 관리
      </Link>

      <div className="mt-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">멤버 초대</h1>
        <p className="text-sm text-gray-500 mt-1">
          이메일로 초대 링크를 발송합니다. 7일 이내 수락해야 합니다.
        </p>
      </div>

      {searchParams.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      <form action={inviteMember} className="card p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
          <input
            name="name"
            type="text"
            required
            placeholder="홍길동"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input
            name="email"
            type="email"
            required
            placeholder="user@company.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">역할</label>
          <div className="space-y-2">
            {(currentMember.role === 'owner' ? ['admin', 'member'] : ['member']).map(r => (
              <label key={r} className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input type="radio" name="role" value={r} defaultChecked={r === 'member'} className="mt-1" required />
                <div>
                  <p className="font-medium text-gray-900 capitalize">{r}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {r === 'admin' && '조직 전체 관리 · 계정 요청 · 멤버 초대'}
                    {r === 'member' && '본인 계정만 관리 · 요청 제출'}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-gray-100">
          <Link
            href="/org/members"
            className="flex-1 text-center border border-gray-300 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
          >
            취소
          </Link>
          <button
            type="submit"
            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 rounded-lg"
          >
            초대 보내기
          </button>
        </div>
      </form>
    </div>
  )
}
