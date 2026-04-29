/**
 * 한도 변경 검증 — 특히 감액 시 당월 사용액 초과 차단
 *
 * 규칙: new_limit_krw < current_limit_krw (감액) 이고
 *      당월 settled transactions 합계가 new_limit 을 초과하면 차단
 *      (VCN 결제 거절 방지 — 이미 소진된 한도를 깎을 수 없음)
 */

type SB = {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (k: string, v: unknown) => {
        eq?: (k: string, v: unknown) => unknown
        single: () => Promise<{ data: unknown; error: unknown }>
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>
      }
    }
  }
}

function thisBillingMonth(): string {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  return `${y}-${m}`
}

interface ValidationResult {
  ok: boolean
  current_month_spend_krw: number
  error?: string
}

export async function validateLimitDecrease(
  supabase: SB,
  account_id: string,
  new_limit_krw: number,
): Promise<ValidationResult> {
  const month = thisBillingMonth()

  // 당월 settled transactions 합계 (고객 청구 기준)
  const txResp = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (k: string, v: unknown) => {
          eq: (k: string, v: unknown) => {
            eq: (k: string, v: unknown) => Promise<{ data: Array<{ customer_charge_krw: number }> | null }>
          }
        }
      }
    }
  }).from('transactions')
    .select('customer_charge_krw')
    .eq('account_id', account_id)
    .eq('billing_month', month)
    .eq('status', 'settled')

  const txs = (((txResp as unknown as { data: Array<{ customer_charge_krw: number }> | null }).data) ?? [])
  const spend = txs.reduce((sum, t) => sum + (t.customer_charge_krw ?? 0), 0)

  if (new_limit_krw < spend) {
    return {
      ok: false,
      current_month_spend_krw: spend,
      error: `당월 사용액(₩${spend.toLocaleString()})이 새 한도(₩${new_limit_krw.toLocaleString()})를 초과합니다. 다음 달 이후에 감액하세요.`,
    }
  }

  return { ok: true, current_month_spend_krw: spend }
}
