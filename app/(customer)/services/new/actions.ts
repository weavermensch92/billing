'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { estimateRequestCost } from '@/lib/billing/estimate-cost'
import { tryConsumeSelfApproval, readHeadroom } from '@/lib/billing/self-approval'
import { executeRequestCompletion } from '@/lib/billing/request-executor'
import { validateLimitDecrease } from '@/lib/billing/limit-validator'
import type { ActionType } from '@/types/billing.types'

export async function createRequest(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // role 포함 — self-approve 판정에 필요
  const { data: member } = await supabase
    .from('members')
    .select('id, org_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!member) redirect('/login')

  const action_type = formData.get('action_type') as ActionType
  const am_message = (formData.get('am_message') as string | null)?.trim() ?? ''
  const wantSelfApprove = formData.get('self_approve') === 'true'

  // 유형별 request_data 구성
  const request_data: Record<string, unknown> = {}
  let account_id: string | null = null
  let target_member_id: string | null = null
  let currentAccountLimit: number | undefined = undefined

  // Member는 본인 요청만
  const isPrivileged = member.role === 'owner' || member.role === 'admin'

  if (action_type === 'new_account') {
    request_data.service_id = formData.get('service_id')
    const requestedTarget = (formData.get('target_member_id') as string) || member.id
    if (!isPrivileged && requestedTarget !== member.id) {
      redirect(`/services/new?error=${encodeURIComponent('본인 계정만 요청할 수 있습니다.')}`)
    }
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

    const { data: acc } = await supabase
      .from('accounts').select('id, org_id, member_id, status, monthly_limit_krw').eq('id', account_id).maybeSingle()
    if (!acc || acc.org_id !== member.org_id) {
      redirect(`/services/new?error=${encodeURIComponent('유효하지 않은 계정입니다.')}`)
    }
    if (!isPrivileged && acc.member_id !== member.id) {
      redirect(`/services/new?error=${encodeURIComponent('본인 계정에 대해서만 요청할 수 있습니다.')}`)
    }
    if (acc.status !== 'active') {
      redirect(`/services/new?error=${encodeURIComponent('활성 계정이 아닙니다.')}`)
    }
    currentAccountLimit = acc.monthly_limit_krw as number

    if (action_type === 'limit_change') {
      const newLimit = Number(formData.get('new_limit_krw'))
      if (!Number.isFinite(newLimit) || newLimit <= 0 || newLimit > 100_000_000) {
        redirect(`/services/new?error=${encodeURIComponent('유효하지 않은 한도입니다.')}`)
      }
      // 감액 시 당월 사용액 초과 차단
      if (currentAccountLimit !== undefined && newLimit < currentAccountLimit) {
        const v = await validateLimitDecrease(supabase, account_id!, newLimit)
        if (!v.ok) {
          redirect(`/services/new?error=${encodeURIComponent(v.error ?? '감액 불가')}`)
        }
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

  // 비용 추정 + self-approve 판정
  const estimated_cost_krw = estimateRequestCost(action_type, request_data, currentAccountLimit)
  const sla_hours = action_type === 'decline_response' ? 24 : 72
  const sla_deadline = new Date(Date.now() + sla_hours * 3600 * 1000).toISOString()

  let selfApproved = false
  let selfApprovedAt: string | null = null
  // 자동 연쇄형: 부분 커버 감지 시 선 소진액 + Super 증액 대기
  let awaitingHeadroom = false
  let shortfallKrw = 0
  let reservedKrw = 0

  // Self-approve 시도: Admin/Owner + 명시적 요청 + 비용 > 0
  if (wantSelfApprove && isPrivileged && estimated_cost_krw > 0) {
    const { remaining_krw } = await readHeadroom(supabase, member.org_id)
    if (remaining_krw >= estimated_cost_krw) {
      // 전액 커버 — 기존 즉시 승인 경로
      const consume = await tryConsumeSelfApproval(supabase, member.org_id, estimated_cost_krw)
      if (consume.ok) {
        selfApproved = true
        selfApprovedAt = new Date().toISOString()
      }
    } else if (remaining_krw > 0) {
      // 부분 커버 — 잔여 선 소진 + Super 증액 요청 자동 연쇄
      reservedKrw = remaining_krw
      shortfallKrw = estimated_cost_krw - remaining_krw
      const reserve = await tryConsumeSelfApproval(supabase, member.org_id, reservedKrw)
      if (reserve.ok) {
        awaitingHeadroom = true
        selfApprovedAt = new Date().toISOString()
      } else {
        // race loss — 전액 AM 풀패스로 fallback
        reservedKrw = 0
        shortfallKrw = 0
      }
    }
    // remaining_krw === 0 → AM 풀패스
  }

  // 상태 분기:
  //   awaitingHeadroom → 'awaiting_headroom' (Super 증액 승인 대기)
  //   selfApproved → 'pending' (executor가 바로 completed 전이)
  //   그 외 → 'pending' (AM 라우팅 대기)
  const initialStatus = awaitingHeadroom ? 'awaiting_headroom' : 'pending'
  const insertPayload: Record<string, unknown> = {
    org_id: member.org_id,
    requester_id: member.id,
    action_type,
    status: initialStatus,
    path_type: (selfApproved || awaitingHeadroom) ? 'self' : null,
    account_id,
    member_id: target_member_id,
    request_data,
    sla_deadline,
    estimated_cost_krw,
    self_approved_by: (selfApproved || awaitingHeadroom) ? member.id : null,
    self_approved_at: selfApprovedAt,
    headroom_shortfall_krw: shortfallKrw,
    reserved_headroom_krw: reservedKrw,
  }

  const { data: newRequest, error } = await supabase
    .from('action_requests')
    .insert(insertPayload)
    .select('id')
    .single()

  if (error || !newRequest) {
    // headroom 롤백 (executor 시도 전) — selfApproved 또는 awaitingHeadroom 양쪽 모두
    const rollbackAmount = selfApproved ? estimated_cost_krw : (awaitingHeadroom ? reservedKrw : 0)
    if (rollbackAmount > 0) {
      const { data: orgRow } = await supabase.from('orgs').select('self_approval_used_krw').eq('id', member.org_id).single()
      const currentUsed = (orgRow as { self_approval_used_krw?: number } | null)?.self_approval_used_krw ?? 0
      await supabase.from('orgs').update({
        self_approval_used_krw: Math.max(0, currentUsed - rollbackAmount),
      }).eq('id', member.org_id)
    }
    redirect(`/services/new?error=${encodeURIComponent('요청 생성 실패: ' + (error?.message ?? 'unknown'))}`)
  }

  // self-approve인 경우 executor로 실제 DB 반영
  if (selfApproved) {
    const execResult = await executeRequestCompletion(supabase, newRequest.id, { resolved_by: member.id })
    if (!execResult.ok) {
      // 롤백: request 제거 + headroom 원상복구
      await supabase.from('action_requests').update({ status: 'cancelled' }).eq('id', newRequest.id)
      if (estimated_cost_krw > 0) {
        const { data: orgRow } = await supabase.from('orgs').select('self_approval_used_krw').eq('id', member.org_id).single()
        const currentUsed = (orgRow as { self_approval_used_krw?: number } | null)?.self_approval_used_krw ?? 0
        await supabase.from('orgs').update({
          self_approval_used_krw: Math.max(0, currentUsed - estimated_cost_krw),
        }).eq('id', member.org_id)
      }
      redirect(`/services/new?error=${encodeURIComponent('즉시 승인 실행 실패: ' + (execResult.error ?? 'unknown'))}`)
    }
  }

  // awaitingHeadroom: Super 대상 헤드룸 증액 자식 요청 자동 생성
  if (awaitingHeadroom) {
    await supabase.from('action_requests').insert({
      org_id: member.org_id,
      requester_id: member.id,
      action_type: 'headroom_increase',
      status: 'pending',
      path_type: 'full',
      parent_id: newRequest.id,
      request_data: {
        amount_krw: shortfallKrw,
        parent_request_id: newRequest.id,
        reason: `자율 승인 한도 초과 — 부모 요청 예상비용 ${estimated_cost_krw.toLocaleString()}원 중 잔여 ${reservedKrw.toLocaleString()}원 선 소진, 초과 ${shortfallKrw.toLocaleString()}원 증액 필요`,
      },
      sla_deadline,
      estimated_cost_krw: 0, // 증액 자체는 비용 0, 부모에서만 계산
    })

    await supabase.from('audit_logs').insert({
      org_id: member.org_id,
      actor_type: 'member',
      actor_id: member.id,
      actor_email: user.email ?? null,
      action: 'headroom_increase_requested',
      target_type: 'action_request',
      target_id: newRequest.id,
      visibility: 'both',
      detail: {
        parent_action_type: action_type,
        estimated_cost_krw,
        reserved_krw: reservedKrw,
        shortfall_krw: shortfallKrw,
      },
    })
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

  // 감사 로그 — self-approval 기록 (visibility=both, 고객도 확인)
  if (selfApproved) {
    await supabase.from('audit_logs').insert({
      org_id: member.org_id,
      actor_type: 'member',
      actor_id: member.id,
      actor_email: user.email ?? null,
      action: 'request_self_approved',
      target_type: 'action_request',
      target_id: newRequest.id,
      visibility: 'both',
      detail: {
        action_type,
        estimated_cost_krw,
        path: 'on_submit',
      },
    })
  }

  revalidatePath('/requests')
  revalidatePath('/home')

  const query = selfApproved
    ? '?created=1&self=1'
    : awaitingHeadroom
      ? '?created=1&awaiting_headroom=1'
      : '?created=1'
  redirect(`/requests/${newRequest.id}${query}`)
}
