#!/usr/bin/env node
/**
 * extension/dist/ + extension/key.pem → extension/artifacts/gridge-billing-helper.crx
 *
 * Chrome Extension CRX v3 포맷으로 서명·패키징.
 * Extension ID 는 public key 의 SHA-256 앞 16 바이트 → 소문자 a-p 로 변환한 32자.
 *
 * 사용:
 *   npm run build        # vite build → dist/
 *   node extension/scripts/pack-crx.mjs
 *
 * 출력:
 *   extension/artifacts/gridge-billing-helper.crx
 *   extension/artifacts/extension-id.txt
 */
import { createHash, createPrivateKey, createPublicKey, createSign } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { resolve, dirname, relative, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DIST = resolve(ROOT, 'dist')
const KEY  = resolve(ROOT, 'key.pem')
const OUT  = resolve(ROOT, 'artifacts')

if (!existsSync(DIST)) {
  console.error('[!] extension/dist 없음. `npm run build` 먼저 실행.')
  process.exit(1)
}
if (!existsSync(KEY)) {
  console.error('[!] extension/key.pem 없음. `node scripts/generate-key.mjs` 먼저 실행.')
  process.exit(1)
}
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

// ─── 1. ZIP archive 생성 (dist/ 폴더 전체) ────────────────
// PKZip (PK\x03\x04) 포맷 minimal 구현 — no external deps
const files = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walk(p)
    else if (s.isFile()) {
      const rel = relative(DIST, p).split(sep).join('/')
      files.push({ path: rel, data: readFileSync(p) })
    }
  }
}
walk(DIST)

function dosDateTime(d = new Date()) {
  const t = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31)
  const dd = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31)
  return { dosTime: t, dosDate: dd }
}
function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

const { dosTime, dosDate } = dosDateTime()
const localHeaders = []
const centralHeaders = []
let offset = 0

for (const f of files) {
  const nameBuf = Buffer.from(f.path, 'utf8')
  const crc = crc32(f.data)
  const compressed = deflateRawSync(f.data, { level: 9 })
  const local = Buffer.alloc(30 + nameBuf.length)
  local.writeUInt32LE(0x04034b50, 0)       // signature
  local.writeUInt16LE(20, 4)               // version needed
  local.writeUInt16LE(0, 6)                // flags
  local.writeUInt16LE(8, 8)                // deflate
  local.writeUInt16LE(dosTime, 10)
  local.writeUInt16LE(dosDate, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(compressed.length, 18)
  local.writeUInt32LE(f.data.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  local.writeUInt16LE(0, 28)
  nameBuf.copy(local, 30)
  localHeaders.push(Buffer.concat([local, compressed]))

  const central = Buffer.alloc(46 + nameBuf.length)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0, 8)
  central.writeUInt16LE(8, 10)
  central.writeUInt16LE(dosTime, 12)
  central.writeUInt16LE(dosDate, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(compressed.length, 20)
  central.writeUInt32LE(f.data.length, 24)
  central.writeUInt16LE(nameBuf.length, 28)
  central.writeUInt16LE(0, 30)
  central.writeUInt16LE(0, 32)
  central.writeUInt16LE(0, 34)
  central.writeUInt16LE(0, 36)
  central.writeUInt32LE(0, 38)
  central.writeUInt32LE(offset, 42)
  nameBuf.copy(central, 46)
  centralHeaders.push(central)
  offset += localHeaders[localHeaders.length - 1].length
}

const centralStart = offset
const centralBuf = Buffer.concat(centralHeaders)
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0)
eocd.writeUInt16LE(0, 4)
eocd.writeUInt16LE(0, 6)
eocd.writeUInt16LE(files.length, 8)
eocd.writeUInt16LE(files.length, 10)
eocd.writeUInt32LE(centralBuf.length, 12)
eocd.writeUInt32LE(centralStart, 16)
eocd.writeUInt16LE(0, 20)

const zipBuf = Buffer.concat([...localHeaders, centralBuf, eocd])

// ─── 2. CRX v3 서명 ────────────────────────────────────────
// CRX v3 포맷: magic "Cr24" + version=3 + header_size + header(protobuf) + zip
// Reference: https://source.chromium.org/chromium/chromium/src/+/main:chrome/browser/resources/extensions/ext_installer.js
// Simplified protobuf impl (no full protobuf library)

const privateKey = createPrivateKey({ key: readFileSync(KEY), format: 'pem' })
const publicKey  = createPublicKey(privateKey).export({ type: 'spki', format: 'der' })

// Extension ID = first 16 bytes of SHA256(public_key_der) converted to a-p
const hash = createHash('sha256').update(publicKey).digest()
const extId = Array.from(hash.slice(0, 16))
  .map(b => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 0x0f)))
  .join('')

// SignedData protobuf (tag 10002 = crx_id in Chrome official proto) — simplified:
//   We only need: header = AsymmetricKeyProof { public_key (tag 1), signature (tag 2) }
//                                               in SignedHeaderData wrapper

// protobuf helpers
function varint(n) {
  const out = []
  while (n > 127) { out.push((n & 127) | 128); n = Math.floor(n / 128) }
  out.push(n)
  return Buffer.from(out)
}
function tag(fieldNum, wireType) { return varint((fieldNum << 3) | wireType) }
function lenDelim(fieldNum, buf) { return Buffer.concat([tag(fieldNum, 2), varint(buf.length), buf]) }

// signed_header_data { crx_id } — tag 1 = bytes(16)
const crxIdBytes = hash.slice(0, 16)
const signedHeaderData = lenDelim(1, crxIdBytes)

// signature_data = sha256("CRX3 SignedData\x00" + len(signed_header_data) + signed_header_data + zip_archive)
const magic = Buffer.concat([
  Buffer.from('CRX3 SignedData\x00', 'utf8'),
  (() => { const b = Buffer.alloc(4); b.writeUInt32LE(signedHeaderData.length, 0); return b })(),
  signedHeaderData,
  zipBuf,
])
const signer = createSign('RSA-SHA256')
signer.update(magic)
const signature = signer.sign(privateKey)

// AsymmetricKeyProof { public_key (tag 1), signature (tag 2) }
const proof = Buffer.concat([
  lenDelim(1, Buffer.from(publicKey)),
  lenDelim(2, signature),
])

// CrxFileHeader { sha256_with_rsa (tag 2, repeated AsymmetricKeyProof), signed_header_data (tag 10000) }
const header = Buffer.concat([
  lenDelim(2, proof),
  lenDelim(10000, signedHeaderData),
])

// Final CRX = "Cr24" + version(3) + header_size + header + zip
const crx = Buffer.concat([
  Buffer.from('Cr24', 'utf8'),
  (() => { const b = Buffer.alloc(4); b.writeUInt32LE(3, 0); return b })(),
  (() => { const b = Buffer.alloc(4); b.writeUInt32LE(header.length, 0); return b })(),
  header,
  zipBuf,
])

const crxPath = resolve(OUT, 'gridge-billing-helper.crx')
const idPath = resolve(OUT, 'extension-id.txt')
writeFileSync(crxPath, crx)
writeFileSync(idPath, extId + '\n')

console.log('[+] CRX 빌드 완료')
console.log('    Path: ' + crxPath)
console.log('    Size: ' + (crx.length / 1024).toFixed(1) + ' KB')
console.log('    ID:   ' + extId)
console.log('')
console.log('    installer/assets/update.xml 의 appid 에 위 ID 복사 필요.')
