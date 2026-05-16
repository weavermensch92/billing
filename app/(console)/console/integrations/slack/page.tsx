import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/format'
import { saveSlackConfig, testSlackConnection, disableSlackIntegration } from './actions'

interface SlackConfig {
  config_key: 'global'
  bot_token_vault_id: string | null
  signing_secret_vault_id: string | null
  workspace_name: string | null
  workspace_id: string | null
  bot_user_id: string | null
  bot_handle: string | null
  tax_invoice_channel_id: string | null
  tax_invoice_channel_name: string | null
  payment_alerts_channel_id: string | null
  payment_alerts_channel_name: string | null
  is_active: boolean
  last_test_at: string | null
  last_test_result: string | null
  last_test_error: string | null
  updated_at: string
}

export default async function SlackIntegrationPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string }
}) {
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

  const isSuper = me.role === 'super'

  const { data: cfg } = await supabase
    .from('slack_integration')
    .select('*')
    .eq('config_key', 'global')
    .maybeSingle()

  const c = cfg as SlackConfig | null

  const hasToken = !!c?.bot_token_vault_id
  const hasSigningSecret = !!c?.signing_secret_vault_id

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <Link href="/console/home" className="text-xs text-gray-500 hover:underline">
          ← 콘솔 홈
        </Link>
        <h1 className="text-2xl font-semibold mt-2">Slack 연동</h1>
        <p className="text-xs text-gray-500 mt-1">
          Gridge 운영 Slack 워크스페이스 봇 설정. 환경 변수 대신 이 페이지의 값이 우선합니다.
        </p>
      </div>

      {searchParams.error && (
        <div className="border-l-[3px] border-l-red-500 pl-3 py-2 text-sm text-red-700 bg-red-50">
          {decodeURIComponent(searchParams.error)}
        </div>
      )}
      {searchParams.ok && (
        <div className="border-l-[3px] border-l-green-500 pl-3 py-2 text-sm text-green-700 bg-green-50">
          {decodeURIComponent(searchParams.ok)}
        </div>
      )}

      {/* 현재 상태 */}
      <div className="card p-6 bg-white space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">현재 상태</h2>
            <p className="text-xs text-gray-500 mt-1">
              {c?.is_active ? (
                <span className="text-green-700">활성</span>
              ) : (
                <span className="text-gray-500">비활성</span>
              )}
              {c?.workspace_name && (
                <span className="ml-2">
                  · {c.workspace_name}
                  {c.workspace_id && <span className="text-gray-400"> ({c.workspace_id})</span>}
                </span>
              )}
            </p>
          </div>
          {isSuper && c?.is_active && (
            <form action={disableSlackIntegration}>
              <button
                type="submit"
                className="text-xs text-red-600 hover:underline"
                title="활성 플래그만 끄고 설정·토큰은 유지"
              >
                일시 비활성화
              </button>
            </form>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-gray-500 text-xs">Bot Token</dt>
            <dd>{hasToken ? <span className="text-green-600">등록됨 (Vault)</span> : <span className="text-gray-400">미등록</span>}</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">Signing Secret</dt>
            <dd>{hasSigningSecret ? <span className="text-green-600">등록됨 (Vault)</span> : <span className="text-gray-400">미등록</span>}</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">Bot 핸들</dt>
            <dd>{c?.bot_handle ?? <span className="text-gray-400">-</span>}</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">세금계산서 채널</dt>
            <dd>
              {c?.tax_invoice_channel_name
                ? <>#{c.tax_invoice_channel_name} <span className="text-gray-400">({c.tax_invoice_channel_id})</span></>
                : <span className="text-gray-400">-</span>}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">결제 알림 채널</dt>
            <dd>
              {c?.payment_alerts_channel_name
                ? <>#{c.payment_alerts_channel_name} <span className="text-gray-400">({c.payment_alerts_channel_id})</span></>
                : <span className="text-gray-400">-</span>}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">최근 연결 테스트</dt>
            <dd>
              {c?.last_test_at ? (
                <>
                  {formatDate(c.last_test_at)} ·{' '}
                  {c.last_test_result === 'success' ? (
                    <span className="text-green-600">성공</span>
                  ) : (
                    <span className="text-red-600">{c.last_test_result ?? '실패'}</span>
                  )}
                </>
              ) : (
                <span className="text-gray-400">미실행</span>
              )}
            </dd>
          </div>
        </dl>

        {c?.last_test_result && c.last_test_result !== 'success' && c.last_test_error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {c.last_test_error}
          </p>
        )}

        {hasToken && isSuper && (
          <form action={testSlackConnection}>
            <button
              type="submit"
              className="text-sm text-brand-600 hover:underline"
            >
              연결 테스트 실행 →
            </button>
          </form>
        )}
      </div>

      {/* 편집 폼 — Super 만 */}
      {isSuper ? (
        <form action={saveSlackConfig} className="card p-6 bg-white space-y-5">
          <h2 className="text-base font-semibold text-gray-900">설정 변경</h2>
          <p className="text-xs text-gray-500">
            토큰류는 비워두면 기존 값이 유지됩니다. 새 값 입력 시 Vault 에 새로 저장되고 이전 시크릿은 폐기됩니다.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bot Token (xoxb-)
            </label>
            <input
              name="bot_token"
              type="password"
              placeholder={hasToken ? '••••••••  (변경 시 입력)' : 'xoxb-...'}
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            />
            <p className="mt-1 text-xs text-gray-500">
              Slack App → OAuth & Permissions → Bot User OAuth Token. <code>chat:write</code> 스코프 필요.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Signing Secret
            </label>
            <input
              name="signing_secret"
              type="password"
              placeholder={hasSigningSecret ? '••••••••  (변경 시 입력)' : 'Slack signing secret'}
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            />
            <p className="mt-1 text-xs text-gray-500">
              Slack App → Basic Information → Signing Secret. Events Webhook 검증에 사용.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">세금계산서 채널 ID</label>
              <input
                name="tax_invoice_channel_id"
                type="text"
                defaultValue={c?.tax_invoice_channel_id ?? ''}
                placeholder="C0123456789"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">표시명 (#)</label>
              <input
                name="tax_invoice_channel_name"
                type="text"
                defaultValue={c?.tax_invoice_channel_name ?? ''}
                placeholder="tax-invoice"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">결제 알림 채널 ID</label>
              <input
                name="payment_alerts_channel_id"
                type="text"
                defaultValue={c?.payment_alerts_channel_id ?? ''}
                placeholder="C9876543210"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">표시명 (#)</label>
              <input
                name="payment_alerts_channel_name"
                type="text"
                defaultValue={c?.payment_alerts_channel_name ?? ''}
                placeholder="billing-alerts"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <input
              id="run_test"
              name="run_test"
              type="checkbox"
              defaultChecked
            />
            <label htmlFor="run_test" className="text-xs text-gray-600">
              저장 직후 <code>auth.test</code> 호출로 토큰 검증
            </label>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-6 py-2 rounded-lg"
            >
              저장
            </button>
          </div>
        </form>
      ) : (
        <div className="card p-6 bg-white">
          <p className="text-sm text-gray-600">
            설정 변경은 Super 권한이 필요합니다. 현재 역할: <span className="font-mono">{me.role}</span>
          </p>
        </div>
      )}
    </div>
  )
}
