import type { ActionType, RequestStatus, PathType } from './billing.types'

export type WizardStep = 1 | 2 | 3 | 4 | 5

export interface RequestMessage {
  id: string
  request_id: string
  org_id: string
  message_type: 'text' | 'system_update' | 'attachment'
  sender_type: 'member' | 'admin' | 'system'
  sender_id: string | null
  sender_name: string | null
  body: string
  attachments: unknown[]
  read_by_member_at: string | null
  read_by_admin_at: string | null
  created_at: string
}

export interface RequestEvent {
  id: string
  request_id: string
  org_id: string
  event_type: string
  actor_type: 'member' | 'admin' | 'system'
  actor_id: string | null
  event_data: Record<string, unknown>
  created_at: string
}

export interface RequestWizardState {
  step: WizardStep
  action_type: ActionType | null
  // Step 2 — 유형별
  target_service_id?: string
  target_member_id?: string
  target_account_id?: string
  monthly_limit_krw?: number
  allow_overseas?: boolean
  purpose?: string
  // Step 3 — 선택 옵션
  new_limit_krw?: number
  terminate_mode?: 'immediate' | 'end_of_billing_cycle'
  decline_context?: string
  // Step 4 — AM 메시지
  am_message?: string
}

export const ACTION_TYPE_LABELS: Record<ActionType, { label: string; description: string; icon: string }> = {
  new_account: {
    label: '신규 계정 개설',
    description: '멤버에게 AI 서비스 계정을 새로 개설합니다.',
    icon: '✨',
  },
  limit_change: {
    label: '한도 변경',
    description: '기존 계정의 월 한도를 조정합니다.',
    icon: '📊',
  },
  terminate: {
    label: '계정 해지',
    description: '사용하지 않는 계정을 해지합니다.',
    icon: '🗑️',
  },
  vcn_replace: {
    label: 'VCN 교체',
    description: '가상카드를 새로 발급받아 교체합니다.',
    icon: '🔄',
  },
  decline_response: {
    label: '결제 거절 대응',
    description: '결제 거절 건에 대한 대응을 요청합니다.',
    icon: '⚠️',
  },
  bulk_terminate: {
    label: '일괄 해지 (오프보딩)',
    description: '퇴사 멤버의 계정을 일괄 해지합니다.',
    icon: '👋',
  },
  headroom_increase: {
    label: '자율 승인 한도 증액',
    description: '자율 승인 여유분 초과 요청을 위해 Super에게 한도 증액을 요청합니다.',
    icon: '📈',
  },
}

export const STATUS_LABELS: Record<RequestStatus, string> = {
  pending:           '대기',
  in_review:         '검토 중',
  awaiting_customer: '고객 확인 대기',
  awaiting_headroom: '한도 증액 승인 대기',
  approved:          '승인됨',
  rejected:          '반려됨',
  completed:         '완료',
  cancelled:         '취소됨',
}

export const PATH_LABELS: Record<PathType, { label: string; color: string }> = {
  fast: { label: 'Fast Path', color: 'text-green-600' },
  full: { label: 'Full Path', color: 'text-blue-600' },
  self: { label: 'Self-Approved', color: 'text-purple-600' },
}

// wizard에서 사용하는 Account 조인 타입 (클라이언트 컴포넌트 공유용)
export interface WizardAccount {
  id: string
  status: string
  monthly_limit_krw: number
  service: { name: string; vendor: string } | null
  member: { name: string } | null
}
