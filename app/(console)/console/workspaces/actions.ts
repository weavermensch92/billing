'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function sanitize(s: string, max = 200): string {
  return (s ?? '').toString().trim().slice(0, max)
}

async function authorizeSuper() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: admin } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!admin) redirect('/console/login')
  if (admin.role !== 'super') {
    redirect('/console/workspaces?error=' + encodeURIComponent(`Super 권한 필요 (현재: ${admin.role})`))
  }
  return { supabase, user, admin }
}

export async function createWorkspace(formData: FormData) {
  const { supabase, user, admin } = await authorizeSuper()

  const org_id        = sanitize(formData.get('org_id') as string, 50)
  const service_id    = sanitize(formData.get('service_id') as string, 50)
  const vendor_workspace_id = sanitize(formData.get('vendor_workspace_id') as string, 200)
  const display_name  = sanitize(formData.get('display_name') as string, 200)
  const status        = sanitize(formData.get('status') as string, 20) as 'active' | 'suspended' | 'terminated'

  const backTo = '/console/workspaces/new'

  if (!org_id)             redirect(`${backTo}?error=` + encodeURIComponent('Org를 선택하세요.'))
  if (!service_id)         redirect(`${backTo}?error=` + encodeURIComponent('서비스를 선택하세요.'))
  if (!vendor_workspace_id) redirect(`${backTo}?error=` + encodeURIComponent('Workspace ID를 입력하세요.'))
  if (!display_name)       redirect(`${backTo}?error=` + encodeURIComponent('표시명을 입력하세요.'))
  if (!['active', 'suspended', 'terminated'].includes(status)) {
    redirect(`${backTo}?error=` + encodeURIComponent('올바른 상태를 선택하세요.'))
  }

  // 중복 체크
  const { data: dup } = await supabase
    .from('vendor_workspaces')
    .select('id')
    .eq('service_id', service_id)
    .eq('vendor_workspace_id', vendor_workspace_id)
    .maybeSingle()

  if (dup) {
    redirect(`${backTo}?error=` + encodeURIComponent('이미 동일한 Workspace ID가 해당 서비스에 등록되어 있습니다.'))
  }

  const { data: ws, error } = await supabase
    .from('vendor_workspaces')
    .insert({ org_id, service_id, vendor_workspace_id, display_name, status })
    .select('id')
    .single()

  if (error || !ws) {
    redirect(`${backTo}?error=` + encodeURIComponent('등록 실패: ' + (error?.message ?? 'unknown')))
  }

  await supabase.from('audit_logs').insert({
    org_id,
    actor_type: 'admin',
    actor_id: admin.id,
    actor_email: user.email ?? null,
    action: 'workspace_created',
    target_type: 'vendor_workspace',
    target_id: ws.id,
    visibility: 'internal_only',
    detail: { service_id, vendor_workspace_id, display_name, status },
  })

  revalidatePath('/console/workspaces')
  redirect('/console/workspaces?created=' + encodeURIComponent(display_name))
}

export async function updateWorkspaceStatus(formData: FormData) {
  const { supabase, user, admin } = await authorizeSuper()

  const workspace_id = sanitize(formData.get('workspace_id') as string, 50)
  const status = sanitize(formData.get('status') as string, 20) as 'active' | 'suspended' | 'terminated'

  if (!['active', 'suspended', 'terminated'].includes(status)) {
    redirect('/console/workspaces?error=' + encodeURIComponent('올바른 상태를 선택하세요.'))
  }

  const { data: ws, error } = await supabase
    .from('vendor_workspaces')
    .update({ status })
    .eq('id', workspace_id)
    .select('id, org_id, display_name')
    .single()

  if (error || !ws) {
    redirect('/console/workspaces?error=' + encodeURIComponent('상태 변경 실패: ' + (error?.message ?? 'unknown')))
  }

  await supabase.from('audit_logs').insert({
    org_id: ws.org_id,
    actor_type: 'admin',
    actor_id: admin.id,
    actor_email: user.email ?? null,
    action: 'workspace_status_changed',
    target_type: 'vendor_workspace',
    target_id: ws.id,
    visibility: 'internal_only',
    detail: { status, display_name: ws.display_name },
  })

  revalidatePath('/console/workspaces')
  redirect('/console/workspaces?ok=' + encodeURIComponent(`${ws.display_name} 상태 변경 완료`))
}
