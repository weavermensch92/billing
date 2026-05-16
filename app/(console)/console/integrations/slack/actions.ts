'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { storeSecret, readSecret, updateSecret } from '@/lib/vault/secrets'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

const PAGE = '/console/integrations/slack'
const CONFIG_KEY = 'global'

function sanitize(s: string | null | undefined, max: number): string {
  return (s ?? '').toString().trim().slice(0, max)
}

/** Super 권한 검증 + admin row 반환. 실패 시 redirect. */
async function authorizeSuper() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: me } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('email', user.email ?? '')
    .eq('is_active', true)
    .maybeSingle()
  if (!me) redirect('/console/login')

  if (me.role !== 'super') {
    redirect(`${PAGE}?error=` + encodeURIComponent(`Slack 설정은 Super 권한 필요 (현재 역할: ${me.role})`))
  }

  return { supabase, user, me }
}

/** Slack auth.test 호출 → 워크스페이스 메타 반환. 실패 시 에러 객체. */
async function slackAuthTest(botToken: string): Promise<
  | { ok: true; team_id: string; team: string; user_id: string; user: string }
  | { ok: false; error: string }
> {
  const res = await fetch('https://slack.com/api/auth.test', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })
  const body = (await res.json()) as {
    ok: boolean
    error?: string
    team_id?: string
    team?: string
    user_id?: string
    user?: string
  }
  if (!body.ok) {
    return { ok: false, error: body.error ?? 'unknown' }
  }
  return {
    ok: true,
    team_id: body.team_id ?? '',
    team: body.team ?? '',
    user_id: body.user_id ?? '',
    user: body.user ?? '',
  }
}

/**
 * 설정 저장.
 *   - 토큰류는 폼에 비어있으면 기존 vault id 유지, 입력 있으면 신규 생성 (또는 update)
 *   - 채널 매핑은 평문 컬럼으로 저장
 *   - run_test=on 이면 저장 직후 auth.test 호출 → workspace 메타 캐시 + is_active=true
 *     실패 시 is_active=false, last_test_error 기록 (롤백 없이 정보만 갱신)
 */
