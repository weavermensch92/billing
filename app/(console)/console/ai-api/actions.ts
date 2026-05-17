'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClientOrRedirect } from '@/lib/supabase/service-role'
import { actionErrorMessage, isRedirectError } from '@/lib/errors'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

const ALLOWED_TIERS = ['standard', 'pro', 'enterprise'] as const
const ALLOWED_UPSTREAMS = ['anthropic', 'openai', 'google', 'self'] as const

type Tier = (typeof ALLOWED_TIERS)[number]
type Upstream = (typeof ALLOWED_UPSTREAMS)[number]

function sanitize(s: string | null | undefined, max: number): string {
  return (s ?? '').toString().trim().slice(0, max)
}

function num(v: FormDataEntryValue | null, defaultVal: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : defaultVal
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
    redirect('/console/ai-api?error=' + encodeURIComponent(`AI API 관리는 Super 전용 (현재 역할: ${me.role})`))
  }
  return { supabase, user, me }
}

async function lookupGridgeServiceId(service: ReturnType<typeof createServiceRoleClientOrRedirect>): Promise<string> {
  const { data } = await service
    .from('services')
    .select('id')
    .eq('vendor', 'gridge')
    .eq('category', 'api')
    .maybeSingle()
  if (!data?.id) {
    redirect('/console/ai-api?error=' + encodeURIComponent("Gridge 서비스 카탈로그 행이 없습니다. seed/01_services.sql 확인."))
  }
  return data.id as string
}

/**
 * 신규 상품 등록.
 *
 * 검증:
 *   - code: 고유 식별자 (영문/숫자/하이픈, 3~50자)
 *   - tier: standard|pro|enterprise
 *   - upstream_vendor: anthropic|openai|google|self
 *   - 단가: 0 이상 NUMERIC
 *   - rate_limit_rpm: 1 이상
 */
