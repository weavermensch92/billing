import type { StatCard as StatCardProps } from '@/types/billing.types'

const trendIcon = (trend?: 'up' | 'down' | 'neutral') => {
  if (trend === 'up') return '↑'
  if (trend === 'down') return '↓'
  return null
}

const trendColor = (trend?: 'up' | 'down' | 'neutral') => {
  if (trend === 'up') return 'text-green-600'
  if (trend === 'down') return 'text-red-600'
  return 'text-gray-500'
}

export function StatCard({ label, value, subLabel, trend, trendValue }: StatCardProps) {
  return (
    <div className="card p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      {(subLabel || trendValue) && (
        <p className={`text-sm mt-1 ${trendColor(trend)}`}>
          {trendIcon(trend) && <span className="mr-1">{trendIcon(trend)}</span>}
          {trendValue ?? subLabel}
        </p>
      )}
    </div>
  )
}
