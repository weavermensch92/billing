'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function sendMessage(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const request_id = formData.get('request_id') as string
  const org_id = formData.get('org_id') as string
  const member_id = formData.get('member_id') as string
  const body = (formData.get('body') as string).trim()

  if (!body) return

  const { data: memberRow } = await supabase
    .from('members').select('name').eq('id', member_id).single()

  await supabase.from('request_messages').insert({
    request_id,
    org_id,
    message_type: 'text',
    sender_type: 'member',
    sender_id: member_id,
    sender_name: memberRow?.name ?? null,
    body,
  })

  revalidatePath(`/requests/${request_id}`)
}

export async function confirmCustomerAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const request_id = formData.get('request_id') as string

  const { data: member } = await supabase
    .from('members').select('id, org_id, role').eq('user_id', user.id).single()
  if (!member) return

  // 보안: 요청이 본인 것인지 + 같은 조직인지 + awaiting_customer 상태인지 사전 확인
  const { data: req } = await supabase
    .from('action_requests').select('id, org_id, requester_id, status')
    .eq('id', request_id).maybeSingle()
  if (!req || req.org_id !== member.org_id) {
    redirect(`/requests?error=${encodeURIComponent('요청을 찾을 수 없습니다.')}`)
  }
  if (req.status !== 'awaiting_customer') {
    redirect(`/requests/${request_id}?error=${encodeURIComponent('확인 대기 상태의 요청만 처리할 수 있습니다.')}`)
  }
  // Member는 본인 요청만. Owner/Admin은 조직 내 요청 허용 (PRD 5.1 Owner 권한)
  const isPrivileged = member.role === 'owner' || member.role === 'admin'
  if (!isPrivileged && req.requester_id !== member.id) {
    redirect(`/requests?error=${encodeURIComponent('본인이 제출한 요청만 확인할 수 있습니다.')}`)
  }

  const { error } = await supabase
    .from('action_requests')
    .update({ status: 'completed', resolved_at: new Date().toISOString() })
    .eq('id', request_id)
    .eq('org_id', member.org_id)
    .eq('status', 'awaiting_customer')

  if (error) {
    redirect(`/requests/${request_id}?error=${encodeURIComponent('확인 처리 실패: ' + error.message)}`)
  }

  // 시스템 메시지 기록
  await supabase.from('request_messages').insert({
    request_id,
    org_id: member.org_id,
    message_type: 'system_update',
    sender_type: 'system',
    sender_id: null,
    body: '고객 확인 완료 — 요청이 종료되었습니다.',
  })

  revalidatePath(`/requests/${request_id}`)
  revalidatePath('/requests')
}
