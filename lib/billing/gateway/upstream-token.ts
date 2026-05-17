/**
 * Gridge Gateway Upstream Token Resolver
 *
 * 게이트웨이 라우트가 upstream 벤더 (Anthropic, OpenAI 등) 를 호출할 때
 * 사용할 admin token 을 결정한다.
 *
 * 정책 (PRD §8.7.3):
 *   - vendor_admin_tokens 에서 (vendor, status='active') active token 1개 선택
 *   - 그릿지 self org 의 vendor 워크스페이스에 등록된 admin token 이 후보
 *   - 라운드로빈 / 우선순위 정책은 향후 확장 — 현재는 가장 최근 등록된 것 1건
 *
 * apiKey.workspace_id 파라미터는 미래 확장용 (테넌트별 라우팅). 현재 구현에서는
 * vendor 만으로 단일 active token 을 선택한다.
 *
 * 보안:
 *   - AES-256-GCM 으로 암호화된 token_encrypted 를 복호화 (lib/vendor-api/token-broker)
 *   - 평문 토큰은 메모리에만, 호출 직후 폐기
 *   - 매 호출 시 mark_token_used RPC 로 사용 이력 기록
 */

import { decryptToken } from '@/lib/vendor-api/token-broker'

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => any
}

export interface ResolvedUpstreamToken {
  tokenId: string
  plaintext: string
  vendor: string
  vendorWorkspaceId: string
}

/**
 * upstream 벤더 호출용 admin token 해결.
 *
 * @param supabase service_role 클라이언트
 * @param workspaceId 고객 측 vendor_workspaces.id (게이트웨이 워크스페이스). 현재는 라우팅 미사용 — vendor 만으로 결정.
 * @param vendor 'anthropic' | 'openai' | ...
 * @returns 복호화된 평문 토큰 + 메타. 없으면 null.
 */
export async function resolveUpstreamToken(
  supabase: SBLike,
  workspaceId: string,
  vendor: string,
): Promise<ResolvedUpstreamToken | null> {
  // workspaceId 는 현재 구현에서 라우팅에 사용 안 함.
  // PRD §8.7.3 의 시그니처 호환성 유지용 (향후 테넌트별 라우팅 확장).
  void workspaceId

  const { data } = (await supabase
    .from('vendor_admin_tokens')
    .select('id, token_encrypted, vendor, vendor_workspace_id')
    .eq('vendor', vendor)
    .eq('status', 'active')
    .order('registered_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as {
    data: {
      id: string
      token_encrypted: Buffer | Uint8Array
      vendor: string
      vendor_workspace_id: string
    } | null
  }

  if (!data) return null

  const blob = Buffer.isBuffer(data.token_encrypted)
    ? data.token_encrypted
    : Buffer.from(data.token_encrypted as Uint8Array)
  const plaintext = decryptToken(blob)

  // 사용 이력 기록 (best-effort)
  void supabase.rpc('mark_token_used', {
    p_token_id: data.id,
    p_used_for: 'gridge_gateway',
  })

  return {
    tokenId: data.id,
    plaintext,
    vendor: data.vendor,
    vendorWorkspaceId: data.vendor_workspace_id,
  }
}

/**
 * 특정 vendor_admin_tokens.id 로 upstream 토큰 해결.
 *
 * 사용 케이스: 게이트웨이 상품 (`gridge_api_products.upstream_admin_token_id`)
 * 이 운영자에 의해 명시 지정된 경우 — 상품별 다중 토큰 라우팅 지원 (이슈 #1 결정 (a)).
 *
 * - status='active' 가 아니면 null 반환 (rotated/revoked/expired 토큰은 사용 금지)
 * - vendor 매칭은 호출자가 책임 (상품의 upstream_vendor 와 일치해야 함)
 *
 * @returns 복호화된 평문 + 메타. 없거나 inactive 면 null.
 */
export async function resolveUpstreamTokenById(
  supabase: SBLike,
  tokenId: string,
): Promise<ResolvedUpstreamToken | null> {
  const { data } = (await supabase
    .from('vendor_admin_tokens')
    .select('id, token_encrypted, vendor, vendor_workspace_id, status')
    .eq('id', tokenId)
    .eq('status', 'active')
    .maybeSingle()) as {
    data: {
      id: string
      token_encrypted: Buffer | Uint8Array
      vendor: string
      vendor_workspace_id: string
      status: string
    } | null
  }

  if (!data) return null

  const blob = Buffer.isBuffer(data.token_encrypted)
    ? data.token_encrypted
    : Buffer.from(data.token_encrypted as Uint8Array)
  const plaintext = decryptToken(blob)

  void supabase.rpc('mark_token_used', {
    p_token_id: data.id,
    p_used_for: 'gridge_gateway',
  })

  return {
    tokenId: data.id,
    plaintext,
    vendor: data.vendor,
    vendorWorkspaceId: data.vendor_workspace_id,
  }
}
