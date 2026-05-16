import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { inviteOrgMember } from '../actions'

export default async function OrgInviteMemberPage({
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
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!me) redirect('/console/login')
  if (me.role !== 'super') {
    redirect(`/console/orgs/${params.id}?tab=members&error=` + encodeURIComponent('Super 권한 필요'))
  }

  const { data: org } = await supabase
    .from('orgs')
    .select('id, name')
    .eq('id', params.id)
    .maybeSingle()

  if (!org) {
    redirect('/console/orgs?error=' + encodeURIComponent('Org 를 찾을 수 없습니다.'))
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Link
          href={`/console/orgs/${params.id}?tab=members`}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          ← {org.name} 멤버 목록으로
        </Link>
        <h1 className="text-2xl font-semibold mt-2">멤버 초대</h1>
        <p className="text-sm text-gray-500 mt-1">
          {org.name} 에 새 멤버를 초대합니다. 입력한 이메일로 초대 메일이 발송되며,
          수신자가 비밀번호 설정을 마치면 자동으로 활성화됩니다.
        </p>
      </div>

      {searchParams.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchParams.error}
        </div>
      )}

      <form action={inviteOrgMember} className="card p-6 space-y-4">
        <input type="hidden" name="org_id" value={params.id} />

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            이메일 <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="off"
            required
            placeholder="member@company.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
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
            placeholder="홍길동"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
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
            defaultValue="member"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          >
            <option value="owner">Owner — 조직 전체 권한 (조직당 1명)</option>
            <option value="admin">Admin — 멤버 초대 / 요청 제출</option>
            <option value="member">Member — 본인 계정만 조회</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Owner 가 이미 있으면 Admin 으로 초대 후 권한 이양 권장.
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            초대 메일 발송
          </button>
          <Link
            href={`/console/orgs/${params.id}?tab=members`}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}
