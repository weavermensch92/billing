'use server'

import crypto from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClientOrRedirect } from '@/lib/supabase/service-role'
import { actionErrorMessage, isRedirectError } from '@/lib/errors'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function sanitize(s: string | null | undefined, max: number): string {
  return (s ?? '').toString().trim().slice(0, max)
}

function num(v: FormDataEntryValue | null, fallback: number | null): number | null {
  if (v === null || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * 평문 키 생성:
 *   gk_live_ + 32자 hex = 총 40자
 *   key_prefix = 앞 16자 ("gk_live_xxxxxxxx")
 *   key_hash   = SHA-256(plaintext) hex
 *
 * 평문은 발급 직후 응답으로만 노출되고 DB에 저장되지 않음.
 */
function generateKey(): { plaintext: string; prefix: string; hash: string } {
  const random = crypto.randomBytes(16).toString('hex') // 32자
  const plaintext = `gk_live_${random}`
  const prefix = plaintext.slice(0, 16)
  const hash = crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex')
  return { plaintext, prefix, hash }
}

async function authorizeSuper() {
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
    redirect('/console/ai-api/keys?error=' + encodeURIComponent(`키 관리는 Super 전용 (현재 역할: ${me.role})`))
  }
  return { supabase, user, me }
}

/**
 * 신규 키 발급.
 *
 * 흐름:
 *   1) Super 검증
 *   2) org / product 존재 + product is_active 검증
 *   3) 평문 생성 → hash + prefix 저장
 *   4) audit_logs 기록
 *   5) /console/ai-api/keys/[id]?reveal=<plaintext> 로 이동 (1회 노출)
 */
export async function issueGridgeKey(formData: FormData) {
  const back = '/console/ai-api/keys/new'
  const { user, me } = await authorizeSuper()

  const orgId = sanitize(formData.get('org_id') as string, 50)
  const productId = sanitize(formData.get('product_id') as string, 50)
  const label = sanitize(formData.get('label') as string, 100)
  const monthlySpendCap = num(formData.get('monthly_spend_cap_krw'), null)

  if (!orgId) {
    redirect(`${back}?error=` + encodeURIComponent('Org 를 선택해 주세요.'))
  }
  if (!productId) {
    redirect(`${back}?error=` + encodeURIComponent('상품을 선택해 주세요.'))
  }
  if (monthlySpendCap !== null && monthlySpendCap < 0) {
    redirect(`${back}?error=` + encodeURIComponent('월 한도는 0 이상이어야 합니다.'))
  }

  const service = createServiceRoleClientOrRedirect(back)

  // Org 존재
  const { data: org } = await service
    .from('orgs')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle()
  if (!org) {
    redirect(`${back}?error=` + encodeURIComponent('Org 를 찾을 수 없습니다.'))
  }

  // Product 존재 + 활성
  const { data: product } = await service
    .from('gridge_api_products')
    .select('id, code, display_name, is_active')
    .eq('id', productId)
    .maybeSingle()
  if (!product) {
    redirect(`${back}?error=` + encodeURIComponent('상품을 찾을 수 없습니다.'))
  }
  if (!product.is_active) {
    redirect(`${back}?error=` + encodeURIComponent(`비활성 상품에는 키 발급 불가: ${product.code}`))
  }

  const { plaintext, prefix, hash } = generateKey()

  let newKeyId: string
  try {
    const { data: inserted, error: insertErr } = await service
      .from('gridge_api_keys')
      .insert({
        org_id: orgId,
        product_id: productId,
        key_prefix: prefix,
        key_hash: hash,
        status: 'active',
        label: label || null,
        monthly_spend_cap_krw: monthlySpendCap,
        issued_by_admin_id: me.id,
      })
      .select('id')
      .single()

    if (insertErr || !inserted) {
      redirect(`${back}?error=` + encodeURIComponent('키 발급 실패: ' + (insertErr?.message ?? 'unknown')))
    }
    newKeyId = inserted.id

    await service.from('audit_logs').insert({
      org_id: orgId,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'gridge_api_key_issued',
      target_type: 'gridge_api_key',
      target_id: newKeyId,
      visibility: 'both',
      detail: {
        product_code: product.code,
        product_name: product.display_name,
        key_prefix: prefix,
        label: label || null,
        monthly_spend_cap_krw: monthlySpendCap,
      },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[issueGridgeKey]', err)
    redirect(`${back}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  revalidatePath('/console/ai-api/keys')
  // 1회 노출 — 평문은 URL 쿼리로만 전달, 페이지에서 표시 후 새로고침 시 사라짐
  redirect(
    `/console/ai-api/keys?reveal_id=${newKeyId}&reveal_key=${encodeURIComponent(plaintext)}`,
  )
}

/**
 * 키 회전 — 신규 키 발급 + 구 키 status='rotating' + auto_revoke_at = +24h.
 * Cron 잡 (PR #5) 이 auto_revoke_at 도래한 키를 자동 revoked 처리.
 *
 * 회전 동안 양쪽 키 모두 인증 통과 (PR #5 라우터에서 active/rotating 둘 다 허용).
 */
export async function rotateGridgeKey(formData: FormData) {
  const keyId = sanitize(formData.get('key_id') as string, 50)
  if (!keyId) {
    redirect('/console/ai-api/keys?error=' + encodeURIComponent('key_id 누락'))
  }

  const back = '/console/ai-api/keys'
  const { user, me } = await authorizeSuper()
  const service = createServiceRoleClientOrRedirect(back)

  const { data: oldKey } = await service
    .from('gridge_api_keys')
    .select('id, org_id, product_id, status, label, monthly_spend_cap_krw, key_prefix')
    .eq('id', keyId)
    .maybeSingle()
  if (!oldKey) {
    redirect(`${back}?error=` + encodeURIComponent('키를 찾을 수 없습니다.'))
  }
  if (oldKey.status !== 'active') {
    redirect(`${back}?error=` + encodeURIComponent(`active 키만 회전 가능 (현재: ${oldKey.status})`))
  }

  const { plaintext, prefix, hash } = generateKey()
  const autoRevokeAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  let newKeyId: string
  try {
    // 1) 신규 키 INSERT
    const { data: inserted, error: insertErr } = await service
      .from('gridge_api_keys')
      .insert({
        org_id: oldKey.org_id,
        product_id: oldKey.product_id,
        key_prefix: prefix,
        key_hash: hash,
        status: 'active',
        label: oldKey.label,
        monthly_spend_cap_krw: oldKey.monthly_spend_cap_krw,
        rotated_from_key_id: oldKey.id,
        issued_by_admin_id: me.id,
      })
      .select('id')
      .single()

    if (insertErr || !inserted) {
      redirect(`${back}?error=` + encodeURIComponent('회전(신규 키 발급) 실패: ' + (insertErr?.message ?? 'unknown')))
    }
    newKeyId = inserted.id

    // 2) 구 키 status='rotating' + auto_revoke_at
    const { error: updErr } = await service
      .from('gridge_api_keys')
      .update({ status: 'rotating', auto_revoke_at: autoRevokeAt })
      .eq('id', oldKey.id)
    if (updErr) {
      redirect(`${back}?error=` + encodeURIComponent('회전(구 키 상태 변경) 실패: ' + updErr.message))
    }

    await service.from('audit_logs').insert({
      org_id: oldKey.org_id,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'gridge_api_key_rotated',
      target_type: 'gridge_api_key',
      target_id: newKeyId,
      visibility: 'both',
      detail: {
        old_key_id: oldKey.id,
        old_prefix: oldKey.key_prefix,
        new_prefix: prefix,
        auto_revoke_at: autoRevokeAt,
      },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[rotateGridgeKey]', err)
    redirect(`${back}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  revalidatePath('/console/ai-api/keys')
  redirect(
    `/console/ai-api/keys?reveal_id=${newKeyId}&reveal_key=${encodeURIComponent(plaintext)}&rotated=1`,
  )
}

/**
 * 키 즉시 폐기 — status='revoked', revoked_at 기록. 라우팅 캐시 invalidation 은 PR #5.
 */
export async function revokeGridgeKey(formData: FormData) {
  const keyId = sanitize(formData.get('key_id') as string, 50)
  const reason = sanitize(formData.get('reason') as string, 200)
  if (!keyId) {
    redirect('/console/ai-api/keys?error=' + encodeURIComponent('key_id 누락'))
  }

  const back = '/console/ai-api/keys'
  const { user, me } = await authorizeSuper()
  const service = createServiceRoleClientOrRedirect(back)

  const { data: target } = await service
    .from('gridge_api_keys')
    .select('id, org_id, key_prefix, status, label')
    .eq('id', keyId)
    .maybeSingle()
  if (!target) {
    redirect(`${back}?error=` + encodeURIComponent('키를 찾을 수 없습니다.'))
  }
  if (target.status === 'revoked') {
    redirect(`${back}?error=` + encodeURIComponent('이미 폐기된 키입니다.'))
  }

  try {
    const { error: updErr } = await service
      .from('gridge_api_keys')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by_admin_id: me.id,
        auto_revoke_at: null,
      })
      .eq('id', keyId)
    if (updErr) {
      redirect(`${back}?error=` + encodeURIComponent('폐기 실패: ' + updErr.message))
    }

    await service.from('audit_logs').insert({
      org_id: target.org_id,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'gridge_api_key_revoked',
      target_type: 'gridge_api_key',
      target_id: keyId,
      visibility: 'both',
      detail: {
        key_prefix: target.key_prefix,
        label: target.label,
        reason: reason || null,
        previous_status: target.status,
      },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[revokeGridgeKey]', err)
    redirect(`${back}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  revalidatePath('/console/ai-api/keys')
  redirect(`${back}?ok=` + encodeURIComponent(`${target.key_prefix}… 폐기 완료`))
}
