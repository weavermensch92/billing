/**
 * Supabase Vault 헬퍼 — 토큰·시크릿 암호화 저장.
 *
 * Supabase 매니지드 인스턴스에는 Vault 가 기본 활성 (vault.secrets / vault.decrypted_secrets).
 * service-role 클라이언트만 접근 가능. anon/authenticated 는 RLS 로 차단.
 *
 * Mock 모드 (NEXT_PUBLIC_MOCK_MODE=true):
 *   in-memory Map 으로 동일 API 제공. process 내에서만 유효 (재시작 시 손실).
 *
 * 사용처:
 *   - billing.slack_integration (bot_token_vault_id / signing_secret_vault_id)
 *   - 향후 다른 외부 통합 (vendor admin token 은 별도 BYTEA + AES 사용 중)
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

// Mock 저장소 (process scope). 동일 모듈 인스턴스에서만 공유.
const mockStore: Map<string, string> = new Map()

function genId(): string {
  // crypto.randomUUID 는 Node 19+ 글로벌. mock 폴백 전용.
  return crypto.randomUUID()
}

/** 시크릿을 Vault 에 저장하고 id 를 반환. name 은 식별용(중복 가능). */
export async function storeSecret(plaintext: string, name: string): Promise<string> {
  if (MOCK_MODE) {
    const id = genId()
    mockStore.set(id, plaintext)
    return id
  }

  const sb = createServiceRoleClient() as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { message: string } | null }>
  }
  const { data, error } = await sb.rpc('create_secret', {
    new_secret: plaintext,
    new_name: name,
  })
  if (error || !data) {
    throw new Error('vault.create_secret 실패: ' + (error?.message ?? 'no id returned'))
  }
  return data
}

/** id 로 평문을 복호화하여 반환. 미존재 시 null. */
export async function readSecret(id: string): Promise<string | null> {
  if (MOCK_MODE) {
    return mockStore.get(id) ?? null
  }

  const sb = createServiceRoleClient() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{ data: { decrypted_secret: string } | null; error: { message: string } | null }>
        }
      }
    }
  }
  // vault.decrypted_secrets 는 view. service-role 만 SELECT 가능.
  const { data, error } = await sb
    .from('vault.decrypted_secrets')
    .select('decrypted_secret')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    throw new Error('vault.decrypted_secrets 조회 실패: ' + error.message)
  }
  return data?.decrypted_secret ?? null
}

/** id 의 시크릿을 새 평문으로 교체. id 는 유지. */
export async function updateSecret(id: string, plaintext: string): Promise<void> {
  if (MOCK_MODE) {
    if (!mockStore.has(id)) throw new Error('vault: id 미존재')
    mockStore.set(id, plaintext)
    return
  }

  const sb = createServiceRoleClient() as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  }
  const { error } = await sb.rpc('update_secret', {
    secret_id: id,
    new_secret: plaintext,
  })
  if (error) {
    throw new Error('vault.update_secret 실패: ' + error.message)
  }
}

/** id 의 시크릿 삭제. */
export async function deleteSecret(id: string): Promise<void> {
  if (MOCK_MODE) {
    mockStore.delete(id)
    return
  }

  const sb = createServiceRoleClient() as unknown as {
    from: (t: string) => {
      delete: () => { eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }> }
    }
  }
  const { error } = await sb.from('vault.secrets').delete().eq('id', id)
  if (error) {
    throw new Error('vault.secrets 삭제 실패: ' + error.message)
  }
}
