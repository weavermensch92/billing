type StatusVariant =
  | 'active' | 'pending' | 'suspended' | 'invited'
  | 'approved' | 'rejected' | 'conditional'
  | 'completed' | 'in_review' | 'cancelled'
  | string

const variantMap: Record<string, string> = {
  active:      'bg-green-100 text-green-700',
  approved:    'bg-green-100 text-green-700',
  completed:   'bg-green-100 text-green-700',
  pending:     'bg-yellow-100 text-yellow-700',
  in_review:   'bg-yellow-100 text-yellow-700',
  invited:     'bg-blue-100 text-blue-700',
  conditional: 'bg-orange-100 text-orange-700',
  suspended:   'bg-red-100 text-red-700',
  rejected:    'bg-red-100 text-red-700',
  cancelled:   'bg-gray-100 text-gray-600',
}

const labelMap: Record<string, string> = {
  active:              '활성',
  pending:             '대기',
  suspended:           '일시정지',
  invited:             '초대됨',
  approved:            '승인됨',
  rejected:            '거절됨',
  conditional:         '조건부 허용',
  completed:           '완료',
  in_review:           '검토 중',
  awaiting_customer:   '고객 확인 대기',
  cancelled:           '취소됨',
  issuing:             '발급 중',
  issued:              '발급 완료',
  delivered:           '전달 완료',
  revoked:             '폐기됨',
  expired:             '만료됨',
  terminated:          '해지됨',
  offboarded:          '오프보딩',
  draft:               '초안',
  issued_invoice:      '발행됨',
  paid:                '납부됨',
  overdue:             '연체',
}

interface Props {
  status: StatusVariant
  className?: string
}

export function StatusBadge({ status, className = '' }: Props) {
  const colorClass = variantMap[status] ?? 'bg-gray-100 text-gray-600'
  const label = labelMap[status] ?? status
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass} ${className}`}>
      {label}
    </span>
  )
}
