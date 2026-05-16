/**
 * @deprecated v2.0부터 폐기 — 선금제 모델은 일할 계산이 불필요.
 *
 * v1.0의 후불 + 즉시 해지 시 당월 사용분 산정 로직이었으나,
 * v2.0의 선금 + termination grace (다음 결제일까지) 모델에서는 의미 없음.
 *
 * 해지 시 잔여 처리는 lib/billing/termination.ts 참조.
 * 환불 처리는 lib/billing/refund.ts (A3 정책) 참조.
 *
 * 본 파일은 import 호환성 유지를 위해 잔존. 일할 함수는 throw.
 * v2.1에서 파일 자체 제거 예정.
 */

const DEPRECATION_MESSAGE =
  'lib/billing/prorate.ts is deprecated in v2.0. Use lib/billing/termination.ts or lib/billing/refund.ts instead.'

export interface ProrateResult {
  amountKrw: number
  daysUsed: number
  daysInMonth: number
}

export function calculateProrate(_terminatedAt: Date, _monthlyLimitKrw: number): ProrateResult {
  throw new Error(DEPRECATION_MESSAGE)
}

export function prorateMerchantName(_serviceName: string): string {
  throw new Error(DEPRECATION_MESSAGE)
}

/**
 * 유일하게 v2.0에서도 의미 있는 헬퍼 (날짜 → 'YYYY-MM').
 * 향후 lib/utils/date.ts 이전 권장.
 */
export function billingMonthOf(date: Date): string {
  const y = date.getUTCFullYear()
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0')
  return `${y}-${m}`
}
