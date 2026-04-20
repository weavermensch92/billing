'use client'

import { useState, useTransition } from 'react'
import { VcnTransitionButtons } from '@/components/console/vcn-state-machine'
import { transitionVcn, revealFullCardNumber } from './actions'
import type { VcnStatus } from '@/types/billing.types'

interface Props {
  vcnId: string
  currentStatus: VcnStatus
  adminRole: 'super' | 'am' | 'finance' | 'ops'
}

export function VcnActions({ vcnId, currentStatus, adminRole }: Props) {
  const [selectedNext, setSelectedNext] = useState<VcnStatus | null>(null)
  const [reason, setReason] = useState('')
  const [revealReason, setRevealReason] = useState('')
  const [revealResult, setRevealResult] = useState<{ success?: boolean; message?: string; error?: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const onTransition = (next: VcnStatus) => setSelectedNext(next)

  const onConfirm = () => {
    if (!selectedNext) return
    const fd = new FormData()
    fd.set('vcn_id', vcnId)
    fd.set('next_status', selectedNext)
    fd.set('reason', reason)
    startTransition(() => {
      transitionVcn(fd)
      setSelectedNext(null)
      setReason('')
    })
  }

  const onReveal = () => {
    const fd = new FormData()
    fd.set('vcn_id', vcnId)
    fd.set('reason', revealReason)
    startTransition(async () => {
      const result = await revealFullCardNumber(fd)
      setRevealResult(result)
      if (result.success) setRevealReason('')
    })
  }

  return (
    <div className="space-y-4">
      {/* 상태 전이 */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">상태 전이</h3>
        {!selectedNext ? (
          <VcnTransitionButtons current={currentStatus} onTransition={onTransition} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              <strong>{currentStatus}</strong> → <strong>{selectedNext}</strong> 전이
            </p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="전이 사유 (감사 로그에 기록됩니다)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={onConfirm}
                disabled={pending}
                className="bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                {pending ? '처리 중...' : '전이 확정'}
              </button>
              <button
                onClick={() => { setSelectedNext(null); setReason('') }}
                className="border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 전체번호 조회 (Super 전용) */}
      {adminRole === 'super' && (
        <div className="card p-5 border-2 border-red-200 bg-red-50">
          <h3 className="text-sm font-semibold text-red-900 mb-2">
            🔒 전체 카드 번호 조회 (Super 전용)
          </h3>
          <p className="text-xs text-red-700 mb-3">
            전체 번호는 DB에 저장되지 않습니다. 카드사 포털에서 직접 조회합니다. 이 요청 자체가 감사 로그 대상입니다.
          </p>
          <textarea
            value={revealReason}
            onChange={e => setRevealReason(e.target.value)}
            rows={2}
            placeholder="조회 사유 (최소 10자, 감사 로그 internal_only 기록)"
            className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm"
          />
          <button
            onClick={onReveal}
            disabled={pending || revealReason.length < 10}
            className="mt-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            조회 요청 기록
          </button>

          {revealResult && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${
              revealResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {revealResult.message ?? revealResult.error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
