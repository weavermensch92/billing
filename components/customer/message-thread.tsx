'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/utils/format'
import type { RequestMessage } from '@/types/request.types'

interface Props {
  requestId: string
  orgId: string
  memberId: string
  initialMessages: RequestMessage[]
  sendMessage: (formData: FormData) => Promise<void>
}

export function MessageThread({ requestId, orgId, memberId, initialMessages, sendMessage }: Props) {
  const [messages, setMessages] = useState<RequestMessage[]>(initialMessages)
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Realtime 구독
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`request-messages-${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'billing',
          table: 'request_messages',
          filter: `request_id=eq.${requestId}`,
        },
        (payload: { new: RequestMessage }) => {
          const newMsg = payload.new
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [requestId])

  // 자동 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const onSubmit = () => {
    if (!body.trim()) return
    const fd = new FormData()
    fd.set('request_id', requestId)
    fd.set('org_id', orgId)
    fd.set('member_id', memberId)
    fd.set('body', body)
    startTransition(async () => {
      await sendMessage(fd)
      setBody('')
    })
  }

  return (
    <div className="card flex flex-col" style={{ height: '500px' }}>
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">AM 메시지</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-12">
            아직 메시지가 없습니다.
          </p>
        ) : (
          messages.map(msg => {
            const isMine = msg.sender_type === 'member' && msg.sender_id === memberId
            const isSystem = msg.sender_type === 'system' || msg.message_type === 'system_update'
            if (isSystem) {
              return (
                <div key={msg.id} className="text-center">
                  <span className="inline-block px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                    {msg.body}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">{formatDateTime(msg.created_at)}</p>
                </div>
              )
            }
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'}`}>
                  <div className={`rounded-lg px-4 py-2 text-sm ${
                    isMine ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-900'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                  </div>
                  <p className={`text-xs text-gray-400 mt-1 ${isMine ? 'text-right' : 'text-left'}`}>
                    {msg.sender_name ?? (msg.sender_type === 'admin' ? 'Luna (AM)' : '나')} · {formatDateTime(msg.created_at)}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-100 p-3">
        <form
          onSubmit={e => { e.preventDefault(); onSubmit() }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="메시지 입력..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending || !body.trim()}
            className="bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            전송
          </button>
        </form>
      </div>
    </div>
  )
}
