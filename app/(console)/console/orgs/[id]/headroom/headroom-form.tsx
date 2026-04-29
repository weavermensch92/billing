'use client'

import { useState, useTransition } from 'react'
import { formatKrw } from '@/lib/utils/format'
import { setHeadroom } from './actions'

interface Props {
  orgId: string
  currentHeadroom: number
  currentUsed: number
}

export function HeadroomForm({ orgId, currentHeadroom, currentUsed }: Props) {
  const [newAmount, setNewAmount] = useState(currentHeadroom)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  const remaining = Math.max(0, currentHeadroom - currentUsed)
  const delta = newAmount - currentHeadroom
  const canSubmit = newAmount >= 0 && newAmount <= 1_000_000_000
    && newAmount >= currentUsed && reason.trim().length >= 10 && !pending

  const onSubmit = () => {
    const fd = new FormData()
    fd.set('org_id', orgId)
    fd.set('new_amount_krw', String(newAmount))
    fd.set('reason', reason.trim())
    startTransition(() => { setHeadroom(fd) })
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="p-3 bg-gray-50 rounded">
          <p className="text-xs text-gray-500">현재 한도</p>
          <p className="font-mono font-semibold">{formatKrw(currentHeadroom)}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded">
          <p className="text-xs text-gray-500">이번 달 사용</p>
          <p className="font-mono font-semibold">{formatKrw(currentUsed)}</p>
        </div>
        <div className="p-3 bg-green-50 rounded">
          <p className="text-xs text-gray-500">남은 여유분</p>
          <p className="font-mono font-semibold text-green-700">{formatKrw(remaining)}</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">새 한도 (KRW)</label>
        <input
          type="number"
          min={currentUsed}
          max={1_000_000_000}
          step={100_000}
          value={newAmount}
          onChange={e => setNewAmount(Math.max(0, Number(e.target.value)))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
        />
        <div className="mt-1 flex justify-between text-xs">
          <span className="text-gray-500">
            최소: 현재 사용액 {formatKrw(currentUsed)} 이상 · 최대: {formatKrw(1_000_000_000)}
          </span>
          <span className={delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-500'}>
            {delta > 0 ? `+${formatKrw(delta)} 증액` : delta < 0 ? `${formatKrw(delta)} 감액` : '변경 없음'}
          </span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          변경 사유 <span className="text-red-500">*</span>
        </label>
        <textarea
          rows={3}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="최소 10자 이상. 예: 프로젝트 확장으로 월 3개 신규 계정 증설 예정. 2배 증액 요청."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">
          변경 이력은 고객도 확인 가능한 감사 로그에 기록됩니다 (PB-010 visibility=both).
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white text-sm font-medium px-6 py-2 rounded-lg"
        >
          {pending ? '저장 중...' : '한도 변경 확정'}
        </button>
      </div>
    </div>
  )
}
