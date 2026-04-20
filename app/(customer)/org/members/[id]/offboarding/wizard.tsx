'use client'

import { useState, useMemo, useTransition } from 'react'
import { submitOffboarding } from './actions'
import { formatKrw } from '@/lib/utils/format'

type AccountAction = 'terminate' | 'transfer' | 'keep'

interface Account {
  id: string
  status: string
  monthly_limit_krw: number
  service: { name: string; vendor: string } | null
}

interface Member {
  id: string
  name: string
  email: string
  role?: string
}

type Step = 1 | 2 | 3

export function OffboardingWizard({
  targetMember,
  accounts,
  transferCandidates,
}: {
  targetMember: Member
  accounts: Account[]
  transferCandidates: Member[]
}) {
  const [step, setStep] = useState<Step>(1)
  const [decisions, setDecisions] = useState<Record<string, { action: AccountAction; transfer_to?: string }>>(() => {
    const initial: Record<string, { action: AccountAction; transfer_to?: string }> = {}
    accounts.forEach(a => { initial[a.id] = { action: 'terminate' } })
    return initial
  })
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pending, startTransition] = useTransition()

  const summary = useMemo(() => {
    let terminate = 0, transfer = 0, keep = 0, savings = 0
    for (const acc of accounts) {
      const d = decisions[acc.id]
      if (d.action === 'terminate') { terminate++; savings += acc.monthly_limit_krw }
      else if (d.action === 'transfer') transfer++
      else keep++
    }
    return { terminate, transfer, keep, savings, total: accounts.length }
  }, [decisions, accounts])

  const setAction = (accountId: string, action: AccountAction) => {
    setDecisions(prev => ({ ...prev, [accountId]: { ...prev[accountId], action } }))
  }
  const setTransferTo = (accountId: string, memberId: string) => {
    setDecisions(prev => ({ ...prev, [accountId]: { ...prev[accountId], transfer_to: memberId } }))
  }

  const canAdvance = () => {
    if (step === 2) {
      return accounts.every(a => {
        const d = decisions[a.id]
        if (d.action === 'transfer') return !!d.transfer_to
        return true
      })
    }
    if (step === 3) return confirmPwd.length > 0
    return true
  }

  const onSubmit = () => {
    const fd = new FormData()
    fd.set('target_member_id', targetMember.id)
    fd.set('decisions', JSON.stringify(decisions))
    fd.set('confirm_password', confirmPwd)
    startTransition(() => { submitOffboarding(fd) })
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center">
        {([1, 2, 3] as Step[]).map(s => (
          <div key={s} className="flex items-center flex-1">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
              s < step ? 'bg-brand-600 text-white'
                : s === step ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                : 'bg-gray-200 text-gray-500'
            }`}>
              {s < step ? '✓' : s}
            </div>
            {s < 3 && <div className={`flex-1 h-px mx-2 ${s < step ? 'bg-brand-600' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      <div className="card p-8">
        {/* Step 1: 영향 미리보기 */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Step 1. 영향 미리보기</h2>
            <div className="p-4 bg-gray-50 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">활성 계정 수</span>
                <span className="font-semibold">{accounts.length}개</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">월 한도 합계</span>
                <span className="font-mono">
                  {formatKrw(accounts.reduce((sum, a) => sum + a.monthly_limit_krw, 0))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">예상 월 절감 (전부 해지 시)</span>
                <span className="font-semibold text-green-600 font-mono">
                  {formatKrw(accounts.reduce((sum, a) => sum + a.monthly_limit_krw, 0))}
                </span>
              </div>
            </div>

            {accounts.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">활성 계정이 없습니다. 바로 오프보딩할 수 있습니다.</p>
            ) : (
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">계정 목록</h3>
                <ul className="divide-y divide-gray-100 border rounded-lg">
                  {accounts.map(a => (
                    <li key={a.id} className="flex justify-between px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium">{a.service?.name ?? '-'}</p>
                        <p className="text-xs text-gray-400">{a.service?.vendor}</p>
                      </div>
                      <span className="font-mono text-gray-600">{formatKrw(a.monthly_limit_krw)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-gray-500">
              이 멤버의 결제 원장은 법정 보존 3년간 그대로 유지됩니다. 개인정보는 해지 30일 후 파기됩니다.
            </p>
          </div>
        )}

        {/* Step 2: 계정별 액션 */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Step 2. 계정별 처리 방식</h2>

            {accounts.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">처리할 계정이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {accounts.map(a => {
                  const d = decisions[a.id]
                  return (
                    <div key={a.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-medium text-gray-900">{a.service?.name}</p>
                          <p className="text-xs text-gray-400">{a.service?.vendor} · {formatKrw(a.monthly_limit_krw)}</p>
                        </div>
                      </div>

                      <div className="flex gap-2 mb-2">
                        {(['terminate', 'transfer', 'keep'] as AccountAction[]).map(act => (
                          <button
                            key={act}
                            onClick={() => setAction(a.id, act)}
                            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                              d.action === act
                                ? act === 'terminate'
                                  ? 'bg-red-50 border-red-300 text-red-700'
                                  : act === 'transfer'
                                    ? 'bg-brand-50 border-brand-300 text-brand-700'
                                    : 'bg-gray-100 border-gray-300 text-gray-700'
                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {act === 'terminate' ? '즉시 해지' : act === 'transfer' ? '다른 멤버에게 이관' : '유지'}
                          </button>
                        ))}
                      </div>

                      {d.action === 'transfer' && (
                        <select
                          value={d.transfer_to ?? ''}
                          onChange={e => setTransferTo(a.id, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-1"
                        >
                          <option value="">-- 이관받을 멤버 선택 --</option>
                          {transferCandidates.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.email}) — {m.role}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* 요약 */}
            <div className="p-3 bg-gray-50 rounded text-xs text-gray-600 flex gap-4">
              <span>해지 {summary.terminate}</span>
              <span>이관 {summary.transfer}</span>
              <span>유지 {summary.keep}</span>
              <span className="ml-auto">예상 절감 {formatKrw(summary.savings)}</span>
            </div>
          </div>
        )}

        {/* Step 3: 확인 */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Step 3. 최종 확인</h2>

            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg space-y-2 text-sm">
              <p className="font-medium text-orange-900">
                다음 작업이 수행됩니다:
              </p>
              <ul className="ml-4 list-disc space-y-1 text-orange-800">
                <li><strong>{targetMember.name}</strong>을(를) 오프보딩 처리</li>
                <li>계정 {summary.terminate}개 해지 (7일 유예 후 VCN 폐기)</li>
                <li>계정 {summary.transfer}개 다른 멤버에게 이관</li>
                <li>계정 {summary.keep}개 유지</li>
                <li>월 <strong>{formatKrw(summary.savings)}</strong> 절감 예상</li>
              </ul>
              <p className="text-xs text-orange-700 mt-2">
                결제 원장은 법정 보존 3년간 그대로 유지됩니다.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                본인 비밀번호 재확인
              </label>
              <input
                type="password"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                autoComplete="current-password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="보안을 위해 본인 비밀번호를 입력하세요"
              />
              <p className="text-xs text-gray-500 mt-1">
                제출 후에는 되돌릴 수 없습니다 (오프보딩은 원자적 트랜잭션).
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-8 mt-8 border-t border-gray-100">
          <button
            onClick={() => setStep(s => (s > 1 ? (s - 1) as Step : s))}
            disabled={step === 1 || pending}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:text-gray-300"
          >
            ← 이전
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(s => (s < 3 ? (s + 1) as Step : s))}
              disabled={!canAdvance() || pending}
              className="bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white text-sm font-medium px-6 py-2 rounded-lg"
            >
              다음 →
            </button>
          ) : (
            <button
              onClick={onSubmit}
              disabled={pending || !canAdvance()}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-sm font-medium px-6 py-2 rounded-lg"
            >
              {pending ? '처리 중...' : '오프보딩 확정'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
