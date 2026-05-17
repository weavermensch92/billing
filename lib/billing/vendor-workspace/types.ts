/**
 * vendor_workspaces / workspace_members 타입 정의 (M-2001, M-2002)
 *
 * PRD §8.1, §8.2.
 */

export type VendorWorkspaceStatus = 'active' | 'suspended' | 'terminated'

export interface VendorWorkspace {
  id: string
  org_id: string
  service_id: string
  vendor_workspace_id: string
  display_name: string
  status: VendorWorkspaceStatus
  created_at: string
  updated_at: string
}

export type VendorMemberRole = 'admin' | 'member' | 'viewer'

export interface WorkspaceMember {
  id: string
  workspace_id: string
  account_id: string
  member_id: string
  vendor_member_role: VendorMemberRole
  joined_at: string
  left_at: string | null
}

/** 콘솔 목록용: vendor / service 메타 + 멤버 수 조인 결과 */
export interface VendorWorkspaceListRow extends VendorWorkspace {
  service_name: string
  service_vendor: string
  active_member_count: number
}
