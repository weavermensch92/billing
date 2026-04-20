'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Props {
  orgId: string
  memberId: string
  initialUnreadCount: number
}

export function NotificationBell({ orgId, memberId, initialUnreadCount }: Props) {
  const [count, setCount] = useState(initialUnreadCount)

  useEffect(() => {
    const supabase = createClient()

    // 미읽음 메시지 실시간 업데이트
    const channel = supabase
      .channel(`notif-${memberId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'billing', table: 'request_messages',
        filter: `org_id=eq.${orgId}`,
      }, (payload: { new: { sender_type: string; read_by_member_at: string | null } }) => {
        const msg = payload.new
        if (msg.sender_type === 'admin' && !msg.read_by_member_at) {
          setCount(c => c + 1)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [orgId, memberId])

  return (
    <Link
      href="/requests"
      className="relative inline-flex items-center px-2 py-1 text-sm text-gray-500 hover:text-gray-900"
      aria-label="알림"
    >
      <span>🔔</span>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  )
}
