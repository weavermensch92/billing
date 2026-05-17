/**
 * Gridge Gateway 워크스페이스 헬퍼 단위 테스트 (M-2051)
 */

import { describe, it, expect, vi } from 'vitest'
import { ensureGatewayWorkspace } from '@/lib/billing/gateway/workspace'
import {
  GRIDGE_GATEWAY_SERVICE_ID,
  GRIDGE_SELF_ORG_ID,
  GRIDGE_GATEWAY_CATEGORY,
} from '@/lib/billing/gateway/constants'

describe('constants', () => {
  it('GRIDGE_GATEWAY_SERVICE_ID is fixed UUID 5101', () => {
    expect(GRIDGE_GATEWAY_SERVICE_ID).toBe('00000000-0000-0000-0000-000000005101')
  })

  it('GRIDGE_SELF_ORG_ID is fixed UUID 0001', () => {
    expect(GRIDGE_SELF_ORG_ID).toBe('00000000-0000-0000-0000-000000000001')
  })

  it('GRIDGE_GATEWAY_CATEGORY = gridge_gateway', () => {
    expect(GRIDGE_GATEWAY_CATEGORY).toBe('gridge_gateway')
  })
})

describe('ensureGatewayWorkspace', () => {
  it('returns workspace_id from rpc', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: 'ws-1234',
      error: null,
    })
    const sb = { rpc } as any

    const result = await ensureGatewayWorkspace(sb, 'org-abc')

    expect(rpc).toHaveBeenCalledWith('ensure_gateway_workspace', {
      p_org_id: 'org-abc',
    })
    expect(result).toBe('ws-1234')
  })

  it('throws when rpc returns error', async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'permission denied' },
      }),
    } as any

    await expect(ensureGatewayWorkspace(sb, 'org-x')).rejects.toThrow(
      /ensureGatewayWorkspace failed/,
    )
  })

  it('throws when rpc returns null data', async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any

    await expect(ensureGatewayWorkspace(sb, 'org-x')).rejects.toThrow(
      /ensureGatewayWorkspace failed/,
    )
  })
})
