import crypto from 'node:crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type AuthenticatedKey = {
  id: string
  org_id: string
  product_id: string
  workspace_id: string
  key_prefix: string
  status: 'active' | 'rotating'
  monthly_spend_cap_krw: number | null
}

export type AuthResult =
  | { ok: true; key: AuthenticatedKey }
  | { ok: false; status: number; error: string }

/**
 * Gridge 게이트웨이 인증.
 *
 * 절차:
 *   1) Authorization: Bearer <plaintext> 헤더 추출
 *   2) prefix (앞 16자) 로 1차 룩업 + status IN ('active','rotating') 필터
 *   3) SHA-256(plaintext) 와 DB 의 key_hash 비교
 *   4) 일치하는 키 반환
 *
 * 보안:
 *   - 평문은 메모리만, 응답에 절대 노출 안 함
 *   - revoked 키는 prefix 인덱스가 제외하므로 빠르게 401
 *   - rotating 키는 active 와 동일하게 허용 (24h grace period)
 */
export async function authenticateGridgeKey(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!authHeader) {
    return { ok: false, status: 401, error: 'Missing Authorization header' }
  }

  const match = authHeader.match(/^Bearer\s+(\S+)$/i)
  if (!match) {
    return { ok: false, status: 401, error: 'Invalid Authorization header format' }
  }

  const plaintext = match[1]
  if (!plaintext.startsWith('gk_live_') || plaintext.length < 16) {
    return { ok: false, status: 401, error: 'Invalid API key format' }
  }

  const prefix = plaintext.slice(0, 16)
  const inputHash = crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex')

  const service = createServiceRoleClient()
  const { data: candidates } = await service
    .from('gridge_api_keys')
    .select('id, org_id, product_id, workspace_id, key_prefix, key_hash, status, monthly_spend_cap_krw')
    .eq('key_prefix', prefix)
    .in('status', ['active', 'rotating'])

  const candidateList = (candidates ?? []) as Array<{
    id: string
    org_id: string
    product_id: string
    workspace_id: string
    key_prefix: string
    key_hash: string
    status: 'active' | 'rotating'
    monthly_spend_cap_krw: number | null
  }>

  // 동일 prefix 가 충돌 가능 (확률 낮음) → 해시 비교로 정확히 매칭
  for (const c of candidateList) {
    // timing-safe 비교
    if (c.key_hash.length === inputHash.length && crypto.timingSafeEqual(Buffer.from(c.key_hash, 'hex'), Buffer.from(inputHash, 'hex'))) {
      return {
        ok: true,
        key: {
          id: c.id,
          org_id: c.org_id,
          product_id: c.product_id,
          workspace_id: c.workspace_id,
          key_prefix: c.key_prefix,
          status: c.status,
          monthly_spend_cap_krw: c.monthly_spend_cap_krw,
        },
      }
    }
  }

  return { ok: false, status: 401, error: 'Invalid API key' }
}

/**
 * key.last_used_at 갱신 (fire-and-forget).
 */
export async function touchKeyUsage(keyId: string, clientIp: string | null) {
  const service = createServiceRoleClient()
  try {
    await service
      .from('gridge_api_keys')
      .update({ last_used_at: new Date().toISOString(), last_used_ip: clientIp })
      .eq('id', keyId)
  } catch {
    /* best-effort */
  }
}
