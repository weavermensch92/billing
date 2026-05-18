'use server'

/**
 * 미연결 청구서 → 워크스페이스 수동 연결.
 *
 * 흐름:
 *   1) Super 검증
 *   2) invoice 존재 + source_type='account_invoice' 확인 (다른 상태는 손대지 않음)
 *   3) workspace 존재 + org_id / service.vendor 일치 검증
 *   4) UPDATE workspace_id + source_type='workspace_invoice'
 *      vendor_invoices.workspace_id 트리거 (M-2005) 가 한 번 설정되면 재할당 차단하므로
 *      이 액션이 사실상 1회성.
 */

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClientOrRedirect } from '@/lib/supabase/service-role'
import { actionErrorMessage, isRedirectError } from '@/lib/errors'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function sanitize(s: string | null | undefined, max: number): string {
  return (s ?? '').toString().trim().slice(0, max)
}

async function authorizeSuper(back: string) {
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
  if (me.role !== 'super') {
    redirect(`${back}?error=` + encodeURIComponent(`Super 전용 (현재: ${me.role})`))
  }
  return { user, me }
}

export async function linkInvoiceToWorkspace(formData: FormData) {
  const back = '/console/workspaces/unlinked-invoices'
  const invoiceId = sanitize(formData.get('invoice_id') as string, 50)
  const workspaceId = sanitize(formData.get('workspace_id') as string, 50)

  if (!invoiceId) redirect(`${back}?error=` + encodeURIComponent('invoice_id 누락'))
  if (!workspaceId) redirect(`${back}?error=` + encodeURIComponent('워크스페이스를 선택하세요.'))

  const { user, me } = await authorizeSuper(back)
  const service = createServiceRoleClientOrRedirect(back)

  // invoice 조회
  const { data: inv } = await service
    .from('vendor_invoices')
    .select('id, org_id, vendor, workspace_id, source_type, vendor_workspace_id')
    .eq('id', invoiceId)
    .maybeSingle() as { data: { id: string; org_id: string; vendor: string; workspace_id: string | null; source_type: string; vendor_workspace_id: string | null } | null }
  if (!inv) redirect(`${back}?error=` + encodeURIComponent('청구서를 찾을 수 없습니다.'))
  if (inv.workspace_id) redirect(`${back}?error=` + encodeURIComponent('이미 워크스페이스가 연결돼 있습니다 (M-2005 가드: 재할당 금지).'))

  // workspace 조회 + 정합성
  const { data: ws } = await service
    .from('vendor_workspaces')
    .select('id, org_id, vendor_workspace_id, service:services(vendor)')
    .eq('id', workspaceId)
    .maybeSingle() as { data: { id: string; org_id: string; vendor_workspace_id: string; service: { vendor?: string } | { vendor?: string }[] | null } | null }
  if (!ws) redirect(`${back}?error=` + encodeURIComponent('워크스페이스를 찾을 수 없습니다.'))

  if (ws.org_id !== inv.org_id) {
    redirect(`${back}?error=` + encodeURIComponent('워크스페이스와 청구서의 org 가 일치하지 않습니다.'))
  }
  const wsVendor = Array.isArray(ws.service) ? ws.service[0]?.vendor : ws.service?.vendor
  if (wsVendor && wsVendor !== inv.vendor) {
    redirect(`${back}?error=` + encodeURIComponent(`vendor 불일치 — 청구서=${inv.vendor}, 워크스페이스=${wsVendor}`))
  }

  // UPDATE
  const { error } = await service
    .from('vendor_invoices')
    .update({ workspace_id: ws.id, source_type: 'workspace_invoice' })
    .eq('id', inv.id)
  if (error) {
    redirect(`${back}?error=${encodeURIComponent(actionErrorMessage(error))}`)
  }

  try {
    await service.from('audit_logs').insert({
      org_id: inv.org_id,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'vendor_invoice_workspace_linked',
      target_type: 'vendor_invoice',
      target_id: inv.id,
      visibility: 'internal_only',
      detail: {
        workspace_id: ws.id,
        vendor: inv.vendor,
        external_workspace_id: inv.vendor_workspace_id,
      },
    })
  } catch (e) {
    if (isRedirectError(e)) throw e
    console.error('[linkInvoiceToWorkspace audit]', e)
  }

  revalidatePath(back)
  redirect(`${back}?ok=` + encodeURIComponent('청구서를 워크스페이스에 연결했습니다.'))
}
