const KRW = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' })
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export const formatKrw = (amount: number) => KRW.format(amount)
export const formatUsd = (amount: number) => USD.format(amount)

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR')

export const formatBillingMonth = (ym: string) => {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m, 10)}월`
}
