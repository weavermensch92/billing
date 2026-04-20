import type { VcnStatus } from '@/types/billing.types'

const STATES: { id: VcnStatus; label: string; group: 'flow' | 'terminal' }[] = [
  { id: 'pending',   label: '대기',      group: 'flow' },
  { id: 'approved',  label: '승인',      group: 'flow' },
  { id: 'issuing',   label: '발급 중',   group: 'flow' },
  { id: 'issued',    label: '발급 완료', group: 'flow' },
  { id: 'delivered', label: '전달',      group: 'flow' },
  { id: 'active',    label: '활성',      group: 'flow' },
  { id: 'suspended', label: '중지',      group: 'terminal' },
  { id: 'revoked',   label: '폐기',      group: 'terminal' },
  { id: 'expired',   label: '만료',      group: 'terminal' },
]

const TRANSITIONS: Record<VcnStatus, VcnStatus[]> = {
  pending:   ['approved', 'revoked'],
  approved:  ['issuing', 'revoked'],
  issuing:   ['issued', 'revoked'],
  issued:    ['delivered', 'revoked'],
  delivered: ['active', 'revoked'],
  active:    ['suspended', 'expired', 'revoked'],
  suspended: ['active', 'revoked'],
  revoked:   [],
  expired:   [],
}

export function VcnStateMachine({ current }: { current: VcnStatus }) {
  const flowStates = STATES.filter(s => s.group === 'flow')
  const terminalStates = STATES.filter(s => s.group === 'terminal')

  const currentIdx = flowStates.findIndex(s => s.id === current)
  const isTerminal = terminalStates.some(s => s.id === current)

  return (
    <div className="space-y-4">
      {/* 메인 플로우 (6단계) */}
      <div className="flex items-center">
        {flowStates.map((state, idx) => {
          const isPast = !isTerminal && idx < currentIdx
          const isCurrent = !isTerminal && state.id === current
          const isFuture = !isTerminal ? idx > currentIdx : true

          return (
            <div key={state.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full text-xs font-semibold transition-colors ${
                  isCurrent
                    ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                    : isPast
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                }`}>
                  {isPast ? '✓' : idx + 1}
                </div>
                <p className={`mt-2 text-xs text-center ${
                  isCurrent ? 'font-semibold text-brand-700' : isFuture ? 'text-gray-400' : 'text-gray-700'
                }`}>
                  {state.label}
                </p>
              </div>
              {idx < flowStates.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${isPast ? 'bg-brand-600' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Terminal 상태 (별도 영역) */}
      <div className="flex items-center gap-6 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-500 shrink-0">종료 상태:</p>
        {terminalStates.map(state => {
          const isCurrent = state.id === current
          return (
            <div key={state.id} className={`flex items-center gap-2 ${isCurrent ? '' : 'opacity-50'}`}>
              <span className={`inline-block w-3 h-3 rounded-full ${
                state.id === 'suspended' ? 'bg-orange-500'
                : state.id === 'revoked' ? 'bg-red-500'
                : 'bg-gray-500'
              }`} />
              <span className={`text-xs ${isCurrent ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                {state.label} {isCurrent && '(현재)'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function VcnTransitionButtons({
  current,
  onTransition,
}: {
  current: VcnStatus
  onTransition: (next: VcnStatus) => void
}) {
  const possible = TRANSITIONS[current]

  if (possible.length === 0) {
    return (
      <p className="text-xs text-gray-400">이 상태에서는 더 이상의 전이가 불가합니다.</p>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {possible.map(next => (
        <button
          key={next}
          onClick={() => onTransition(next)}
          className={`text-xs font-medium px-3 py-1.5 rounded ${
            next === 'revoked'
              ? 'border border-red-300 text-red-600 hover:bg-red-50'
              : next === 'suspended'
                ? 'border border-orange-300 text-orange-600 hover:bg-orange-50'
                : 'bg-brand-600 text-white hover:bg-brand-700'
          }`}
        >
          → {STATES.find(s => s.id === next)?.label}
        </button>
      ))}
    </div>
  )
}
