/**
 * Gridge Billing Fill Helper — Background Service Worker (MV3)
 *
 * 역할:
 *  - 설치/업데이트 시 기본 설정 초기화
 *  - 결제 페이지 감지 탭의 action badge 표시
 *  - Content script ↔ Popup 메시지 브로커
 */

// 개인 + 팀/조직/엔터프라이즈 결제 페이지 패턴 (admin 페이지 포함)
const BILLING_PATTERNS: RegExp[] = [
  // Anthropic / Claude
  /claude\.ai\/.*\/billing/i,
  /claude\.ai\/organization\//i,
  /console\.anthropic\.com\/.*billing/i,
  /console\.anthropic\.com\/settings\/organization/i,
  // OpenAI / ChatGPT
  /platform\.openai\.com\/.*billing/i,
  /platform\.openai\.com\/.*organization/i,
  /chatgpt\.com\/.*billing/i,
  /chatgpt\.com\/admin\//i,
  // Cursor
  /cursor\.com\/.*billing/i,
  /cursor\.com\/team\//i,
  // GitHub 개인 + Organizations + Enterprises
  /github\.com\/settings\/billing/i,
  /github\.com\/organizations\/[^/]+\/settings\/billing/i,
  /github\.com\/enterprises\/[^/]+\/settings\/billing/i,
]

export type BillingKind = 'personal' | 'team' | 'organization' | 'enterprise'

export function detectBillingContext(url: string): {
  matched: boolean
  kind: BillingKind
  org_slug?: string
} {
  if (!url) return { matched: false, kind: 'personal' }
  if (!BILLING_PATTERNS.some(p => p.test(url))) return { matched: false, kind: 'personal' }

  if (/\/enterprises\//i.test(url)) {
    return { matched: true, kind: 'enterprise', org_slug: url.match(/enterprises\/([^/]+)/i)?.[1] }
  }
  if (/\/team\//i.test(url)) {
    return { matched: true, kind: 'team', org_slug: url.match(/team\/([^/]+)/i)?.[1] }
  }
  if (/\/organizations?\//i.test(url) || /\/admin\//i.test(url)) {
    return {
      matched: true,
      kind: 'organization',
      org_slug: url.match(/organizations?\/([^/]+)/i)?.[1],
    }
  }
  return { matched: true, kind: 'personal' }
}

function isBillingUrl(url: string | undefined): boolean {
  if (!url) return false
  return BILLING_PATTERNS.some(p => p.test(url))
}

// badge 아이콘에 컨텍스트별 다른 텍스트
function badgeTextFor(url: string | undefined): string {
  if (!url || !isBillingUrl(url)) return ''
  const { kind } = detectBillingContext(url)
  return kind === 'personal' ? '$' : kind === 'enterprise' ? 'E' : 'T'
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.sync.set({ apiBase: 'http://localhost:3000' })
  }
  chrome.action.setBadgeBackgroundColor({ color: '#2563eb' })
})

// Tab URL 변경 감지 → 결제 페이지일 때 badge 표시
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  const badge = badgeTextFor(tab.url)
  if (badge) {
    const ctx = detectBillingContext(tab.url!)
    chrome.action.setBadgeText({ text: badge, tabId })
    chrome.action.setTitle({
      title: `Gridge: ${ctx.kind === 'personal' ? '개인' : ctx.kind === 'team' ? '팀' : ctx.kind === 'organization' ? '조직' : '엔터프라이즈'} 결제 페이지 감지${ctx.org_slug ? ' (' + ctx.org_slug + ')' : ''}`,
      tabId,
    })
  } else {
    chrome.action.setBadgeText({ text: '', tabId })
  }
})

// Content script 메시지 수신 (결제 입력 필드 포커스 이벤트)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'billing-field-focused') {
    // 현재는 badge 유지만. 향후 auto-open popup 기능 확장 가능
    if (sender.tab?.id) {
      chrome.action.setBadgeText({ text: '✓', tabId: sender.tab.id })
    }
    sendResponse({ ok: true })
  }
  return true
})

export {}
