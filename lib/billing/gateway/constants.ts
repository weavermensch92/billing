/**
 * Gridge AI Gateway 고정 식별자 (M-2050 / M-2055 / M-2051)
 *
 * 마이그레이션과 코드가 공유하는 UUID. DB seed 와 일치해야 함.
 * PRD §8.7 참조.
 */

/** services 테이블의 Gridge AI Gateway 행 ID */
export const GRIDGE_GATEWAY_SERVICE_ID =
  '00000000-0000-0000-0000-000000005101' as const

/** orgs 테이블의 그릿지 내부 운영 org ID (upstream admin token 소유) */
export const GRIDGE_SELF_ORG_ID =
  '00000000-0000-0000-0000-000000000001' as const

/** services.category 의 게이트웨이 분류 */
export const GRIDGE_GATEWAY_CATEGORY = 'gridge_gateway' as const