export async function saveSlackConfig(formData: FormData) {
  const { user, me } = await authorizeSuper()

  const botTokenInput = sanitize(formData.get('bot_token') as string, 200)
  const signingSecretInput = sanitize(formData.get('signing_secret') as string, 200)
  const taxChId = sanitize(formData.get('tax_invoice_channel_id') as string, 50)
  const taxChName = sanitize(formData.get('tax_invoice_channel_name') as string, 100).replace(/^#/, '')
  const payChId = sanitize(formData.get('payment_alerts_channel_id') as string, 50)
  const payChName = sanitize(formData.get('payment_alerts_channel_name') as string, 100).replace(/^#/, '')
  const runTest = formData.get('run_test') === 'on'

  // 토큰 형식 가벼운 검증 (전부 통과시키지 않음)
  if (botTokenInput && !/^xox[abprs]-/.test(botTokenInput)) {
    redirect(`${PAGE}?error=` + encodeURIComponent('Bot Token 형식이 올바르지 않습니다 (xoxb-/xoxa-/... 로 시작)'))
  }
  if (botTokenInput && botTokenInput.length < 20) {
    redirect(`${PAGE}?error=` + encodeURIComponent('Bot Token 이 너무 짧습니다.'))
  }
  if (signingSecretInput && signingSecretInput.length < 16) {
    redirect(`${PAGE}?error=` + encodeURIComponent('Signing Secret 이 너무 짧습니다.'))
  }

  const service = createServiceRoleClient()

  // 현재 행 조회 (없으면 INSERT, 있으면 UPDATE)
  const { data: existing } = await service
    .from('slack_integration')
    .select('config_key, bot_token_vault_id, signing_secret_vault_id')
    .eq('config_key', CONFIG_KEY)
    .maybeSingle()

  // 토큰 vault id 결정 (입력 있으면 update or create)
  let botTokenVaultId: string | null = existing?.bot_token_vault_id ?? null
  if (botTokenInput) {
    if (botTokenVaultId) {
      await updateSecret(botTokenVaultId, botTokenInput)
    } else {
      botTokenVaultId = await storeSecret(botTokenInput, 'slack_bot_token')
    }
  }

  let signingVaultId: string | null = existing?.signing_secret_vault_id ?? null
  if (signingSecretInput) {
    if (signingVaultId) {
      await updateSecret(signingVaultId, signingSecretInput)
    } else {
      signingVaultId = await storeSecret(signingSecretInput, 'slack_signing_secret')
    }
  }

  // auth.test 실행 (요청 시 + 토큰 보유 시)
  let testResult: { result: string; error: string | null; meta: { team_id?: string; team?: string; user_id?: string; user?: string } } = {
    result: 'skipped',
    error: null,
    meta: {},
  }
  if (runTest && botTokenVaultId) {
    const plaintext = botTokenInput || (await readSecret(botTokenVaultId))
    if (!plaintext) {
      testResult = { result: 'vault_read_failed', error: 'Vault 에서 토큰 복호화 실패', meta: {} }
    } else {
      const t = await slackAuthTest(plaintext)
      if (t.ok) {
        testResult = {
          result: 'success',
          error: null,
          meta: { team_id: t.team_id, team: t.team, user_id: t.user_id, user: t.user },
        }
      } else {
        testResult = { result: t.error, error: t.error, meta: {} }
      }
    }
  }

  const now = new Date().toISOString()
  const upsertRow: Record<string, unknown> = {
    config_key: CONFIG_KEY,
    bot_token_vault_id: botTokenVaultId,
    signing_secret_vault_id: signingVaultId,
    tax_invoice_channel_id: taxChId || null,
    tax_invoice_channel_name: taxChName || null,
    payment_alerts_channel_id: payChId || null,
    payment_alerts_channel_name: payChName || null,
    updated_by_admin_id: me.id,
  }

  if (testResult.result === 'success') {
    upsertRow.is_active = true
    upsertRow.workspace_id = testResult.meta.team_id ?? null
    upsertRow.workspace_name = testResult.meta.team ?? null
    upsertRow.bot_user_id = testResult.meta.user_id ?? null
    upsertRow.bot_handle = testResult.meta.user ?? null
    upsertRow.last_test_at = now
    upsertRow.last_test_result = 'success'
    upsertRow.last_test_error = null
  } else if (testResult.result !== 'skipped') {
    // 테스트 실패 시 토큰·채널 설정은 저장하지만 활성화하지 않음
    upsertRow.is_active = false
    upsertRow.last_test_at = now
    upsertRow.last_test_result = testResult.result
    upsertRow.last_test_error = testResult.error
  }

  if (!existing) {
    upsertRow.created_by_admin_id = me.id
    const { error } = await service.from('slack_integration').insert(upsertRow)
    if (error) {
      redirect(`${PAGE}?error=` + encodeURIComponent('설정 저장 실패: ' + error.message))
    }
  } else {
    const { error } = await service
      .from('slack_integration')
      .update(upsertRow)
      .eq('config_key', CONFIG_KEY)
    if (error) {
      redirect(`${PAGE}?error=` + encodeURIComponent('설정 저장 실패: ' + error.message))
    }
  }

  // 감사 로그 — 토큰 평문은 절대 기록하지 않음
  await service.from('audit_logs').insert({
    org_id: null,
    actor_type: 'admin',
    actor_id: me.id,
    actor_email: user.email ?? null,
    action: 'slack_integration_updated',
    target_type: 'slack_integration',
    target_id: null,
    visibility: 'internal_only',
    detail: {
      bot_token_changed: !!botTokenInput,
      signing_secret_changed: !!signingSecretInput,
      tax_invoice_channel_id: taxChId || null,
      payment_alerts_channel_id: payChId || null,
      test_run: runTest,
      test_result: testResult.result,
      workspace_id: testResult.result === 'success' ? testResult.meta.team_id : undefined,
    },
  })

  revalidatePath(PAGE)

  if (testResult.result === 'success') {
    redirect(
      `${PAGE}?ok=` +
        encodeURIComponent(`저장 완료 — ${testResult.meta.team ?? ''} 워크스페이스 연결 확인`),
    )
  } else if (testResult.result === 'skipped') {
    redirect(`${PAGE}?ok=` + encodeURIComponent('저장 완료 (연결 테스트 건너뜀)'))
  } else {
    redirect(
      `${PAGE}?error=` +
        encodeURIComponent(`저장은 됐지만 연결 테스트 실패: ${testResult.result}`),
    )
  }
}

export async function testSlackConnection() {
  const { user, me } = await authorizeSuper()
  const service = createServiceRoleClient()

  const { data: cfg } = await service
    .from('slack_integration')
    .select('bot_token_vault_id, workspace_name')
    .eq('config_key', CONFIG_KEY)
    .maybeSingle()

  if (!cfg?.bot_token_vault_id) {
    redirect(`${PAGE}?error=` + encodeURIComponent('등록된 Bot Token 이 없습니다.'))
  }

  const plaintext = await readSecret(cfg.bot_token_vault_id)
  if (!plaintext) {
    redirect(`${PAGE}?error=` + encodeURIComponent('Vault 에서 토큰 복호화 실패'))
  }

  const t = await slackAuthTest(plaintext)
  const now = new Date().toISOString()

  if (t.ok) {
    await service
      .from('slack_integration')
      .update({
        is_active: true,
        workspace_id: t.team_id,
        workspace_name: t.team,
        bot_user_id: t.user_id,
        bot_handle: t.user,
        last_test_at: now,
        last_test_result: 'success',
        last_test_error: null,
        updated_by_admin_id: me.id,
      })
      .eq('config_key', CONFIG_KEY)
  } else {
    await service
      .from('slack_integration')
      .update({
        is_active: false,
        last_test_at: now,
        last_test_result: t.error,
        last_test_error: t.error,
        updated_by_admin_id: me.id,
      })
      .eq('config_key', CONFIG_KEY)
  }

  await service.from('audit_logs').insert({
    org_id: null,
    actor_type: 'admin',
    actor_id: me.id,
    actor_email: user.email ?? null,
    action: 'slack_integration_tested',
    target_type: 'slack_integration',
    target_id: null,
    visibility: 'internal_only',
    detail: { result: t.ok ? 'success' : t.error },
  })

  revalidatePath(PAGE)
  redirect(
    t.ok
      ? `${PAGE}?ok=` + encodeURIComponent(`연결 성공 — ${t.team} (${t.team_id})`)
      : `${PAGE}?error=` + encodeURIComponent(`연결 실패: ${t.error}`),
  )
}

export async function disableSlackIntegration() {
  const { user, me } = await authorizeSuper()
  const service = createServiceRoleClient()

  const { error } = await service
    .from('slack_integration')
    .update({ is_active: false, updated_by_admin_id: me.id })
    .eq('config_key', CONFIG_KEY)

  if (error) {
    redirect(`${PAGE}?error=` + encodeURIComponent('비활성화 실패: ' + error.message))
  }

  await service.from('audit_logs').insert({
    org_id: null,
    actor_type: 'admin',
    actor_id: me.id,
    actor_email: user.email ?? null,
    action: 'slack_integration_disabled',
    target_type: 'slack_integration',
    target_id: null,
    visibility: 'internal_only',
    detail: {},
  })

  revalidatePath(PAGE)
  redirect(`${PAGE}?ok=` + encodeURIComponent('Slack 연동 일시 비활성화 (설정·토큰 유지)'))
}
