'use client'

import { useState, useMemo, useTransition } from 'react'
import { createRequest } from './actions'
import { ACTION_TYPE_LABELS } from '@/types/request.types'
import { formatKrw } from '@/lib/utils/format'
import type { ActionType } from '@/types/billing.types'
import type { WizardAccount } from '@/types/request.types'

interface WizardProps {
  initialType?: ActionType
  initialAccountId?: string
  services: { id: string; name: string; vendor: string; category: string; tos_review_status: string; unit_price_krw: number | null }[]
  members: { id: string; name: string; email: string; role: string }[]
  accounts: WizardAccount[]
  currentMemberRole: 'owner' | 'admin' | 'member'
}

type Step = 1 | 2 | 3 | 4 | 5

const STEP_LABELS: Record<Step, string> = {
  1: '유형 선택',
  2: '세부 정보',
  3: '한도·옵션',
  4: 'AM 메시지',
  5: '확인',
}

const ACTION_TYPES_AVAILABLE: ActionType[] = [
  'new_account', 'limit_change', 'terminate', 'vcn_replace', 'decline_response',
]

export function RequestWizard({
  initialType, initialAccountId, services, members, accounts, currentMemberRole,
}: WizardProps) {
  const [step, setStep] = useState<Step>(initialType ? 2 : 1)
  const [actionType, setActionType] = useState<ActionType | null>(initialType ?? null)
  const [accountId, setAccountId] = useState<string | undefined>(initialAccountId)
  const [serviceId, setServiceId] = useState<string>()
  const [targetMemberId, setTargetMemberId] = useState<string>()
  const [monthlyLimit, setMonthlyLimit] = useState<number>(500000)
  const [allowOverseas, setAllowOverseas] = useState(true)
  const [purpose, setPurpose] = useState('')
  const [newLimit, setNewLimit] = useState<number>(0)
  const [terminateMode, setTerminateMode] = useState<'immediate' | 'end_of_billing_cycle'>('end_of_billing_cycle')
  const [reason, setReason] = useState('')
  const [declineContext, setDeclineContext] = useState('')
  const [amMessage, setAmMessage] = useState('')
  const [pending, startTransition] = useTransition()

  const canRequestForOthers = currentMemberRole === 'owner' || currentMemberRole === 'admin'

  const selectedAccount = useMemo(
    () => accounts.find(a => a.id === accountId),
    [accountId, accounts],
  )
  const selectedService = useMemo(
    () => services.find(s => s.id === serviceId),
    [serviceId, services],
  )

  const canAdvance = () => {
    if (step === 1) return actionType !== null
    if (step === 2) {
      if (actionType === 'new_account') return !!serviceId && !!targetMemberId
      if (actionType === 'limit_change') return !!accountId
      if (actionType === 'terminate') return !!accountId
      if (actionType === 'vcn_replace') return !!accountId && reason.length > 0
      if (actionType === 'decline_response') return !!accountId && declineContext.length > 0
      return false
    }
    if (step === 3) {
      if (actionType === 'new_account') return monthlyLimit > 0 && purpose.length > 0
      if (actionType === 'limit_change') return newLimit > 0
      return true
    }
    return true
  }

  const onSubmit = () => {
    if (!actionType) return
    const fd = new FormData()
    fd.set('action_type', actionType)
    if (amMessage) fd.set('am_message', amMessage)

    if (actionType === 'new_account') {
      fd.set('service_id', serviceId!)
      fd.set('target_member_id', targetMemberId!)
      fd.set('monthly_limit_krw', String(monthlyLimit))
      if (allowOverseas) fd.set('allow_overseas', 'on')
      fd.set('purpose', purpose)
    } else if (actionType === 'limit_change') {
      fd.set('account_id', accountId!)
      fd.set('new_limit_krw', String(newLimit))
    } else if (actionType === 'terminate') {
      fd.set('account_id', accountId!)
      fd.set('terminate_mode', terminateMode)
    } else if (actionType === 'vcn_replace') {
      fd.set('account_id', accountId!)
      fd.set('reason', reason)
    } else if (actionType === 'decline_response') {
      fd.set('account_id', accountId!)
      fd.set('decline_context', declineContext)
    }

    startTransition(() => { createRequest(fd) })
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center justify-between">
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
      <div className="text-center text-sm text-gray-500">
        Step {step} / 5 — {STEP_LABELS[step]}
      </div>

      <div className="card p-8">
        {/* Step 1: 유형 선택 */}
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">어떤 요청을 하시나요?</h2>
            {ACTION_TYPES_AVAILABLE.map(type => {
              const info = ACTION_TYPE_LABELS[type]
              return (
                <button
                  key={type}
                  onClick={() => setActionType(type)}
                  className={`w-full p-4 border rounded-lg text-left transition-colors ${
                    actionType === type
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{info.icon}</span>
                    <div>
                      <p className="font-medium text-gray-900">{info.label}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{info.description}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Step 2: 세부 정보 (유형별) */}
        {step === 2 && actionType === 'new_account' && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">신규 계정 정보</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">서비스 선택</label>
              <select
                value={serviceId ?? ''}
                onChange={e => setServiceId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">-- 선택 --</option>
                {services.map(svc => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name} ({svc.vendor}) {svc.tos_review_status === 'conditional' && '⚠'}
                  </option>
                ))}
              </select>
              {selectedService?.tos_review_status === 'conditional' && (
                <p className="mt-2 text-xs text-orange-600">
                  ⚠ 조건부 승인 서비스입니다. AM이 추가 검토 후 진행합니다.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">사용자</label>
              <select
                value={targetMemberId ?? ''}
                onChange={e => setTargetMemberId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                disabled={!canRequestForOthers}
              >
                <option value="">-- 선택 --</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email}) — {m.role}
                  </option>
                ))}
              </select>
              {!canRequestForOthers && (
                <p className="mt-1 text-xs text-gray-500">본인 계정만 요청할 수 있습니다.</p>
              )}
            </div>
          </div>
        )}

        {step === 2 && (actionType === 'limit_change' || actionType === 'terminate' || actionType === 'vcn_replace' || actionType === 'decline_response') && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">대상 계정 선택</h2>
            <select
              value={accountId ?? ''}
              onChange={e => setAccountId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">-- 선택 --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.service?.name} — {a.member?.name} ({formatKrw(a.monthly_limit_krw)})
                </option>
              ))}
            </select>

            {actionType === 'vcn_replace' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">교체 사유</label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={3}
                  placeholder="예: 카드 분실, 보안 우려, 카드사 만료 등"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            )}
            {actionType === 'decline_response' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  상황 설명 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={declineContext}
                  onChange={e => setDeclineContext(e.target.value)}
                  rows={4}
                  placeholder="어떤 서비스에서 언제 결제가 거절되었는지 알려주세요."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            )}
          </div>
        )}

        {/* Step 3: 한도·옵션 */}
        {step === 3 && actionType === 'new_account' && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">한도 · 옵션</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">월 한도 (KRW)</label>
              <input
                type="number"
                value={monthlyLimit}
                min={100000}
                step={100000}
                onChange={e => setMonthlyLimit(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
              <p className="mt-1 text-xs text-gray-500">현재 입력: {formatKrw(monthlyLimit)}</p>
            </div>
            <div>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowOverseas}
                  onChange={e => setAllowOverseas(e.target.checked)}
                />
                <span className="text-sm text-gray-700">해외결제 허용</span>
              </label>
              <p className="mt-1 ml-6 text-xs text-gray-500">
                대부분의 AI 서비스는 해외결제이므로 기본 허용을 권장합니다.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                사용 목적 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={purpose}
                onChange={e => setPurpose(e.target.value)}
                rows={3}
                placeholder="예: 백엔드 개발자 Claude Team, API 호출 월 ~$30 예상"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
        )}

        {step === 3 && actionType === 'limit_change' && selectedAccount && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">새 한도</h2>
            <div className="p-4 bg-gray-50 rounded-lg text-sm">
              <p className="text-gray-500">현재 한도</p>
              <p className="font-semibold font-mono text-gray-900">
                {formatKrw(selectedAccount.monthly_limit_krw)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">새 한도 (KRW)</label>
              <input
                type="number"
                value={newLimit || ''}
                min={100000}
                step={100000}
                onChange={e => setNewLimit(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
              {newLimit > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  {newLimit > selectedAccount.monthly_limit_krw
                    ? `+${formatKrw(newLimit - selectedAccount.monthly_limit_krw)} 증액`
                    : `${formatKrw(selectedAccount.monthly_limit_krw - newLimit)} 감액`}
                </p>
              )}
              {newLimit > selectedAccount.monthly_limit_krw * 1.5 && (
                <p className="mt-2 text-xs text-orange-600">
                  ⚠ 현재 한도의 1.5배 초과 — Full Path로 처리됩니다 (SLA 2~24h).
                </p>
              )}
            </div>
          </div>
        )}

        {step === 3 && actionType === 'terminate' && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">해지 시점</h2>
            <div className="space-y-3">
              <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="terminate_mode"
                  value="end_of_billing_cycle"
                  checked={terminateMode === 'end_of_billing_cycle'}
                  onChange={() => setTerminateMode('end_of_billing_cycle')}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-gray-900">청구월 말일 해지 (권장)</p>
                  <p className="text-sm text-gray-500 mt-0.5">이번 달 사용분은 정상 청구, 다음 달부터 과금 없음.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="terminate_mode"
                  value="immediate"
                  checked={terminateMode === 'immediate'}
                  onChange={() => setTerminateMode('immediate')}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-gray-900">즉시 해지</p>
                  <p className="text-sm text-gray-500 mt-0.5">VCN 즉시 중지. 일할 계산 적용.</p>
                </div>
              </label>
            </div>
          </div>
        )}

        {step === 3 && (actionType === 'vcn_replace' || actionType === 'decline_response') && (
          <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
            추가 옵션이 없습니다. 다음 단계로 이동하세요.
          </div>
        )}

        {/* Step 4: AM 메시지 */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">AM에게 남길 메시지 (선택)</h2>
            <p className="text-sm text-gray-500">
              긴급한 경우, 추가 설명이 필요한 경우 Luna에게 직접 전달됩니다.
            </p>
            <textarea
              value={amMessage}
              onChange={e => setAmMessage(e.target.value)}
              rows={6}
              placeholder="예: 다음 주 월요일까지 급히 필요합니다. 가능할까요?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        )}

        {/* Step 5: 확인 */}
        {step === 5 && actionType && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">요청 내용 확인</h2>
            <dl className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">요청 유형</dt>
                <dd className="font-medium">{ACTION_TYPE_LABELS[actionType].label}</dd>
              </div>
              {actionType === 'new_account' && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">서비스</dt>
                    <dd className="font-medium">{selectedService?.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">사용자</dt>
                    <dd className="font-medium">{members.find(m => m.id === targetMemberId)?.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">월 한도</dt>
                    <dd className="font-medium font-mono">{formatKrw(monthlyLimit)}</dd>
                  </div>
                </>
              )}
              {actionType === 'limit_change' && selectedAccount && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">계정</dt>
                    <dd className="font-medium">{selectedAccount.service?.name} — {selectedAccount.member?.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">한도 변경</dt>
                    <dd className="font-medium font-mono">
                      {formatKrw(selectedAccount.monthly_limit_krw)} → {formatKrw(newLimit)}
                    </dd>
                  </div>
                </>
              )}
              {actionType === 'terminate' && selectedAccount && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">계정</dt>
                    <dd className="font-medium">{selectedAccount.service?.name} — {selectedAccount.member?.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">해지 시점</dt>
                    <dd className="font-medium">
                      {terminateMode === 'immediate' ? '즉시' : '청구월 말일'}
                    </dd>
                  </div>
                </>
              )}
              {amMessage && (
                <div className="pt-2 border-t border-gray-200">
                  <dt className="text-gray-500 mb-1">AM 메시지</dt>
                  <dd className="text-gray-700 whitespace-pre-wrap">{amMessage}</dd>
                </div>
              )}
            </dl>
            <p className="text-xs text-gray-500">
              제출 후 Luna가 검토하여 진행하며, 진행 상황은 요청 내역 페이지에서 확인할 수 있습니다.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-8 mt-8 border-t border-gray-100">
          <button
            onClick={() => setStep((s => (s > 1 ? (s - 1) as Step : s))(step))}
            disabled={step === 1 || pending}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
          >
            ← 이전
          </button>
          {step < 5 ? (
            <button
              onClick={() => setStep((s => (s < 5 ? (s + 1) as Step : s))(step))}
              disabled={!canAdvance() || pending}
              className="bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors"
            >
              다음 →
            </button>
          ) : (
            <button
              onClick={onSubmit}
              disabled={pending}
              className="bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors"
            >
              {pending ? '제출 중...' : '요청 제출'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
