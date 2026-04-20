'use client'

import { useState, useTransition } from 'react'
import { formatKrw } from '@/lib/utils/format'
import { createOrg } from './actions'

type Step = 1 | 2 | 3 | 4

interface State {
  // Step 1
  name: string
  business_reg_no: string
  // Step 2
  tier: 'monthly' | 'weekly' | 'prepaid_monthly'
  credit_limit_krw: number
  deposit_krw: number
  creditback_start_at: string  // YYYY-MM-DD
  monthly_fee_krw: number
  contract_start_at: string
  contract_end_at: string
  // Step 3
  owner_email: string
  owner_name: string
}

const STEP_LABELS: Record<Step, string> = {
  1: '조직 기본 정보',
  2: '계약 조건',
  3: '첫 Owner 초대',
  4: '최종 확인',
}

const TIER_LABEL: Record<State['tier'], { label: string; desc: string }> = {
  monthly:         { label: '월간 (기본)',           desc: '월말 거래 합산 → 다음 달 초 청구 + 세금계산서' },
  weekly:          { label: '주간 중간내역 + 월세계서', desc: '주간 내역서 발송 / 월 1회 세금계산서' },
  prepaid_monthly: { label: '월 선불 예치금',          desc: '선불 예치금 차감 방식, 잔액 경고' },
}

