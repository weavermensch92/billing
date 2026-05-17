/**
 * Gridge Gateway 워크스페이스 lazy 생성 헬퍼 (M-2051)
 *
 * 서버 라우트 (API 키 발급 / 사용량 기록) 에서 호출.
 * service_role 권한 supabase 클라이언트로 호출해야 함 (RLS bypass).
 *
 * PRD §8.7 참조.
 */

type SBLike = {
  rpc: (
    name: string,
    params?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>
}

/**
 * 고객 org 의 Gridge Gateway 워크스페이스 ID 반환 (없으면 생성).
 *
 * - 멱등: 같은 org 로 호출하면 항상 같은 workspace_id 반환
 * - service_role 클라이언트로만 호출 (RPC `SECURITY DEFINER` + service_role grant)
 */
export async function ensureGatewayWorkspace(
  supabase: SBLike,
  orgId: string,
): Promise<string> {
  const { data, error } = (await supabase.rpc('ensure_gateway_workspace', {
    p_org_id: orgId,
  })) as { data: string | null; error: unknown }

  if (error || !data) {
    throw new Error(
      `ensureGatewayWorkspace failed (org=${orgId}): ${JSON.stringify(error)}`,
    )
  }

  return data
}
