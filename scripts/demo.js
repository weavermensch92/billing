#!/usr/bin/env node
// ============================================================
// Gridge Billing MSP — Demo Launcher (cross-platform)
// Usage: npm run demo
// ============================================================
const { spawn, exec } = require('child_process')
const readline = require('readline')
const http = require('http')
const path = require('path')

const BASE_URL = process.env.DEMO_BASE_URL || 'http://localhost:3000'
const PROJECT_ROOT = path.resolve(__dirname, '..')

// ─── UI ───────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
}

function clear() {
  process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[H' : '\x1Bc')
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? 'start ""' :
              process.platform === 'darwin' ? 'open' : 'xdg-open'
  exec(`${cmd} "${url}"`, (err) => {
    if (err) console.log(`  ${C.dim}직접 접속: ${url}${C.reset}`)
  })
}

function openLogin(email, redirect) {
  const url = `${BASE_URL}/api/dev-login?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirect)}`
  console.log(`  ${C.green}→${C.reset} ${C.bold}${email}${C.reset} ${C.dim}→${C.reset} ${C.cyan}${redirect}${C.reset}`)
  openBrowser(url)
}

function checkServer() {
  return new Promise((resolve) => {
    const req = http.get(BASE_URL, { timeout: 2000 }, (res) => {
      resolve(res.statusCode && res.statusCode < 500)
      res.resume()
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

async function serverStart() {
  console.log(`\n  ${C.green}[+]${C.reset} dev 서버 시작...`)
  const child = spawn('npm', ['run', 'dev'], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: 'ignore',
    shell: true,
  })
  child.unref()

  // 최대 30초 부팅 대기
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000))
    if (await checkServer()) {
      console.log(`  ${C.green}[+]${C.reset} 서버 가동 확인 (${i + 1}초)`)
      openBrowser(`${BASE_URL}/login`)
      return
    }
    process.stdout.write('.')
  }
  console.log(`\n  ${C.yellow}[!]${C.reset} 서버가 30초 내 준비되지 않았습니다. 포트 충돌 확인 필요.`)
}

function serverStop() {
  console.log(`\n  ${C.yellow}[-]${C.reset} dev 서버 종료...`)
  if (process.platform === 'win32') {
    exec('taskkill /F /IM node.exe', () => {
      console.log(`  ${C.yellow}[-]${C.reset} 완료`)
    })
  } else {
    exec('pkill -f "next dev"', () => {
      console.log(`  ${C.yellow}[-]${C.reset} 완료`)
    })
  }
}

async function serverStatus() {
  const alive = await checkServer()
  if (alive) console.log(`\n  ${C.green}[+]${C.reset} 서버 가동 중: ${BASE_URL}`)
  else console.log(`\n  ${C.red}[ ]${C.reset} 서버 응답 없음`)
}

// ─── Menu ─────────────────────────────────────────────────
const MENU_ITEMS = [
  { key: 'group', label: 'Server' },
  { key: '1',  label: 'dev server start + 브라우저',  action: async () => await serverStart() },
  { key: '2',  label: 'dev server stop',               action: () => serverStop() },
  { key: '3',  label: 'dev server status',             action: async () => await serverStatus() },

  { key: 'group', label: 'Customer Portal' },
  { key: '4',  label: 'Alice (Owner)   — 전 기능',       action: () => openLogin('alice@acme.com', '/home') },
  { key: '5',  label: 'Bob (Admin)     — 멤버/요청',     action: () => openLogin('bob@acme.com', '/services') },
  { key: '6',  label: 'Charlie (Member)— 본인 계정',     action: () => openLogin('charlie@acme.com', '/services') },

  { key: 'group', label: 'Ops Console' },
  { key: '7',  label: 'Luna (AM)       — 요청 처리',     action: () => openLogin('luna@gridge.ai', '/console/home') },
  { key: '8',  label: 'Weber (Super)   — 조직/VCN',      action: () => openLogin('weber@gridge.ai', '/console/home') },

  { key: 'group', label: 'Quick Paths' },
  { key: '9',  label: 'Alice → /billing',               action: () => openLogin('alice@acme.com', '/billing') },
  { key: '10', label: 'Alice → /billing/creditback',    action: () => openLogin('alice@acme.com', '/billing/creditback') },
  { key: '11', label: 'Weber → /console/orgs/new',      action: () => openLogin('weber@gridge.ai', '/console/orgs/new') },
  { key: '12', label: 'Weber → /console/invoices',      action: () => openLogin('weber@gridge.ai', '/console/invoices') },
  { key: '13', label: 'Luna  → /console/requests',      action: () => openLogin('luna@gridge.ai', '/console/requests') },

  { key: '0',  label: 'Exit', action: () => { process.exit(0) } },
]

function printMenu() {
  clear()
  console.log('')
  console.log(`  ${C.bold}${C.cyan}═══════════════════════════════════════════════════${C.reset}`)
  console.log(`  ${C.bold}${C.cyan}  Gridge Billing MSP — Demo Launcher (Mock Mode)${C.reset}`)
  console.log(`  ${C.bold}${C.cyan}═══════════════════════════════════════════════════${C.reset}`)
  console.log('')
  for (const item of MENU_ITEMS) {
    if (item.key === 'group') {
      console.log(`  ${C.dim}─── ${item.label} ───${C.reset}`)
    } else {
      const k = item.key.padStart(2, ' ')
      console.log(`   ${C.yellow}${k}${C.reset}. ${item.label}`)
    }
  }
  console.log('')
  console.log(`  ${C.dim}Base URL: ${BASE_URL}${C.reset}`)
  console.log('')
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const prompt = (q) => new Promise(r => rl.question(q, r))

  while (true) {
    printMenu()
    const choice = (await prompt(`  선택: `)).trim()
    const item = MENU_ITEMS.find(m => m.key === choice && m.action)
    if (!item) {
      console.log(`  ${C.red}[!]${C.reset} 잘못된 선택: ${choice}`)
      await new Promise(r => setTimeout(r, 1000))
      continue
    }
    try {
      await item.action()
    } catch (e) {
      console.log(`  ${C.red}[!]${C.reset} 실패:`, e && e.message ? e.message : e)
    }
    if (item.key !== '0') {
      await new Promise(r => setTimeout(r, 1500))
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
