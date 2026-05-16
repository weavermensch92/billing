import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/e2e/helpers/setup.ts'],
    testTimeout: 30_000,        // 환차·매칭 시나리오는 길어질 수 있음
    hookTimeout: 30_000,
    env: {
      // 기본은 Mock 모드. CI에서는 .env.test로 실 DB 전환.
      NEXT_PUBLIC_MOCK_MODE: 'true',
      VENDOR_TOKEN_ENC_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // base64 32 bytes
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
