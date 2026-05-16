'use client'

import { useState, useTransition } from 'react'
import { formatKrw } from '@/lib/utils/format'
import { createOrg } from './actions'

type Step = 1 | 2 | 3 | 4 | 5

interface State {
  // Step 1 — 조직 기본
  name: string
  business_reg_no: string
  // Step 2 — 계약 조건
  credit_limit_krw: number
  deposit_krw: number
  monthly_fee_krw: number
  contract_start_at: string
  contract_end_at: string
  // Step 3 — v2 빌링 정책 (신설)
  default_discount_rate: number          // 0.0 ~ 1.0 (예: 0.10 = 10% 할인)
  billing_day_of_month: number           // 1 ~ 28
  wallet_default_validity_months: number // 1 ~ 60
  self_approval_headroom_krw: number     // 0 ~ 1_000_000_000
  // Step 4 — 첫 Owner
  owner_email: string
  owner_name: string
}

const STEP_LABELS: Record<Step, string> = {
  1: '조직 기본 정보',
  2: '계약 조건',
  3: 'v2 빌링 정책',
  4: '첫 Owner 초대',
  5: '최종 확인',
}

export function NewOrgWizard() {
  const today = new Date().toISOString().slice(0, 10)
  const oneYearLater = new Date()
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1)

  const [step, setStep] = useState<Step>(1)
  const [state, setState] = useState<State>({
    name: '',
    business_reg_no: '',
    credit_limit_krw: 5_000_000,
    deposit_krw: 0,
    monthly_fee_krw: 0,
    contract_start_at: today,
    contract_end_at: oneYearLater.toISOString().slice(0, 10),
    default_discount_rate: 0.10,
    billing_day_of_month: 1,
    wallet_default_validity_months: 12,
    self_approval_headroom_krw: 5_000_000,
    owner_email: '',
    owner_name: '',
  })
  const [pending, startTransition] = useTransition()

  const update = <K extends keyof State>(k: K, v: State[K]) =>
    setState(prev => ({ ...prev, [k]: v }))

  const isValidBrn = /^\d{3}-\d{2}-\d{5}$/.test(state.business_reg_no.trim())
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.owner_email.trim())

  const canAdvance = (): boolean => {
    if (step === 1) return state.name.trim().length >= 2 && isValidBrn
    if (step === 2) return state.credit_limit_krw > 0 && state.contract_start_at.length === 10
    if (step === 3)
      return (
        state.default_discount_rate >= 0 &&
        state.default_discount_rate <= 1 &&
        state.billing_day_of_month >= 1 &&
        state.billing_day_of_month <= 28 &&
        state.wallet_default_validity_months >= 1 &&
        state.wallet_default_validity_months <= 60 &&
        state.self_approval_headroom_krw >= 0
      )
    if (step === 4) return isValidEmail && state.owner_name.trim().length >= 1
    return true
  }

  const onSubmit = () => {
    const fd = new FormData()
    for (const [k, v] of Object.entries(state)) fd.set(k, String(v))
    startTransition(() => { createOrg(fd) })
  }

  const next = () => setStep(s => (s < 5 ? (s + 1) as Step : s))
  const prev = () => setStep(s => (s > 1 ? (s - 1) as Step : s))

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center">
        {([1, 2, 3, 4, 5] as Step[]).map(s => (
          <div key={s} className="flex items-center flex-1">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
              s < step ? 'bg-brand-600 text-white'
                : s === step ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                : 'bg-gray-200 text-gray-500'
            }`}>
              {s < step ? '✓' : s}
            </div>
            {s < 5 && <div className={`flex-1 h-px mx-2 ${s < step ? 'bg-brand-600' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>
      <p className="text-center text-sm text-gray-500">{STEP_LABELS[step]}</p>

      <div className="card p-6 bg-white">
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
                placeholder="㈜그릿지"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">사업자등록번호</label>
              <input
                type="text"
                value={state.business_reg_no}
                onChange={e => update('business_reg_no', e.target.value)}
                placeholder="123-45-67890"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
              {state.business_reg_no && !isValidBrn && (
                <p className="mt-1 text-xs text-red-600">형식: XXX-XX-XXXXX</p>
              )}
            </div>
          </div>
        )}

        {/* Step 2 — 계약 조건 (v1 호환 + v2 단일 모델) */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">계약 조건</h2>

            <div className="p-3 bg-gray-50 border-l-[3px] border-l-gray-300 text-xs text-gray-600">
              v2.0 결제 모델은 <span className="font-medium">충전 선금제 (prepaid_v2)</span> 단일.
              세부 정책은 다음 step 에서 입력합니다.
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
                <p className="mt-1 text-xs text-gray-500">{formatKrw(state.credit_limit_krw)} · 벤더 측 카드/계정 한도 상한</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">예치금 (선택)</label>
                <input
                  type="number"
                  min={0}
                  step={1_000_000}
                  value={state.deposit_krw}
                  onChange={e => update('deposit_krw', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
                <p className="mt-1 text-xs text-gray-500">{formatKrw(state.deposit_krw)} · 보증금성 예치 (선택 항목)</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">월 고정비 (선택)</label>
              <input
                type="number"
                min={0}
                step={100_000}
                value={state.monthly_fee_krw}
                onChange={e => update('monthly_fee_krw', Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
              <p className="mt-1 text-xs text-gray-500">{formatKrw(state.monthly_fee_krw)} · MSP 운영 고정비 (없으면 0)</p>
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
          </div>
        )}

        {/* Step 3 — v2 빌링 정책 (신설) */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">v2 빌링 정책</h2>
            <p className="text-sm text-gray-500">
              충전 선금·할인·결제일·잔액 만료·자율승인 한도. 운영 중 변경 가능합니다.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  기본 할인율
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  value={state.default_discount_rate}
                  onChange={e => update('default_discount_rate', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
                <p className="mt-1 text-xs text-gray-500">
                  0.10 = 10% · 가입 후 6개월 한정 적용 (첫 active 계정 생성 시 자동 시작)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  결제일 (1~28)
                </label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={state.billing_day_of_month}
                  onChange={e => update('billing_day_of_month', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
                <p className="mt-1 text-xs text-gray-500">
                  매월 헤드룸 리셋·세금계산서 발행 기준일
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  잔액 유효기간 (개월)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={state.wallet_default_validity_months}
                  onChange={e => update('wallet_default_validity_months', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
                <p className="mt-1 text-xs text-gray-500">
                  충전 잔액 미사용 시 자동 만료까지의 개월 수 (기본 12)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Org headroom (KRW)
                </label>
                <input
                  type="number"
                  min={0}
                  step={500_000}
                  value={state.self_approval_headroom_krw}
                  onChange={e => update('self_approval_headroom_krw', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {formatKrw(state.self_approval_headroom_krw)} · 자율승인 가능 월 한도 (팀별 분배의 상한)
                </p>
              </div>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 space-y-1">
              <div className="font-medium">v2 정책 요약</div>
              <div>· 첫 계정 active 시 6개월 할인 정책 자동 시작 (M-1002 트리거)</div>
              <div>· 결제일에 self_approval_used + team_headroom_used 자동 리셋</div>
              <div>· 잔액은 충전 환율로 고정 (환차는 그릿지 흡수)</div>
              <div>· 팀 헤드룸 합계 ≤ Org headroom (BEFORE 트리거 검증)</div>
            </div>
          </div>
        )}

        {/* Step 4 — Owner 초대 */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">첫 Owner 초대</h2>
            <p className="text-sm text-gray-500">
              Owner는 조직당 1명만 존재. 이후 포털에서 양도 가능합니다.
              입력한 이메일로 Supabase Auth 초대 링크 발송.
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

        {/* Step 5 — 최종 확인 */}
        {step === 5 && (
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
                  <div className="flex justify-between"><dt className="text-gray-500">결제 모델</dt><dd>충전 선금제 (prepaid_v2)</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">신용 한도</dt><dd className="font-mono">{formatKrw(state.credit_limit_krw)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">예치금</dt><dd className="font-mono">{formatKrw(state.deposit_krw)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">월 고정비</dt><dd className="font-mono">{formatKrw(state.monthly_fee_krw)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">계약 기간</dt><dd>{state.contract_start_at} ~ {state.contract_end_at}</dd></div>
                </dl>
              </div>

              <div className="card p-4 bg-gray-50">
                <p className="text-xs text-gray-500 uppercase mb-2">v2 빌링 정책</p>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">기본 할인율</dt>
                    <dd className="font-mono">{(state.default_discount_rate * 100).toFixed(0)}% (6개월 한정)</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">결제일</dt>
                    <dd className="font-mono">매월 {state.billing_day_of_month}일</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">잔액 유효기간</dt>
                    <dd className="font-mono">{state.wallet_default_validity_months}개월</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Org headroom</dt>
                    <dd className="font-mono">{formatKrw(state.self_approval_headroom_krw)}</dd>
                  </div>
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
                <li>orgs 테이블에 신규 레코드 생성 (plan='prepaid_v2', v2 정책 컬럼 4개 포함)</li>
                <li>org_contracts 레코드 생성 (계약 조건만, creditback 컬럼은 v2에서 폐기됨)</li>
                <li>미할당 팀 자동 생성 (M-1005 트리거)</li>
                <li>Owner 멤버 초대 (status=invited)</li>
                <li>감사 로그 2건 기록 (actor=super)</li>
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
          {step < 5 ? (
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