export function NewOrgWizard() {
  const today = new Date().toISOString().slice(0, 10)
  const oneYearLater = new Date()
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1)

  const [step, setStep] = useState<Step>(1)
  const [state, setState] = useState<State>({
    name: '',
    business_reg_no: '',
    tier: 'monthly',
    credit_limit_krw: 5_000_000,
    deposit_krw: 0,
    creditback_start_at: today,
    monthly_fee_krw: 0,
    contract_start_at: today,
    contract_end_at: oneYearLater.toISOString().slice(0, 10),
    owner_email: '',
    owner_name: '',
  })
  const [pending, startTransition] = useTransition()

  const update = <K extends keyof State>(k: K, v: State[K]) =>
    setState(prev => ({ ...prev, [k]: v }))

  // 사업자번호 형식 검증 (XXX-XX-XXXXX)
  const isValidBrn = /^\d{3}-\d{2}-\d{5}$/.test(state.business_reg_no.trim())
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.owner_email.trim())

  const canAdvance = (): boolean => {
    if (step === 1) return state.name.trim().length >= 2 && isValidBrn
    if (step === 2) return state.credit_limit_krw > 0 && state.contract_start_at.length === 10
    if (step === 3) return isValidEmail && state.owner_name.trim().length >= 1
    return true
  }

  const onSubmit = () => {
    const fd = new FormData()
    for (const [k, v] of Object.entries(state)) fd.set(k, String(v))
    startTransition(() => { createOrg(fd) })
  }

  const next = () => setStep(s => (s < 4 ? (s + 1) as Step : s))
  const prev = () => setStep(s => (s > 1 ? (s - 1) as Step : s))

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center">
        {([1, 2, 3, 4] as Step[]).map(s => (
          <div key={s} className="flex items-center flex-1">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
              s < step ? 'bg-brand-600 text-white'
                : s === step ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                : 'bg-gray-200 text-gray-500'
            }`}>
              {s < step ? '✓' : s}
            </div>
            {s < 4 && <div className={`flex-1 h-px mx-2 ${s < step ? 'bg-brand-600' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>
      <div className="text-center text-sm text-gray-500">
        Step {step} / 4 — {STEP_LABELS[step]}
      </div>

      <div className="card p-8">
        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">조직 기본 정보</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">조직명</label>
              <input
                type="text"
                value={state.name}
                onChange={e => update('name', e.target.value)}
                placeholder="예: Acme Corp"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                사업자등록번호 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={state.business_reg_no}
                onChange={e => update('business_reg_no', e.target.value)}
                placeholder="123-45-67890"
                pattern="\d{3}-\d{2}-\d{5}"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                required
              />
              {state.business_reg_no && !isValidBrn && (
                <p className="mt-1 text-xs text-red-600">형식: XXX-XX-XXXXX (숫자만)</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                사업자등록번호는 등록 후 변경할 수 없습니다 (DB 트리거 강제).
              </p>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">계약 조건</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">결제 티어</label>
              <div className="space-y-2">
                {(['monthly', 'weekly', 'prepaid_monthly'] as const).map(t => (
                  <label key={t} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer ${
                    state.tier === t ? 'border-brand-600 bg-brand-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="tier"
                      checked={state.tier === t}
                      onChange={() => update('tier', t)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{TIER_LABEL[t].label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{TIER_LABEL[t].desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">신용 한도 (KRW)</label>
                <input
                  type="number"
                  min={1_000_000}
                  step={1_000_000}
                  value={state.credit_limit_krw}
                  onChange={e => update('credit_limit_krw', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
                <p className="mt-1 text-xs text-gray-500">{formatKrw(state.credit_limit_krw)}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  예치금 {state.tier === 'prepaid_monthly' && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="number"
                  min={0}
                  step={1_000_000}
                  value={state.deposit_krw}
                  onChange={e => update('deposit_krw', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
                <p className="mt-1 text-xs text-gray-500">{formatKrw(state.deposit_krw)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">계약 시작일</label>
                <input
                  type="date"
                  value={state.contract_start_at}
                  onChange={e => update('contract_start_at', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">계약 종료일</label>
                <input
                  type="date"
                  value={state.contract_end_at}
                  onChange={e => update('contract_end_at', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">크레딧백 시작일</label>
              <input
                type="date"
                value={state.creditback_start_at}
                onChange={e => update('creditback_start_at', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                PB-004 크레딧백 프로그램 — 6개월간 월 청구액의 10% 공제.
                M6는 자동으로 is_final 플래그 적용.
              </p>
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">첫 Owner 초대</h2>
            <p className="text-sm text-gray-500">
              Owner는 조직당 1명만 존재할 수 있으며, 이후 포털에서 양도 가능합니다.
              입력한 이메일로 Supabase Auth 초대 링크가 발송됩니다.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Owner 이메일</label>
              <input
                type="email"
                value={state.owner_email}
                onChange={e => update('owner_email', e.target.value)}
                placeholder="owner@company.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
              {state.owner_email && !isValidEmail && (
                <p className="mt-1 text-xs text-red-600">유효한 이메일 형식이 아닙니다.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Owner 이름</label>
              <input
                type="text"
                value={state.owner_name}
                onChange={e => update('owner_name', e.target.value)}
                placeholder="홍길동"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
                maxLength={50}
              />
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-900 mb-1">Owner 권한 범위</p>
              <ul className="text-xs text-blue-700 space-y-0.5 list-disc list-inside">
                <li>조직 설정·예산 승인·해지 결정</li>
                <li>멤버 초대·역할 변경 (Admin / Member)</li>
                <li>데이터 내보내기 (전체 ZIP, 주 1회)</li>
                <li>오프보딩 처리·Owner 양도</li>
              </ul>
            </div>
          </div>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">최종 확인</h2>

            <div className="space-y-4">
              <div className="card p-4 bg-gray-50">
                <p className="text-xs text-gray-500 uppercase mb-2">조직 기본 정보</p>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-500">조직명</dt><dd className="font-medium">{state.name}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">사업자번호</dt><dd className="font-mono">{state.business_reg_no}</dd></div>
                </dl>
              </div>

              <div className="card p-4 bg-gray-50">
                <p className="text-xs text-gray-500 uppercase mb-2">계약 조건</p>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-500">티어</dt><dd>{TIER_LABEL[state.tier].label}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">신용 한도</dt><dd className="font-mono">{formatKrw(state.credit_limit_krw)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">예치금</dt><dd className="font-mono">{formatKrw(state.deposit_krw)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">계약 기간</dt><dd>{state.contract_start_at} ~ {state.contract_end_at}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">크레딧백 시작</dt><dd>{state.creditback_start_at} (6개월)</dd></div>
                </dl>
              </div>

              <div className="card p-4 bg-gray-50">
                <p className="text-xs text-gray-500 uppercase mb-2">Owner</p>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-500">이름</dt><dd className="font-medium">{state.owner_name}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">이메일</dt><dd>{state.owner_email}</dd></div>
                </dl>
              </div>
            </div>

            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-sm font-medium text-orange-900">다음 작업이 수행됩니다</p>
              <ol className="mt-2 text-sm text-orange-800 list-decimal list-inside space-y-0.5">
                <li>orgs 테이블에 신규 레코드 생성 (business_reg_no immutable)</li>
                <li>org_contracts 레코드 생성 (크레딧백 6개월 기간 자동 계산)</li>
                <li>Owner 멤버 초대 (status=invited)</li>
                <li>감사 로그 3건 기록 (actor=super, visibility=both)</li>
                <li>Phase 0: 초대 이메일은 Luna가 수동 발송</li>
              </ol>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-8 mt-8 border-t border-gray-100">
          <button
            onClick={prev}
            disabled={step === 1 || pending}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:text-gray-300"
          >
            ← 이전
          </button>
          {step < 4 ? (
            <button
              onClick={next}
              disabled={!canAdvance() || pending}
              className="bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white text-sm font-medium px-6 py-2 rounded-lg"
            >
              다음 →
            </button>
          ) : (
            <button
              onClick={onSubmit}
              disabled={pending}
              className="bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white text-sm font-medium px-6 py-2 rounded-lg"
            >
              {pending ? '생성 중...' : '조직 생성'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
