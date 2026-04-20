import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatKrw, formatDate } from '@/lib/utils/format'
import type { CreditBack, Org } from '@/types/billing.types'

export default async function CreditbackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members').select('org_id, role').eq('user_id', user.id).eq('status', 'active').single()
  if (!member || !['owner', 'admin'].includes(member.role)) redirect('/home')

  const [orgRes, creditsRes] = await Promise.all([
    supabase.from('orgs').select('*').eq('id', member.org_id).single(),
    supabase.from('credit_backs').select('*').eq('org_id', member.org_id).order('month_seq'),
  ])

  const org = orgRes.data as Org | null
  const credits = (creditsRes.data ?? []) as CreditBack[]

  if (!org?.creditback_start_at) {
    return (
      <div className="max-w-3xl mx-auto card p-12 text-center">
        <p className="text-sm text-gray-500">크레딧백 프로그램이 시작되지 않았습니다.</p>
      </div>
    )
  }

  const totalCredited = credits.reduce((sum, c) => sum + c.credit_amount_krw, 0)
  const appliedMonths = credits.length
  const remainingMonths = 6 - appliedMonths
  const currentMonth = appliedMonths + 1

  // 다음 달 예상 (최근 원금 × 10%)
  const lastBase = credits[credits.length - 1]?.base_amount_krw ?? 0
  const expectedNext = remainingMonths > 0 ? Math.round(lastBase * 0.1) : 0

  const endDate = org.creditback_end_at ? new Date(org.creditback_end_at) : null
  const today = new Date()
  const daysUntilEnd = endDate ? Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null

  const isFinal = credits.some(c => c.is_final)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">크레딧백 현황</h1>
        <p className="text-sm text-gray-500 mt-1">
          최초 6개월간 월 청구액의 10%를 다음 달 청구서에서 공제해 드립니다.
        </p>
      </div>

      {/* D-30 경고 배너 */}
      {daysUntilEnd !== null && daysUntilEnd > 0 && daysUntilEnd <= 30 && !isFinal && (
        <div className="card p-5 bg-orange-50 border-orange-200">
          <p className="text-sm font-medium text-orange-900">
            ⏰ 크레딧백 프로그램 종료까지 {daysUntilEnd}일 남았습니다
          </p>
          <p className="text-sm text-orange-700 mt-1">
            이후부터는 정상 청구됩니다. Wiring AI 번들 전환 시 추가 할인 혜택이 있습니다.
          </p>
          <div className="mt-3 flex gap-3">
            <Link
              href="mailto:support@gridge.ai"
              className="text-sm text-orange-700 underline hover:text-orange-900"
            >
              AM에게 문의 →
            </Link>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-sm text-gray-500 mb-1">총 적용 금액</p>
          <p className="text-2xl font-semibold text-green-600">-{formatKrw(totalCredited)}</p>
          <p className="text-xs text-gray-400 mt-1">{appliedMonths}개월 누적</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500 mb-1">다음 달 예상</p>
          <p className="text-2xl font-semibold text-gray-900">
            {remainingMonths > 0 ? `-${formatKrw(expectedNext)}` : '-'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {remainingMonths > 0 ? `최근 월 청구의 10%` : '프로그램 종료'}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500 mb-1">진행률</p>
          <p className="text-2xl font-semibold text-brand-600">
            {appliedMonths} / 6
          </p>
          <p className="text-xs text-gray-400 mt-1">
            종료: {endDate ? formatDate(endDate.toISOString()) : '-'}
          </p>
        </div>
      </div>

      {/* 6개월 진행 바 */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">월별 진행 현황</h2>

        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map(seq => {
            const credit = credits.find(c => c.month_seq === seq)
            const isApplied = !!credit
            const isFinalMonth = credit?.is_final
            const isCurrent = seq === currentMonth
            return (
              <div
                key={seq}
                className={`flex items-center gap-4 p-4 rounded-lg border ${
                  isApplied
                    ? isFinalMonth
                      ? 'bg-purple-50 border-purple-200'
                      : 'bg-green-50 border-green-200'
                    : isCurrent
                      ? 'bg-brand-50 border-brand-200'
                      : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold text-sm ${
                  isApplied
                    ? isFinalMonth ? 'bg-purple-600 text-white' : 'bg-green-600 text-white'
                    : isCurrent ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  M{seq}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {seq}번째 달 {isFinalMonth && <span className="ml-2 text-xs text-purple-700">★ Final</span>}
                  </p>
                  {credit ? (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(credit.applied_at)} · 기준 {formatKrw(credit.base_amount_krw)}
                    </p>
                  ) : isCurrent ? (
                    <p className="text-xs text-gray-500 mt-0.5">진행 중</p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5">예정</p>
                  )}
                </div>
                <div className="text-right">
                  {credit ? (
                    <p className="text-sm font-semibold text-green-600">
                      -{formatKrw(credit.credit_amount_krw)}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">-</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {isFinal && (
          <div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <p className="text-sm font-medium text-purple-900">🎉 크레딧백 프로그램이 완료되었습니다</p>
            <p className="text-sm text-purple-700 mt-1">
              6개월간 총 <strong>{formatKrw(totalCredited)}</strong>이 공제되었습니다.
            </p>
          </div>
        )}
      </div>

      {/* 업셀 */}
      {remainingMonths <= 2 && (
        <div className="card p-6 bg-gradient-to-br from-brand-50 to-purple-50">
          <h3 className="text-base font-semibold text-gray-900">다음 단계 — AI 개발 체계 구축</h3>
          <p className="text-sm text-gray-700 mt-2">
            크레딧백 종료 전에 Wiring AI / AiOPS를 도입하면 추가 혜택이 있습니다:
          </p>
          <ul className="mt-3 space-y-1 text-sm text-gray-700">
            <li>• <strong>Wiring AI 번들</strong>: 첫 3개월 추가 할인</li>
            <li>• <strong>AiOPS</strong>: AI 사용 로그 + 성숙도 평가 무료 2개월</li>
          </ul>
          <Link
            href="mailto:support@gridge.ai?subject=Wiring AI 번들 문의"
            className="mt-4 inline-block text-sm text-brand-600 hover:underline font-medium"
          >
            AM과 상담하기 →
          </Link>
        </div>
      )}
    </div>
  )
}
