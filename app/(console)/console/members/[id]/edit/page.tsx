import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { updateMember } from '../../actions'

export default async function ConsoleMemberEditPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { error?: string }
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
    redirect('/console/home?error=' + encodeURIComponent('Super 전용'))
  }

  const { data: memberRaw } = await supabase
    .from('members')
    .select('id, org_id, name, email, role, status, user_id, invited_at, deleted_at, org:orgs!org_id(name)')
    .eq('id', params.id)
    .maybeSingle()

  const member = memberRaw as unknown as {
    id: string
    org_id: string
    name: string
    email: string
    role: 'owner' | 'admin' | 'member'
    status: string
    user_id: string | null
    invited_at: string | null
    deleted_at: string | null
    org: { name: string } | null
  } | null

  if (!member) {
    redirect('/console/members?error=' + encodeURIComponent('멤버를 찾을 수 없습니다.'))
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Link href="/console/members" className="text-xs text-gray-500 hover:text-gray-700">
          ← 전체 멤버
        </Link>
        <h1 className="text-2xl font-semibold mt-2">멤버 수정</h1>
        <p className="text-sm text-gray-500 mt-1">
          {member.org?.name ?? member.org_id} · {member.email}
        </p>
      </div>

      {member.deleted_at && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          이 멤버는 <strong>삭제함</strong> 에 있습니다. 수정하려면 먼저 <Link href="/console/members/trash" className="underline">삭제함</Link> 에서 복구하세요.
        </div>
      )}

      {searchParams.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      <form action={updateMember} className="card p-6 space-y-4">
        <input type="hidden" name="member_id" value={member.id} />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input
            type="text"
            value={member.email}
            readOnly
            disabled
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 font-mono"
          />
          <p className="text-xs text-gray-500 mt-1">이메일은 변경 불가 (인증 식별자). 다른 이메일이면 새로 초대하세요.</p>
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            이름 <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={50}
            defaultValue={member.name}
            disabled={!!member.deleted_at}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50"
          />
        </div>

        <div>
          <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
            역할 <span className="text-red-500">*</span>
          </label>
          <select
            id="role"
            name="role"
            required
            defaultValue={member.role}
            disabled={!!member.deleted_at}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50"
          >
            <option value="owner">Owner — 조직 전체 권한 (조직당 1명)</option>
            <option value="admin">Admin — 멤버 초대 / 요청 제출</option>
            <option value="member">Member — 본인 계정만 조회</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-gray-500 border-t border-gray-100 pt-3">
          <div>
            <div className="font-medium text-gray-700">상태</div>
            <div className="mt-0.5">{member.status}</div>
          </div>
          <div>
            <div className="font-medium text-gray-700">Auth 연결</div>
            <div className="mt-0.5">{member.user_id ? '연결됨' : '미연결 (초대 수락 전)'}</div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={!!member.deleted_at}
            className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            저장
          </button>
          <Link
            href="/console/members"
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}
