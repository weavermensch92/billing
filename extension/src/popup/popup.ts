/**
 * Gridge Billing Fill Helper — Popup
 *
 * 플로우:
 *   1. Gridge 세션 확인 (GET /api/extension/session)
 *   2. 접근 가능한 VCN 목록 조회 (GET /api/extension/accounts)
 *   3. 사용자가 VCN 선택 → "카드번호 복사" 클릭
 *   4. POST /api/extension/reveal → 일시 반환된 전체번호를 클립보드에 복사
 *   5. 120초 후 자동 클립보드 클리어 (보안)
 */

interface SessionResp {
  authenticated: boolean
  reason?: string
  member?: { id: string; name: string; email: string; role: string }
  org?: { id: string; name: string }
}

interface VcnInfo {
  id: string
  card_last4: string | null
  card_issuer: string
  status: string
}

interface AccountInfo {
  account_id: string
  member_name: string
  member_email: string
  service_name: string
  service_vendor: string
  monthly_limit_krw: number
  vcn: VcnInfo | null
}

interface RevealResp {
  card_number?: string
  expiry?: string
  cvv?: string
  card_last4?: string
  mock?: boolean
  ttl_seconds?: number
  warning?: string
  error?: string
  message?: string
  portal_url?: string
}

const DEFAULT_API_BASE = 'http://localhost:3000'

const app = document.getElementById('app')!

async function getApiBase(): Promise<string> {
  const { apiBase } = await chrome.storage.sync.get('apiBase')
  return (apiBase as string) || DEFAULT_API_BASE
}

async function fetchSession(): Promise<SessionResp> {
  const base = await getApiBase()
  const res = await fetch(`${base}/api/extension/session`, {
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  })
  return res.json()
}

async function fetchAccounts(): Promise<{ accounts?: AccountInfo[]; error?: string }> {
  const base = await getApiBase()
  const res = await fetch(`${base}/api/extension/accounts`, {
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  })
  return res.json()
}

async function revealVcn(vcn_id: string, purposeUrl: string): Promise<RevealResp> {
  const base = await getApiBase()
  const res = await fetch(`${base}/api/extension/reveal`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vcn_id, purpose_url: purposeUrl }),
  })
  return res.json()
}

async function currentTabUrl(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.url ?? ''
}

type BillingKind = 'personal' | 'team' | 'organization' | 'enterprise'
interface BillingContext { matched: boolean; kind: BillingKind; org_slug?: string }

function detectContext(url: string): BillingContext {
  if (!url) return { matched: false, kind: 'personal' }
  const patterns = [
    /claude\.ai\/.*\/billing/i, /claude\.ai\/organization\//i,
    /console\.anthropic\.com\/.*billing/i, /console\.anthropic\.com\/settings\/organization/i,
    /platform\.openai\.com\/.*billing/i, /platform\.openai\.com\/.*organization/i,
    /chatgpt\.com\/.*billing/i, /chatgpt\.com\/admin\//i,
    /cursor\.com\/.*billing/i, /cursor\.com\/team\//i,
    /github\.com\/settings\/billing/i,
    /github\.com\/organizations\/[^/]+\/settings\/billing/i,
    /github\.com\/enterprises\/[^/]+\/settings\/billing/i,
  ]
  if (!patterns.some(p => p.test(url))) return { matched: false, kind: 'personal' }
  if (/\/enterprises\//i.test(url)) return { matched: true, kind: 'enterprise', org_slug: url.match(/enterprises\/([^/]+)/i)?.[1] }
  if (/\/team\//i.test(url))        return { matched: true, kind: 'team',       org_slug: url.match(/team\/([^/]+)/i)?.[1] }
  if (/\/organizations?\//i.test(url) || /\/admin\//i.test(url)) {
    return { matched: true, kind: 'organization', org_slug: url.match(/organizations?\/([^/]+)/i)?.[1] }
  }
  return { matched: true, kind: 'personal' }
}

const KIND_LABEL: Record<BillingKind, string> = {
  personal: '개인',
  team: '팀',
  organization: '조직',
  enterprise: '엔터프라이즈',
}

function formatKrw(n: number): string {
  return '₩' + n.toLocaleString('ko-KR')
}

function el(tag: string, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElement {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v as string
    else if (k === 'onclick') e.addEventListener('click', v as EventListener)
    else if (k === 'style') Object.assign(e.style, v)
    else (e as unknown as Record<string, unknown>)[k] = v
  }
  for (const c of children) {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c))
    else e.appendChild(c)
  }
  return e
}

function showStatus(message: string, kind: 'info' | 'success' | 'error' = 'info', ttlMs = 3000) {
  const existing = document.getElementById('status-banner')
  if (existing) existing.remove()
  const banner = el('div', {
    id: 'status-banner',
    class: `status status-${kind}`,
  }, message)
  app.prepend(banner)
  if (ttlMs > 0) setTimeout(() => banner.remove(), ttlMs)
}

async function copyToClipboard(text: string, labelForUi: string, ttlSeconds = 120) {
  try {
    await navigator.clipboard.writeText(text)
    showStatus(`✓ ${labelForUi} 복사됨 (${ttlSeconds}초 후 자동 클리어)`, 'success', 4000)
    setTimeout(async () => {
      // 현재 클립보드가 여전히 이 값일 때만 클리어
      try {
        const curr = await navigator.clipboard.readText()
        if (curr === text) {
          await navigator.clipboard.writeText('')
          showStatus('클립보드 클리어 완료', 'info', 2000)
        }
      } catch {
        // 탭이 포커스 없으면 readText 불가 — 무시
      }
    }, ttlSeconds * 1000)
  } catch (e) {
    showStatus(`복사 실패: ${(e as Error).message}`, 'error')
  }
}

