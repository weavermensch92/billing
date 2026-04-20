import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatKrw, formatDateTime } from '@/lib/utils/format'
import type { VirtualCard } from '@/types/billing.types'

interface AccountDetail {
  id: string
  org_id: string
  member_id: string
  service_id: string
  status: string
  monthly_limit_krw: number
  allow_overseas: boolean
  purpose: string | null
  activated_at: string | null
  terminated_at: string | null
  created_at: string
  updated_at: string
  member: { name: string; email: string; role: string } | null
  service: { name: string; vendor: string; category: string; tos_review_status: string } | null
  virtual_cards: VirtualCard[]
}

export default async function AccountDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rawAccount } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!rawAccount) notFound()

  const [memberRes, serviceRes, vcnRes] = await Promise.all([
    supabase.from('members').select('name, email, role').eq('id', (rawAccount as Record<string, unknown>).member_id as string).single(),
    supabase.from('services').select('name, vendor, category, tos_review_status').eq('id', (rawAccount as Record<string, unknown>).service_id as string).single(),
    supabase.from('virtual_cards').select('*').eq('account_id', params.id),
  ])

  const account: AccountDetail = {
    ...(rawAccount as unknown as AccountDetail),
    member: memberRes.data ?? null,
    service: serviceRes.data ?? null,
    virtual_cards: (vcnRes.data ?? []) as VirtualCard[],
  }

  const virtualCards = account.virtual_cards
  const primaryCard = virtualCards.find(c => c.card_type === 'primary')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 뒤로가기 */}
      <Link href="/services" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
        ← 서비스 목록
      </Link>

      {/* 계정 헤더 */}
      <div className="card p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {account.service?.name ?? '계정 상세'}
            </h1>
            <p className="text-sm text-gray-500 capitalize mt-0.5">
              {account.service?.vendor}
            </p>
          </div>
          <StatusBadge status={account.status} />
        </div>

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">사용자</dt>
            <dd className="font-medium mt-0.5">{account.member?.name}</dd>
            <dd className="text-gray-400 text-xs">{account.member?.email}</dd>
          </div>
          <div>
            <dt className="text-gray-500">월 한도</dt>
            <dd className="font-medium font-mono mt-0.5">
              {formatKrw(account.monthly_limit_krw)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">해외결제</dt>
            <dd className={`font-medium mt-0.5 ${account.allow_overseas ? 'text-green-600' : 'text-gray-400'}`}>
              {account.allow_overseas ? '허용' : '미허용'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">활성화일</dt>
            <dd className="font-medium mt-0.5">
              {account.activated_at ? formatDateTime(account.activated_at) : '-'}
            </dd>
          </div>
          {account.purpose && (
            <div className="col-span-2">
              <dt className="text-gray-500">사용 목적</dt>
              <dd className="font-medium mt-0.5">{account.purpose}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* VCN 정보 */}
      {primaryCard && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">가상카드 (VCN)</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">카드사</dt>
              <dd className="font-medium mt-0.5 capitalize">{primaryCard.card_issuer}</dd>
            </div>
            <div>
              <dt className="text-gray-500">카드 번호</dt>
              <dd className="font-mono font-medium mt-0.5">
                **** **** **** {primaryCard.card_last4 ?? '????'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">상태</dt>
              <dd className="mt-0.5"><StatusBadge status={primaryCard.status} /></dd>
            </div>
            <div>
              <dt className="text-gray-500">월 한도</dt>
              <dd className="font-mono font-medium mt-0.5">
                {formatKrw(primaryCard.monthly_limit_krw)}
              </dd>
            </div>
            {primaryCard.activated_at && (
              <div>
                <dt className="text-gray-500">활성화일</dt>
                <dd className="font-medium mt-0.5">{formatDateTime(primaryCard.activated_at)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* 한도 변경 요청 버튼 (Service-First UX PB-008) */}
      {account.status === 'active' && (
        <div className="flex gap-3">
          <Link
            href={`/services/new?type=limit_change&account_id=${account.id}`}
            className="flex-1 text-center border border-gray-300 text-sm font-medium
                       py-2.5 px-4 rounded-lg hover:bg-gray-50 transition-colors"
          >
            한도 변경 요청
          </Link>
          <Link
            href={`/services/new?type=terminate&account_id=${account.id}`}
            className="flex-1 text-center border border-red-200 text-red-600 text-sm font-medium
                       py-2.5 px-4 rounded-lg hover:bg-red-50 transition-colors"
          >
            계정 해지 요청
          </Link>
        </div>
      )}
    </div>
  )
}
