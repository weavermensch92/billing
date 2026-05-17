/**
 * vendor_workspaces / workspace_members manager (M-2001, M-2002)
 *
 * PRD §8.1, §8.2. 본 PR 에서는 read 함수 위주 — 콘솔 목록에서 호출.
 * write 함수(createWorkspace / addMember 등) 는 다음 PR (M-2003 accounts.kind /
 * M-2004 virtual_cards.workspace_id) 에서 구체 흐름이 정해진 뒤 라우트와 함께 활성화.
 */

import type {
  VendorWorkspace,
  VendorWorkspaceListRow,
  WorkspaceMember,
  VendorMemberRole,
} from './types'

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

/** 단건 조회 */
export async function getWorkspace(
  supabase: SBLike,
  id: string,
): Promise<VendorWorkspace | null> {
  const { data } = (await supabase
    .from('vendor_workspaces')
    .select('*')
    .eq('id', id)
    .maybeSingle()) as { data: VendorWorkspace | null }
  return data
}

/** 조직별 워크스페이스 목록 (서비스 메타 + 활성 멤버 수 조인) */
export async function listWorkspacesByOrg(
  supabase: SBLike,
  orgId: string,
): Promise<VendorWorkspaceListRow[]> {
  const { data, error } = (await supabase
    .from('vendor_workspaces')
    .select(
      `
      id, org_id, service_id, vendor_workspace_id, display_name, status,
      created_at, updated_at,
      service:services!inner ( name, vendor ),
      members:workspace_members ( id, left_at )
      `,
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })) as {
    data:
      | Array<
          VendorWorkspace & {
            service: { name: string; vendor: string }
            members: Array<{ id: string; left_at: string | null }>
          }
        >
      | null
    error: unknown
  }

  if (error) {
    throw new Error(`listWorkspacesByOrg failed: ${JSON.stringify(error)}`)
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    org_id: row.org_id,
    service_id: row.service_id,
    vendor_workspace_id: row.vendor_workspace_id,
    display_name: row.display_name,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    service_name: row.service.name,
    service_vendor: row.service.vendor,
    active_member_count: row.members.filter((m) => m.left_at === null).length,
  }))
}

/** 콘솔 — 전체 워크스페이스 목록 (admin 권한 필요) */
export async function listAllWorkspaces(
  supabase: SBLike,
  opts?: { status?: VendorWorkspace['status']; serviceId?: string },
): Promise<VendorWorkspaceListRow[]> {
  let q = supabase
    .from('vendor_workspaces')
    .select(
      `
      id, org_id, service_id, vendor_workspace_id, display_name, status,
      created_at, updated_at,
      service:services!inner ( name, vendor ),
      members:workspace_members ( id, left_at )
      `,
    )
    .order('created_at', { ascending: false })

  if (opts?.status) q = q.eq('status', opts.status)
  if (opts?.serviceId) q = q.eq('service_id', opts.serviceId)

  const { data, error } = (await q) as {
    data:
      | Array<
          VendorWorkspace & {
            service: { name: string; vendor: string }
            members: Array<{ id: string; left_at: string | null }>
          }
        >
      | null
    error: unknown
  }

  if (error) {
    throw new Error(`listAllWorkspaces failed: ${JSON.stringify(error)}`)
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    org_id: row.org_id,
    service_id: row.service_id,
    vendor_workspace_id: row.vendor_workspace_id,
    display_name: row.display_name,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    service_name: row.service.name,
    service_vendor: row.service.vendor,
    active_member_count: row.members.filter((m) => m.left_at === null).length,
  }))
}

/** 워크스페이스 멤버 목록 (left_at IS NULL 만) */
export async function listMembers(
  supabase: SBLike,
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  const { data, error } = (await supabase
    .from('workspace_members')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('left_at', null)
    .order('joined_at', { ascending: true })) as {
    data: WorkspaceMember[] | null
    error: unknown
  }

  if (error) {
    throw new Error(`listMembers failed: ${JSON.stringify(error)}`)
  }

  return data ?? []
}

// ─── 아래는 후속 PR 대비 스켈레톤 (Super 권한 RLS 통과 필요) ───

export interface CreateWorkspaceInput {
  orgId: string
  serviceId: string
  vendorWorkspaceId: string
  displayName: string
}

export async function createWorkspace(
  supabase: SBLike,
  input: CreateWorkspaceInput,
): Promise<VendorWorkspace> {
  const { data, error } = (await supabase
    .from('vendor_workspaces')
    .insert({
      org_id: input.orgId,
      service_id: input.serviceId,
      vendor_workspace_id: input.vendorWorkspaceId,
      display_name: input.displayName,
      status: 'active',
    })
    .select('*')
    .single()) as { data: VendorWorkspace | null; error: unknown }

  if (error || !data) {
    throw new Error(`createWorkspace failed: ${JSON.stringify(error)}`)
  }
  return data
}

export async function addMember(
  supabase: SBLike,
  params: {
    workspaceId: string
    accountId: string
    memberId: string
    role?: VendorMemberRole
  },
): Promise<WorkspaceMember> {
  const { data, error } = (await supabase
    .from('workspace_members')
    .insert({
      workspace_id: params.workspaceId,
      account_id: params.accountId,
      member_id: params.memberId,
      vendor_member_role: params.role ?? 'member',
    })
    .select('*')
    .single()) as { data: WorkspaceMember | null; error: unknown }

  if (error || !data) {
    throw new Error(`addMember failed: ${JSON.stringify(error)}`)
  }
  return data
}

export async function removeMember(
  supabase: SBLike,
  workspaceId: string,
  accountId: string,
): Promise<void> {
  const { error } = (await supabase
    .from('workspace_members')
    .update({ left_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('account_id', accountId)
    .is('left_at', null)) as { error: unknown }

  if (error) {
    throw new Error(`removeMember failed: ${JSON.stringify(error)}`)
  }
}
