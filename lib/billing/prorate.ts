/**
 * 일할 계산 (pro-rated charging) — terminate_mode='immediate' 시 당월 사용분 청구
 *
 * 계산식: amount = round(monthly_limit * daysUsed / daysInMonth)
 * daysUsed: 해당 월 1일부터 해지일까지 포함 일수
 */

export interface ProrateResult {
  amountKrw: number
  daysUsed: number
  daysInMonth: number
}

export function calculateProrate(terminatedAt: Date, monthlyLimitKrw: number): ProrateResult {
  const year = terminatedAt.getUTCFullYear()
  const month = terminatedAt.getUTCMonth() // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysUsed = terminatedAt.getUTCDate()
  const amountKrw = Math.round(monthlyLimitKrw * daysUsed / daysInMonth)
  return { amountKrw, daysUsed, daysInMonth }
}

export function prorateMerchantName(serviceName: string): string {
  return `PRORATE_${serviceName}`
}

export function billingMonthOf(date: Date): string {
  const y = date.getUTCFullYear()
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0')
  return `${y}-${m}`
}
