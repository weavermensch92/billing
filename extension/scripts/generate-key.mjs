#!/usr/bin/env node
/**
 * extension/key.pem 생성 (최초 1회만 실행)
 *
 * 이 key.pem 은 Extension ID 를 결정짓는 RSA private key 입니다.
 * 한 번 생성하면 **절대로 분실·유출·교체 금지** — 배포된 extension 과 불일치 시
 * Chrome 이 "다른 확장" 으로 인식해 자동 업데이트 실패.
 *
 * 보관:
 *   - 로컬: extension/key.pem (gitignore)
 *   - 안전한 금고: 1Password "Gridge Extension Key" 또는 AWS Secrets Manager
 *
 * 사용:
 *   node extension/scripts/generate-key.mjs
 */
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const keyPath = resolve(__dirname, '..', 'key.pem')

if (existsSync(keyPath)) {
  console.error('[!] extension/key.pem 이 이미 존재합니다.')
  console.error('    덮어쓰기는 Extension ID 가 완전히 바뀝니다. 기존 사용자는 자동 재설치 불가.')
  console.error('    의도한 경우 직접 삭제 후 재실행:')
  console.error(`    rm "${keyPath}"`)
  process.exit(1)
}

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

writeFileSync(keyPath, privateKey, { mode: 0o600 })
console.log('[+] extension/key.pem 생성 완료 (600 권한)')
console.log('')
console.log('    다음 단계:')
console.log('      1. node extension/scripts/pack-crx.mjs   → .crx 생성 + Extension ID 출력')
console.log('      2. 1Password / AWS Secrets Manager 에 key.pem 백업')
console.log('      3. Extension ID 를 installer/assets/update.xml 에 복사')
