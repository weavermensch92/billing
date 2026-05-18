/**
 * Vendor 카탈로그 — UI 노출용 단일 소스.
 *
 * 화면 코드에 vendor 화이트리스트/블랙리스트를 두지 않는다.
 * 상태는 어댑터 가용성에서 자동 파생되므로, 새 벤더 지원 시
 *   1) types.ts 의 VendorName 에 추가
 *   2) index.ts 의 getVendorAdapter() 분기 추가
 *   3) 본 파일의 VENDOR_CATALOG 에 라벨 1줄 추가
 * 외에는 UI 변경 불필요.
 */

import { getVendorAdapter } from './index'
import type { VendorName } from './types'

interface VendorMeta {
  label: string
  order: number
}

export const VENDOR_CATALOG: Record<VendorName, VendorMeta> = {
  anthropic: { label: 'Anthropic', order: 1 },
  openai:    { label: 'OpenAI',    order: 2 },
  google:    { label: 'Google',    order: 3 },
  cursor:    { label: 'Cursor',    order: 4 },
}

export type VendorStatus = 'ready' | 'mock_only' | 'unsupported'

/**
 * 어댑터 등록 여부 + 실 환경변수 설정 여부로 상태 파생.
 *   - getVendorAdapter 가 null      → unsupported (UI 에서 disabled + "준비중")
 *   - 어댑터 있으나 isConfigured()=false → mock_only (개발 모드로만 동작)
 *   - 둘 다 true                    → ready
 */
export function getVendorStatus(v: VendorName): VendorStatus {
  const a = getVendorAdapter(v)
  if (!a) return 'unsupported'
  return a.isConfigured() ? 'ready' : 'mock_only'
}

export interface VendorOption {
  name: VendorName
  label: string
  status: VendorStatus
}

export function listVendors(): VendorOption[] {
  return (Object.keys(VENDOR_CATALOG) as VendorName[])
    .sort((a, b) => VENDOR_CATALOG[a].order - VENDOR_CATALOG[b].order)
    .map(name => ({
      name,
      label: VENDOR_CATALOG[name].label,
      status: getVendorStatus(name),
    }))
}

export function vendorLabel(v: string): string {
  return (VENDOR_CATALOG as Record<string, VendorMeta>)[v]?.label ?? v
}