export async function createProduct(formData: FormData) {
  const back = '/console/ai-api/products/new'
  const { user, me } = await authorizeSuper()

  const code = sanitize(formData.get('code') as string, 50)
  const tier = sanitize(formData.get('tier') as string, 20) as Tier
  const displayName = sanitize(formData.get('display_name') as string, 100)
  const description = sanitize(formData.get('description') as string, 1000)
  const upstreamVendor = sanitize(formData.get('upstream_vendor') as string, 20) as Upstream
  const upstreamModel = sanitize(formData.get('upstream_model') as string, 100)
  const upstreamTokenId = sanitize(formData.get('upstream_admin_token_id') as string, 50) || null
  const inputPrice = num(formData.get('input_price_per_1k_krw'), -1)
  const outputPrice = num(formData.get('output_price_per_1k_krw'), -1)
  const minCharge = Math.max(0, Math.min(1_000_000, num(formData.get('min_charge_krw'), 0)))
  const rateLimit = Math.max(1, Math.min(10_000, num(formData.get('rate_limit_rpm'), 60)))
  const dailyTokenCapRaw = num(formData.get('daily_token_cap'), -1)
  const dailyTokenCap = dailyTokenCapRaw < 0 ? null : dailyTokenCapRaw
  const isActive = formData.get('is_active') === 'on'

  if (!/^[a-z0-9-]{3,50}$/i.test(code)) {
    redirect(`${back}?error=` + encodeURIComponent('상품 코드는 영문/숫자/하이픈 3~50자 (예: gridge-ai-v1).'))
  }
  if (!ALLOWED_TIERS.includes(tier)) {
    redirect(`${back}?error=` + encodeURIComponent('등급 선택이 올바르지 않습니다.'))
  }
  if (displayName.length < 2) {
    redirect(`${back}?error=` + encodeURIComponent('상품명을 2자 이상 입력해 주세요.'))
  }
  if (!ALLOWED_UPSTREAMS.includes(upstreamVendor)) {
    redirect(`${back}?error=` + encodeURIComponent('Upstream 벤더 선택이 올바르지 않습니다.'))
  }
  if (upstreamModel.length < 2) {
    redirect(`${back}?error=` + encodeURIComponent('Upstream 모델명을 입력해 주세요 (예: claude-sonnet-4-5).'))
  }
  if (inputPrice < 0 || outputPrice < 0) {
    redirect(`${back}?error=` + encodeURIComponent('단가는 0 이상 숫자여야 합니다.'))
  }

  const service = createServiceRoleClientOrRedirect(back)
  const serviceId = await lookupGridgeServiceId(service)

  // code 중복 체크
  const { data: dup } = await service
    .from('gridge_api_products')
    .select('id')
    .eq('code', code)
    .maybeSingle()
  if (dup) {
    redirect(`${back}?error=` + encodeURIComponent(`이미 사용 중인 상품 코드: ${code}`))
  }

  let newId: string
  try {
    const { data: inserted, error: insertErr } = await service
      .from('gridge_api_products')
      .insert({
        service_id: serviceId,
        code,
        tier,
        display_name: displayName,
        description: description || null,
        upstream_vendor: upstreamVendor,
        upstream_model: upstreamModel,
        upstream_admin_token_id: upstreamTokenId,
        input_price_per_1k_krw: inputPrice,
        output_price_per_1k_krw: outputPrice,
        min_charge_krw: minCharge,
        rate_limit_rpm: rateLimit,
        daily_token_cap: dailyTokenCap,
        is_active: isActive,
        released_at: isActive ? new Date().toISOString() : null,
      })
      .select('id')
      .single()

    if (insertErr || !inserted) {
      redirect(`${back}?error=` + encodeURIComponent('상품 등록 실패: ' + (insertErr?.message ?? 'unknown')))
    }
    newId = inserted.id

    await service.from('audit_logs').insert({
      org_id: null,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'gridge_api_product_created',
      target_type: 'gridge_api_product',
      target_id: newId,
      visibility: 'internal_only',
      detail: { code, tier, upstream_vendor: upstreamVendor, upstream_model: upstreamModel, input_price: inputPrice, output_price: outputPrice },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[createProduct]', err)
    redirect(`${back}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  revalidatePath('/console/ai-api')
  redirect(`/console/ai-api/products/${newId}?ok=` + encodeURIComponent(`상품 등록 완료: ${displayName}`))
}

/**
 * 상품 수정. display_name / description / 단가 / rate_limit / daily_token_cap 변경.
 * code / tier / upstream_vendor / upstream_model 은 회계 정합성상 변경 금지 (필요 시 신규 코드로 발행).
 */
export async function updateProduct(formData: FormData) {
  const productId = sanitize(formData.get('product_id') as string, 50)
  const back = `/console/ai-api/products/${productId}`
  if (!productId) {
    redirect('/console/ai-api?error=' + encodeURIComponent('product_id 누락'))
  }

  const { user, me } = await authorizeSuper()

  const displayName = sanitize(formData.get('display_name') as string, 100)
  const description = sanitize(formData.get('description') as string, 1000)
  const upstreamTokenId = sanitize(formData.get('upstream_admin_token_id') as string, 50) || null
  const inputPrice = num(formData.get('input_price_per_1k_krw'), -1)
  const outputPrice = num(formData.get('output_price_per_1k_krw'), -1)
  const minCharge = Math.max(0, Math.min(1_000_000, num(formData.get('min_charge_krw'), 0)))
  const rateLimit = Math.max(1, Math.min(10_000, num(formData.get('rate_limit_rpm'), 60)))
  const dailyTokenCapRaw = num(formData.get('daily_token_cap'), -1)
  const dailyTokenCap = dailyTokenCapRaw < 0 ? null : dailyTokenCapRaw

  // M-2057: 가격 정책 분리 — upstream USD / 환율 / markup
  const upstreamInputUsd = Math.max(0, num(formData.get('upstream_input_price_per_1k_usd'), 0))
  const upstreamOutputUsd = Math.max(0, num(formData.get('upstream_output_price_per_1k_usd'), 0))
  const fxRateRaw = formData.get('fx_rate_krw_per_usd') as string | null
  const fxRate = fxRateRaw && fxRateRaw.trim() !== '' ? Math.max(0, Number(fxRateRaw)) : null
  const markupPct = Math.max(0, Math.min(1000, num(formData.get('markup_pct'), 0)))
  const markupFixedKrw = Math.max(0, num(formData.get('markup_fixed_krw'), 0))

  if (displayName.length < 2) {
    redirect(`${back}?error=` + encodeURIComponent('상품명을 2자 이상 입력해 주세요.'))
  }
  if (inputPrice < 0 || outputPrice < 0) {
    redirect(`${back}?error=` + encodeURIComponent('단가는 0 이상 숫자여야 합니다.'))
  }

  const service = createServiceRoleClientOrRedirect(back)

  const { data: before } = await service
    .from('gridge_api_products')
    .select('id, code, display_name, input_price_per_1k_krw, output_price_per_1k_krw, upstream_input_price_per_1k_usd, upstream_output_price_per_1k_usd, fx_rate_krw_per_usd, markup_pct, markup_fixed_krw, rate_limit_rpm, daily_token_cap')
    .eq('id', productId)
    .maybeSingle()
  if (!before) {
    redirect('/console/ai-api?error=' + encodeURIComponent('상품을 찾을 수 없습니다.'))
  }

  try {
    const { error: updErr } = await service
      .from('gridge_api_products')
      .update({
        display_name: displayName,
        description: description || null,
        upstream_admin_token_id: upstreamTokenId,
        input_price_per_1k_krw: inputPrice,
        output_price_per_1k_krw: outputPrice,
        upstream_input_price_per_1k_usd: upstreamInputUsd,
        upstream_output_price_per_1k_usd: upstreamOutputUsd,
        fx_rate_krw_per_usd: fxRate,
        markup_pct: markupPct,
        markup_fixed_krw: markupFixedKrw,
        pricing_updated_at: new Date().toISOString(),
        min_charge_krw: minCharge,
        rate_limit_rpm: rateLimit,
        daily_token_cap: dailyTokenCap,
      })
      .eq('id', productId)
    if (updErr) {
      redirect(`${back}?error=` + encodeURIComponent('상품 수정 실패: ' + updErr.message))
    }

    await service.from('audit_logs').insert({
      org_id: null,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: 'gridge_api_product_updated',
      target_type: 'gridge_api_product',
      target_id: productId,
      visibility: 'internal_only',
      detail: {
        code: before.code,
        before: {
          display_name: before.display_name,
          input_price: before.input_price_per_1k_krw,
          output_price: before.output_price_per_1k_krw,
          upstream_input_usd: before.upstream_input_price_per_1k_usd,
          upstream_output_usd: before.upstream_output_price_per_1k_usd,
          fx_rate: before.fx_rate_krw_per_usd,
          markup_pct: before.markup_pct,
          markup_fixed_krw: before.markup_fixed_krw,
          rate_limit_rpm: before.rate_limit_rpm,
        },
        after: {
          display_name: displayName,
          input_price: inputPrice,
          output_price: outputPrice,
          upstream_input_usd: upstreamInputUsd,
          upstream_output_usd: upstreamOutputUsd,
          fx_rate: fxRate,
          markup_pct: markupPct,
          markup_fixed_krw: markupFixedKrw,
          rate_limit_rpm: rateLimit,
        },
      },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[updateProduct]', err)
    redirect(`${back}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  revalidatePath('/console/ai-api')
  revalidatePath(back)
  redirect(`${back}?ok=` + encodeURIComponent('상품 수정 완료'))
}

/**
 * 상품 활성/비활성 토글. 비활성 시 deprecated_at 기록 — 고객 read 정책에서 제외.
 * Note: 이미 발급된 키는 그대로 사용 가능 (라우팅은 PR #5 에서 결정).
 */
export async function toggleProductActive(formData: FormData) {
  const productId = sanitize(formData.get('product_id') as string, 50)
  const nextActiveRaw = String(formData.get('next_active') ?? '')
  const nextActive = nextActiveRaw === 'true'

  if (!productId || (nextActiveRaw !== 'true' && nextActiveRaw !== 'false')) {
    redirect('/console/ai-api?error=' + encodeURIComponent('파라미터 누락'))
  }

  const back = `/console/ai-api/products/${productId}`
  const { user, me } = await authorizeSuper()
  const service = createServiceRoleClientOrRedirect(back)

  const { data: target } = await service
    .from('gridge_api_products')
    .select('id, code, is_active, display_name')
    .eq('id', productId)
    .maybeSingle()
  if (!target) {
    redirect('/console/ai-api?error=' + encodeURIComponent('상품을 찾을 수 없습니다.'))
  }
  if (target.is_active === nextActive) {
    redirect(`${back}?ok=` + encodeURIComponent('상태 변경 없음'))
  }

  try {
    const updateRow: Record<string, unknown> = { is_active: nextActive }
    if (nextActive) {
      updateRow.released_at = new Date().toISOString()
      updateRow.deprecated_at = null
    } else {
      updateRow.deprecated_at = new Date().toISOString()
    }

    const { error: updErr } = await service
      .from('gridge_api_products')
      .update(updateRow)
      .eq('id', productId)
    if (updErr) {
      redirect(`${back}?error=` + encodeURIComponent('상태 변경 실패: ' + updErr.message))
    }

    await service.from('audit_logs').insert({
      org_id: null,
      actor_type: 'admin',
      actor_id: me.id,
      actor_email: user.email ?? null,
      action: nextActive ? 'gridge_api_product_activated' : 'gridge_api_product_deactivated',
      target_type: 'gridge_api_product',
      target_id: productId,
      visibility: 'internal_only',
      detail: { code: target.code, display_name: target.display_name },
    })
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[toggleProductActive]', err)
    redirect(`${back}?error=${encodeURIComponent(actionErrorMessage(err))}`)
  }

  revalidatePath('/console/ai-api')
  revalidatePath(back)
  redirect(`${back}?ok=` + encodeURIComponent(nextActive ? '상품 활성화' : '상품 비활성화'))
}
