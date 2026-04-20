'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatKrw, formatDateTime } from '@/lib/utils/format'
import type { Transaction } from '@/types/billing.types'

interface TxWithOrg extends Transaction {
  org?: { name: string } | null
}

export function RealtimeTransactions({
  initial,
}: {
  initial: TxWithOrg[]
}) {
  const [transactions, setTransactions] = useState<TxWithOrg[]>(initial)

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('payments-feed')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'billing', table: 'transactions',
      }, (payload: { new: TxWithOrg }) => {
        const newTx = payload.new
        setTransactions(prev => {
          if (prev.some(t => t.id === newTx.id)) return prev
          return [newTx, ...prev].slice(0, 50)
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  if (transactions.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-gray-400">
        실시간 결제 내역이 없습니다.
      </div>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50">
          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">시각</th>
          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">고객사</th>
          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">가맹점</th>
          <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">금액</th>
          <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">상태</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {transactions.map(tx => (
          <tr key={tx.id} className={tx.status === 'declined' ? 'bg-red-50' : 'hover:bg-gray-50'}>
            <td className="px-6 py-3 text-xs text-gray-500">{formatDateTime(tx.transacted_at)}</td>
            <td className="px-6 py-3">
              {tx.org?.name ? (
                <Link href={`/console/orgs/${tx.org_id}`} className="hover:text-brand-600">
                  {tx.org.name}
                </Link>
              ) : '-'}
            </td>
            <td className="px-6 py-3 font-medium">{tx.merchant_name ?? '-'}</td>
            <td className="px-6 py-3 text-right font-mono">{formatKrw(tx.amount_krw)}</td>
            <td className="px-6 py-3">
              <StatusBadge status={tx.status === 'settled' ? 'completed' : tx.status === 'declined' ? 'rejected' : tx.status} />
              {tx.decline_reason && (
                <span className="block text-xs text-red-600 mt-0.5">{tx.decline_reason}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
