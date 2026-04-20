'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/utils/format'
import type { RequestMessage } from '@/types/request.types'

interface Props {
  requestId: string
  orgId: string
  initialMessages: RequestMessage[]
  sendMessage: (formData: FormData) => Promise<void>
}

export function AdminMessageThread({ requestId, orgId, initialMessages, sendMessage }: Props) {
  const [messages, setMessages] = useState<RequestMessage[]>(initialMessages)
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`admin-msgs-${requestId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'billing', table: 'request_messages',
        filter: `request_id=eq.${requestId}`,
      }, (payload: { new: RequestMessage }) => {
        const newMsg = payload.new
        setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [requestId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const onSubmit = () => {
    if (!body.trim()) return
    const fd = new FormData()
    fd.set('request_id', requestId)
    fd.set('org_id', orgId)
    fd.set('body', body)
    startTransition(async () => {
      await sendMessage(fd)
      setBody('')
    })
  }

  return (
    <div className="card flex flex-col h-full min-h-[400px]">
      <div className="px-4 py-2 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">고객 메시지</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-[500px]">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-8">메시지 없음</p>
        ) : messages.map(msg => {
          const isAdmin = msg.sender_type === 'admin'
          const isSystem = msg.sender_type === 'system' || msg.message_type === 'system_update'
          if (isSystem) {
            return (
              <div key={msg.id} className="text-center">
                <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                  {msg.body}
                </span>
              </div>
            )
          }
          return (
            <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[85%]">
                <div className={`rounded-lg px-3 py-2 text-sm ${
                  isAdmin ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-900'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.body}</p>
                </div>
                <p className={`text-xs text-gray-400 mt-1 ${isAdmin ? 'text-right' : 'text-left'}`}>
                  {msg.sender_name ?? (isAdmin ? 'AM' : '고객')} · {formatDateTime(msg.created_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-gray-100 p-3">
        <form onSubmit={e => { e.preventDefault(); onSubmit() }} className="flex gap-2">
          <input
            type="text"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="고객에게 메시지..."
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
