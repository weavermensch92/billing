import { formatKrw } from '@/lib/utils/format'

interface Props {
  headroomKrw: number
  usedKrw: number
  role: 'owner' | 'admin' | 'member'
}

export function HeadroomBadge({ headroomKrw, usedKrw, role }: Props) {
  // Owner/Admin에게만 표시. Headroom=0 이면 숨김
  if (headroomKrw <= 0) return null
  if (role !== 'owner' && role !== 'admin') return null

  const remaining = Math.max(0, headroomKrw - usedKrw)
  const pct = headroomKrw > 0 ? Math.round((usedKrw / headroomKrw) * 100) : 0
  const tone = pct >= 90 ? 'text-red-600 bg-red-50 border-red-200'
             : pct >= 70 ? 'text-orange-600 bg-orange-50 border-orange-200'
             : 'text-green-700 bg-green-50 border-green-200'

  return (
    <div
      className={`hidden md:flex items-center gap-2 px-3 py-1 border rounded-full text-xs ${tone}`}
      title={`자율 승인 한도: ${formatKrw(headroomKrw)} / 사용 ${formatKrw(usedKrw)} (${pct}%) · 매월 1일 리셋`}
    >
      <span className="font-medium">자율승인 잔여</span>
      <span className="font-mono font-semibold">{formatKrw(remaining)}</span>
    </div>
  )
}
