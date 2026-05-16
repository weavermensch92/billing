import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { NewOrgWizard } from './wizard'

/**
 * v2.0 신규 Org 생성 — wizard 5-step 통합
 *
 * Step 1: 조직 기본 정보
 * Step 2: 계약 조건 (신용 한도·예치금·월 고정비·기간)
 * Step 3: v2 빌링 정책 (4개 — default_discount_rate / billing_day_of_month
 *                                / wallet_default_validity_months / self_approval_headroom_krw)
 * Step 4: 첫 Owner 초대
 * Step 5: 최종 확인
 *
 * wizard 통합 이전: page에 별도 v2 정책 form 섹션 존재 (모형, 저장 안됨)
 * 통합 이후: wizard.tsx 단일 진입, actions.createOrg에서 v2 컬럼 일괄 INSERT
 */
export default async function NewOrgPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('email', user.email ?? '')
    .eq('is_active', true)
    .maybeSingle()
  if (!adminUser) redirect('/console/login')

  if (adminUser.role !== 'super') {
    // 사용자가 클릭하고 온 컨텍스트(orgs 목록)로 되돌리고 사유를 명시. 액션의 동일 게이트와 일치시킴.
    redirect('/console/orgs?error=' + encodeURIComponent(`Org 생성 권한 없음 — Super 전용 (현재 역할: ${adminUser.role})`))
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <Link href="/console/orgs" className="text-xs text-gray-500 hover:underline">
          ← Org 목록
        </Link>
        <h1 className="text-2xl font-semibold mt-2">신규 Org 생성</h1>
        <div className="text-xs text-gray-500 mt-1">
          5-step 마법사. v2 빌링 정책(할인율·결제일·잔액 만료·헤드룸)은 Step 3 에서 입력합니다.
        </div>
      </div>

      {searchParams.error && (
        <div className="border-l-[3px] border-l-red-500 pl-3 py-2 text-sm text-red-700 bg-red-50">
          {decodeURIComponent(searchParams.error)}
        </div>
      )}
      {searchParams.ok && (
        <div className="border-l-[3px] border-l-green-500 pl-3 py-2 text-sm text-green-700 bg-green-50">
          Org 생성 완료
        </div>
      )}

      <NewOrgWizard />
    </div>
  )
}