// ─── 화면 렌더 ─────────────────────────────────────
async function render() {
  app.innerHTML = ''

  const session = await fetchSession()

  if (!session.authenticated) {
    const base = await getApiBase()
    app.appendChild(el('div', { class: 'card' },
      el('h2', {}, 'Gridge 로그인 필요'),
      el('p', { class: 'muted' }, 'Extension 을 쓰려면 Gridge 포털에 먼저 로그인하세요.'),
      el('a', {
        class: 'btn btn-primary',
        href: `${base}/login`,
        target: '_blank',
      }, '로그인 페이지 열기'),
      el('p', { class: 'muted small', style: { marginTop: '12px' } },
        'API Base: ', el('code', {}, base)
      ),
      el('button', {
        class: 'btn btn-secondary',
        onclick: async () => {
          const newBase = prompt('Gridge API Base URL', base)
          if (newBase) {
            await chrome.storage.sync.set({ apiBase: newBase })
            render()
          }
        },
      }, 'API Base 변경'),
    ))
    return
  }

  const header = el('div', { class: 'header' },
    el('div', { class: 'header-title' }, 'Gridge Fill Helper'),
    el('div', { class: 'header-sub' },
      `${session.member!.name} (${session.member!.role}) · ${session.org!.name}`
    ),
  )
  app.appendChild(header)

  const url = await currentTabUrl()
  const ctx = detectContext(url)
  const kindBadgeClass = ctx.kind === 'personal' ? 'ctx-personal'
                      : ctx.kind === 'enterprise' ? 'ctx-enterprise'
                      : 'ctx-team'
  const urlBadge = el('div', { class: 'url-badge' },
    ctx.matched
      ? el('span', { class: `ctx-badge ${kindBadgeClass}` }, KIND_LABEL[ctx.kind])
      : el('span', { class: 'ctx-badge ctx-none' }, '비결제'),
    ' ',
    el('code', {}, (ctx.org_slug ? `[${ctx.org_slug}] ` : '') + url.replace(/^https?:\/\//, '').slice(0, 32)),
  )
  app.appendChild(urlBadge)

  // VCN 리스트
  const listWrap = el('div', { class: 'list' })
  listWrap.appendChild(el('div', { class: 'list-loading' }, '계정 로드 중...'))
  app.appendChild(listWrap)

  const accountsResp = await fetchAccounts()
  listWrap.innerHTML = ''

  if (accountsResp.error) {
    listWrap.appendChild(el('div', { class: 'status status-error' }, `에러: ${accountsResp.error}`))
    return
  }

  const accounts = accountsResp.accounts ?? []
  if (accounts.length === 0) {
    listWrap.appendChild(el('p', { class: 'muted' }, '접근 가능한 활성 계정이 없습니다.'))
    return
  }

  accounts.forEach(acc => {
    if (!acc.vcn) return

    const card = el('div', { class: 'vcn-card' },
      el('div', { class: 'vcn-top' },
        el('div', {},
          el('div', { class: 'service-name' }, acc.service_name),
          el('div', { class: 'service-vendor' }, acc.service_vendor),
        ),
        el('div', { class: 'vcn-last4' }, '**** ' + (acc.vcn.card_last4 ?? '????')),
      ),
      el('div', { class: 'vcn-meta' },
        el('span', {}, acc.member_name),
        el('span', { class: 'muted' }, ' · 월 한도 '),
        el('span', {}, formatKrw(acc.monthly_limit_krw)),
      ),
      el('div', { class: 'vcn-actions' },
        el('button', {
          class: 'btn btn-primary',
          onclick: () => handleReveal(acc.vcn!.id, 'card_number', url),
        }, '카드번호 복사'),
        el('button', {
          class: 'btn btn-secondary',
          onclick: () => handleReveal(acc.vcn!.id, 'expiry', url),
        }, '만료일'),
        el('button', {
          class: 'btn btn-secondary',
          onclick: () => handleReveal(acc.vcn!.id, 'cvv', url),
        }, 'CVV'),
      ),
    )
    listWrap.appendChild(card)
  })

  const footer = el('div', { class: 'footer' },
    el('div', { class: 'muted small' },
      'Stripe iframe에 붙여넣기: 카드번호 복사 후 ',
      el('kbd', {}, 'Cmd/Ctrl+V'),
    ),
    el('button', {
      class: 'btn btn-text',
      onclick: async () => {
        const base = await getApiBase()
        const newBase = prompt('Gridge API Base URL', base)
        if (newBase) {
          await chrome.storage.sync.set({ apiBase: newBase })
          render()
        }
      },
    }, '설정'),
  )
  app.appendChild(footer)
}

async function handleReveal(vcn_id: string, field: 'card_number' | 'expiry' | 'cvv', url: string) {
  showStatus('서버에서 카드 정보 요청 중...', 'info', 2000)
  const res = await revealVcn(vcn_id, url)

  if (res.error) {
    showStatus(`${res.message ?? res.error}`, 'error', 5000)
    if (res.portal_url) {
      window.open(res.portal_url, '_blank')
    }
    return
  }

  const value = field === 'card_number' ? res.card_number?.replace(/\s/g, '')
              : field === 'expiry'      ? res.expiry
              : res.cvv
  if (!value) {
    showStatus('응답에 해당 필드 없음', 'error')
    return
  }
  const label = field === 'card_number' ? '카드번호'
              : field === 'expiry'      ? '만료일'
              : 'CVV'
  const ttl = Math.min(res.ttl_seconds ?? 120, 300)
  await copyToClipboard(value, label, field === 'cvv' ? 30 : ttl)

  if (res.mock) {
    showStatus('⚠ Mock 테스트 카드 (실제 결제 불가)', 'info', 3500)
  }
}

document.addEventListener('DOMContentLoaded', render)
