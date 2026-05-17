/**
 * Vendor Admin Token Broker — 1회 수동 등록 토큰 암호화 보관·조회
 *
 * Q4-1 A: 카드 교체 직후 고객 어드민이 벤더 콘솔에서 admin token 생성 후
 *         그릿지 페이지에 붙여넣기. 그릿지는 AES-256-GCM으로 암호화 보관.
 *         DB에 평문 토큰 절대 저장 X.
 *
 * 참조:
 *   - vendor_admin_tokens (M-1006) BYTEA token_encrypted
 *   - token_prefix (첫 8자) UI 마스킹용
 *   - mark_token_used / rotate_vendor_token / expire_vendor_tokens RPC
 *
 * Env:
 *   VENDOR_TOKEN_ENC_KEY  (base64 32 bytes — AES-256 키)
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

type SBLike = {
  from: (t: string) => any
  rpc: (name: string, params?: Record<string, unknown>) => any
}

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

export interface RegisterTokenInput {
  orgId: string
  vendor: 'anthropic' | 'openai' | 'cursor' | string
  vendorWorkspaceId: string
  tokenLabel: string
  plaintextToken: string
  tokenMeta?: Record<string, unknown>
  expiresAt?: string
  registeredByMemberId?: string
  registeredBySuperAdminId?: string
}

export interface RegisterTokenResult {
  tokenId: string
  tokenPrefix: string
}

function getKey(): Buffer {
  const k = process.env.VENDOR_TOKEN_ENC_KEY
  if (!k) throw new Error('VENDOR_TOKEN_ENC_KEY env missing (base64 32 bytes required)')
  const buf = Buffer.from(k, 'base64')
  if (buf.length !== 32) throw new Error('VENDOR_TOKEN_ENC_KEY must decode to 32 bytes')
  return buf
}

/** AES-256-GCM 암호화. 결과: iv(12) || ciphertext || tag(16) */
export function encryptToken(plaintext: string): Buffer {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ct, tag])
}

export function decryptToken(blob: Buffer): string {
  const key = getKey()
  const iv = blob.subarray(0, IV_BYTES)
  const tag = blob.subarray(blob.length - TAG_BYTES)
  const ct = blob.subarray(IV_BYTES, blob.length - TAG_BYTES)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

function prefixOf(plaintext: string, n = 8): string {
  return plaintext.slice(0, n)
}

/**
 * 신규 토큰 등록.
 * 같은 (org, vendor, workspace)에 active 토큰 있으면 rotate_vendor_token 으로 회전.
 */
export async function registerVendorToken(
  supabase: SBLike,
  input: RegisterTokenInput,
): Promise<RegisterTokenResult> {
  const encrypted = encryptToken(input.plaintextToken)
  const tokenHash = hashToken(input.plaintextToken)
  const tokenPrefix = prefixOf(input.plaintextToken)

  // 기존 active 토큰 조회
  const { data: existing } = (await supabase
    .from('vendor_admin_tokens')
    .select('id')
    .eq('org_id', input.orgId)
    .eq('vendor', input.vendor)
    .eq('vendor_workspace_id', input.vendorWorkspaceId)
    .eq('status', 'active')
    .maybeSingle()) as { data: { id: string } | null }

  // 신규 INSERT (DB의 partial unique가 중복 차단하므로, 기존 있으면 먼저 rotate)
  const { data: inserted, error } = (await supabase
    .from('vendor_admin_tokens')
    .insert({
      org_id: input.orgId,
      vendor: input.vendor,
      vendor_workspace_id: input.vendorWorkspaceId,
      token_label: input.tokenLabel,
      token_encrypted: encrypted,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      token_meta: input.tokenMeta ?? {},
      expires_at: input.expiresAt ?? null,
      status: existing ? 'active' : 'active', // 둘 다 active, 회전 단계에서 기존 토큰 status 변경
      registered_by: input.registeredBySuperAdminId ?? null,
      registered_by_member_id: input.registeredByMemberId ?? null,
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown }

  if (error || !inserted) {
    throw new Error(`register vendor_admin_token failed: ${JSON.stringify(error)}`)
  }

  if (existing) {
    const { error: rotErr } = await supabase.rpc('rotate_vendor_token', {
      p_old_token_id: existing.id,
      p_new_token_id: inserted.id,
      p_rotated_by: input.registeredBySuperAdminId ?? null,
    })
    if (rotErr) {
      throw new Error(`rotate_vendor_token failed: ${JSON.stringify(rotErr)}`)
    }
  }

  return { tokenId: inserted.id, tokenPrefix }
}

/** 토큰 사용 (벤더 API 호출 시 사용). 사용 직후 mark_token_used. */
export async function getDecryptedToken(
  supabase: SBLike,
  params: { orgId: string; vendor: string; vendorWorkspaceId: string; usedFor: string },
): Promise<{ token: string; tokenId: string } | null> {
  const { data } = (await supabase
    .from('vendor_admin_tokens')
    .select('id, token_encrypted')
    .eq('org_id', params.orgId)
    .eq('vendor', params.vendor)
    .eq('vendor_workspace_id', params.vendorWorkspaceId)
    .eq('status', 'active')
    .maybeSingle()) as { data: { id: string; token_encrypted: Buffer | Uint8Array } | null }

  if (!data) return null

  const blob = Buffer.isBuffer(data.token_encrypted)
    ? data.token_encrypted
    : Buffer.from(data.token_encrypted as Uint8Array)
  const plaintext = decryptToken(blob)

  // mark used (non-blocking은 호출자가 결정. 여기선 await)
  await supabase.rpc('mark_token_used', {
    p_token_id: data.id,
    p_used_for: params.usedFor,
  })

  return { token: plaintext, tokenId: data.id }
}

export async function revokeVendorToken(
  supabase: SBLike,
  tokenId: string,
  revokedBy: string,
  reason: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('vendor_admin_tokens')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      revoked_by: revokedBy,
      revoked_reason: reason,
    })
    .eq('id', tokenId)
    .eq('status', 'active')
  return !error
}

/** pg_cron: 만료 토큰 expired 전이 */
export async function expireVendorTokens(supabase: SBLike): Promise<number> {
  const { data, error } = await supabase.rpc('expire_vendor_tokens')
  if (error) throw new Error(`expire_vendor_tokens failed: ${JSON.stringify(error)}`)
  return Number(data ?? 0)
}
