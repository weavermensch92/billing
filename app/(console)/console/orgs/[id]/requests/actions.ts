'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClientOrRedirect } from '@/lib/supabase/service-role'
import { actionErrorMessage, isRedirectError } from '@/lib/errors'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

const ALLOWED_TYPES = [
  'new_account',
  'terminate',
  'limit_change',
  'vcn_replace',
  'decline_response',
  'bulk_terminate',
] as const
type ActionType = (typeof ALLOWED_TYPES)[number]

function sanitize(s: string | null | undefined, max: number): string {
  return (s ?? '').toString().trim().slice(0, max)
}

/**
 * 운영 콘솔 — Super 가 고객사 대신 신규 요청을 제출.
 * 고객이 전화·메일로 의뢰한 내용을 운영자가 시스템에 기록할 때 사용.
 *
 * 흐름:
 *   1) Super 권한 검증
 *   2) action_type 검증, request_data JSONB 구성
 *   3) action_requests INSERT — assigned_to=본인, status='in_review' (이미 운영자가 처리 중)
 *   4) 감사 로그 (visibility=both)
 *   5) AM 이 요청 상세 페이지에서 후속 처리 (path_type 결정, 진행 등)
 */
export async function submitOnBehalf(formData: FormData) {
  const orgId = sanitize(formData.get('org_id') as string, 50)
  if (!orgId) {
    redirect('/console/orgs?error=' + encodeURIComponent('Org ID 누락'))
  }

  const backToForm = `/console/orgs/${orgId}/requests/new`

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: me } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!me) redirect('/console/login')

  if (me.role !== 'super' && me.role !== 'am') {
    redirect(`${backToForm}?error=` + encodeURIComponent('대신 제출은 Super 또는 AM 만 가능합니다.'))
  }

  const actionType = sanitize(formData.get('action_type') as string, 30) as ActionType
  const subject = sanitize(formData.get('subject') as string, 200)
  const detail = sanitize(formData.get('detail') as string, 2000)
  const accountId = sanitize(formData.get('account_id') as string, 50) || null
  const memberId = sanitize(formData.get('member_id') as string, 50) || null
  const customerContact = sanitize(formData.get('customer_contact') as string, 200)

  if (!ALLOWED_TYPES.includes(actionType)) {
    redirect(`${backToForm}?error=` + encodeURIComponent('요청 유형을 선택해 주세요.'))
  }
  if (subject.length < 3) {
    redirect(`${backToForm}?error=` + encodeURIComponent('제목은 3자 이상 입력해 주세요.'))
  }
  if (detail.length < 5) {
    redirect(`${backToForm}?error=` + encodeURIComponent('상세 내용을 5자 이상 입력해 주세요.'))
  }

  const service = createServiceRoleClientOrRedirect(backToForm)

  // Org 존재 확인
  const { data: org } = await service
    .from('orgs')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle()
  if (!org) {
    redirect('/console/orgs?error=' + encodeURIComponent('Org 를 찾을 수 없습니다.'))
  }

  // account / member 가 같은 org 소속인지 검증
  if (accountId) {
    const { data: acc } = await service
      .from('accounts')
      .select('id')
      .eq('id', accountId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!acc) {
      redirect(`${backToForm}?error=` + encodeURIComponent('선택한 계정이 이 Org 에 속하지 않습니다.'))
    }
  }
  if (memberId) {
    const { data: mem } = await service
      .from('members')
      .select('id')
      .eq('id', memberId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!mem) {
      redirect(`${backToForm}?error=` + encodeURIComponent('선택한 멤버가 이 Org 에 속하지 않습니다.'))
    }
  }

  let newRequestId: string
  try {
    const { data: inserted, error: insertErr } = await service
      .from('action_requests')
      .insert({
        org_id: orgId,
        requester_id: memberId,         // 고객 측 요청자 (전달받은 경우)
        action_type: actionType,
        status: 'in_review',            // Super 가 직접 입력 — 이미 운영자가 처리 중
        account_id: accountId,
        member_id: memberId,
        request_data: {
          subject,
          detail,
          customer_contact: customerContact || null,
          submitted_by: 'console_on_behalf',
          submitter_admin_id: me.id,
          submitter_email: user.email,
        },
        assigned_to: me.id,             // 자기 자신 할당
      })
      .select('id')
      .single()

    if (insertErr || !inserted) {
      redirect(
        `${backToForm}?error=` +
          encodeURIComponent('요청 생성 실패: ' + (insertErr?.message ?? 'unknown')),
      )
    }
    newRequestId = inserted.id

    await service.from('audit_logs').insert({
      org_id: orgId,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'request_created_on_behalf',
      target_type: 'action_request',
      target_id: newRequestId,
      visibility: 'both',
      detail: {
        action_type: actionType,
        subject,
        account_id: accountId,
        member_id: memberId,
      },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[submitOnBehalf]', err)
    redirect(`${backToForm}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  revalidatePath(`/console/orgs/${orgId}`)
  revalidatePath('/console/requests')
  redirect(`/console/requests/${newRequestId}?ok=` + encodeURIComponent('대신 제출 완료. 처리 진행하세요.'))
}
