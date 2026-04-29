/**
 * Gridge Billing Fill Helper — Content Script
 *
 * 결제 페이지에서 주입됨. Stripe iframe 의 카드 입력 필드에 직접 값을 쓸 수는 없지만
 * 페이지 레벨에서 "Add payment method" 같은 버튼을 감지해 사용자에게 Gridge Extension
 * 이용을 유도하는 툴팁을 표시.
 *
 * 단순 구현 (Phase 0): 페이지 진입 시 background에 알림만 보내고 badge 업데이트.
 * 향후 (Phase 1): "Gridge VCN 복사" 플로팅 버튼 추가, 클립보드 자동 채움 가이드.
 */

;(function () {
  const sel = [
    'iframe[name*="stripe"]',
    'iframe[src*="js.stripe.com"]',
    'input[autocomplete="cc-number"]',
    'input[name*="card_number" i]',
  ].join(', ')

  const check = () => {
    const hit = document.querySelectorAll(sel).length > 0
    if (hit) {
      chrome.runtime.sendMessage({ type: 'billing-field-focused' })
      injectHint()
    }
  }

  function injectHint() {
    if (document.getElementById('gridge-fill-hint')) return
    const div = document.createElement('div')
    div.id = 'gridge-fill-hint'
    div.style.cssText = `
      position: fixed; top: 16px; right: 16px; z-index: 2147483647;
      background: #2563eb; color: white; padding: 10px 14px;
      border-radius: 8px; font-size: 13px; font-family: system-ui;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2); cursor: pointer;
      max-width: 260px;
    `
    div.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 2px;">Gridge VCN 복사</div>
      <div style="font-size: 11px; opacity: 0.85;">툴바 아이콘을 클릭해 카드번호를 복사하세요.</div>
      <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">이 안내를 숨기려면 클릭</div>
    `
    div.onclick = () => div.remove()
    document.body.appendChild(div)
    setTimeout(() => div.remove(), 12000)
  }

  // 초기 + DOM 변경 감지 (SPA 대응)
  check()
  const obs = new MutationObserver(check)
  obs.observe(document.body, { childList: true, subtree: true })

  // 60초 후 observer 해제 (리소스 절약)
  setTimeout(() => obs.disconnect(), 60000)
})()

export {}
