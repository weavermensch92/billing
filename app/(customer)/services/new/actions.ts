'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { ActionType } from '@/types/billing.types'

interface CreateRequestInput {
  action_type: ActionType
  request_data: Record<string, unknown>
  account_id?: string | null
  member_id?: string | null
  am_message?: string
}

export async function createRequest(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, org_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!member) redirect('/login')

  const action_type = formData.get('action_type') as ActionType
  const am_message = (formData.get('am_message') as string | null)?.trim() ?? ''

  // 유형별 request_data 구성
  const request_data: Record<string, unknown> = {}
  let account_id: string | null = null
  let target_member_id: string | null = null

  // Member는 본인 요청만
  const isPrivileged = member.role === 'owner' || member.role === 'admin'

  if (action_type === 'new_account') {
    request_data.service_id = formData.get('service_id')
    const requestedTarget = (formData.get('target_member_id') as string) || member.id
    // 보안: Member는 타인 계정 요청 불가
    if (!isPrivileged && requestedTarget !== member.id) {
      redirect(`/services/new?error=${encodeURIComponent('본인 계정만 요청할 수 있습니다.')}`)
    }
    // target_member_id는 반드시 같은 조직 소속
    const { data: tgt } = await supabase
      .from('members').select('id, org_id').eq('id', requestedTarget).maybeSingle()
    if (!tgt || tgt.org_id !== member.org_id) {
      redirect(`/services/new?error=${encodeURIComponent('유효하지 않은 대상 멤버입니다.')}`)
    }
    target_member_id = requestedTarget
    request_data.target_member_id = target_member_id
    request_data.monthly_limit_krw = Number(formData.get('monthly_limit_krw') || 500000)
    request_data.allow_overseas = formData.get('allow_overseas') === 'on'
    request_data.purpose = formData.get('purpose')
  } else if (action_type === 'limit_change' || action_type === 'terminate' ||
             action_type === 'vcn_replace' || action_type === 'decline_response') {
    account_id = formData.get('account_id') as string

    // 보안: account_id는 반드시 본인 조직 소속 + (Member라면 본인 계정)
    const { data: acc } = await supabase
      .from('accounts').select('id, org_id, member_id, status').eq('id', account_id).maybeSingle()
    if (!acc || acc.org_id !== member.org_id) {
      redirect(`/services/new?error=${encodeURIComponent('유효하지 않은 계정입니다.')}`)
    }
    if (!isPrivileged && acc.member_id !== member.id) {
      redirect(`/services/new?error=${encodeURIComponent('본인 계정에 대해서만 요청할 수 있습니다.')}`)
    }
    if (acc.status !== 'active') {
      redirect(`/services/new?error=${encodeURIComponent('활성 계정이 아닙니다.')}`)
    }

    if (action_type === 'limit_change') {
      const newLimit = Number(formData.get('new_limit_krw'))
      if (!Number.isFinite(newLimit) || newLimit <= 0 || newLimit > 100_000_000) {
        redirect(`/services/new?error=${encodeURIComponent('유효하지 않은 한도입니다.')}`)
      }
      request_data.new_limit_krw = newLimit
    } else if (action_type === 'terminate') {
      request_data.terminate_mode = formData.get('terminate_mode') ?? 'end_of_billing_cycle'
    } else if (action_type === 'vcn_replace') {
      request_data.reason = formData.get('reason')
    } else if (action_type === 'decline_response') {
      request_data.decline_context = formData.get('decline_context')
    }
  }

  const sla_hours = action_type === 'decline_response' ? 24 : 72
  const sla_deadline = new Date(Date.now() + sla_hours * 3600 * 1000).toISOString()

  const { data: newRequest, error } = await supabase
    .from('action_requests')
    .insert({
      org_id: member.org_id,
      requester_id: member.id,
      action_type,
      status: 'pending',
      account_id,
      member_id: target_member_id,
      request_data,
      sla_deadline,
    })
    .select('id')
    .single()

  if (error || !newRequest) {
    redirect(`/services/new?error=${encodeURIComponent('요청 생성 실패: ' + (error?.message ?? 'unknown'))}`)
  }

  // AM 첫 메시지 (고객 요청사항)
  if (am_message) {
    await supabase.from('request_messages').insert({
      request_id: newRequest.id,
      org_id: member.org_id,
      message_type: 'text',
      sender_type: 'member',
      sender_id: member.id,
      body: am_message,
    })
  }

  revalidatePath('/requests')
  revalidatePath('/home')
  redirect(`/requests/${newRequest.id}?created=1`)
}
