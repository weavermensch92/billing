/**
 * e2e 글로벌 setup
 *
 * 기본: NEXT_PUBLIC_MOCK_MODE=true (메모리 mock supabase 사용)
 * 실 DB 검증: .env.test 에 SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY 설정 후
 *           USE_REAL_DB=true 로 실행
 */

import { beforeAll } from 'vitest'

beforeAll(() => {
  // 일부 시나리오는 vendor adapter mock 사용
  if (!process.env.NEXT_PUBLIC_MOCK_MODE) {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
  }

  // VENDOR_TOKEN_ENC_KEY 가 없으면 테스트용 키 자동 주입
  if (!process.env.VENDOR_TOKEN_ENC_KEY) {
    process.env.VENDOR_TOKEN_ENC_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' // 32 bytes zero
  }
})
