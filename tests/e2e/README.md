# e2e 시나리오 — v2.0 핵심 흐름 검증

## 시나리오 7개

| 파일 | 흐름 | 결정 |
|---|---|---|
| `scenario-1-charge-ack.test.ts` | 충전 → 슬랙 자동 포스팅 → ✅ ack → wallet active | Q3, Gate #1 |
| `scenario-2-usage-allocation.test.ts` | FIFO 다중 wallet 차감 + 환차 P&L | M-1001, M-1008 |
| `scenario-3-refund-a3.test.ts` | A3 환불 (할인 회수 + 차액) + 지원금 거부 | §13.1 |
| `scenario-4-shadow-approval.test.ts` | 1h sync → 그림자 발견 → 24h 검수 → 관대 자동 active | §13.6 f3 |
| `scenario-5-key-issuance.test.ts` | 1h/3회 + 24h 쿨다운 + KeyIssuanceBlockedError | Q5 A+C |
| `scenario-6-team-headroom.test.ts` | 합계 ≤ Org 검증 + trySpend 순서 (wallet → 팀 → Org) | Q1-d, Q1-f |
| `scenario-7-termination.test.ts` | grace_until + cancel + finalize | §13.2 B-i+c |

## 실행 모드

### 1. Mock 모드 (기본, 빠름)

```bash
npm install -D vitest
npm run test:e2e
```

- `NEXT_PUBLIC_MOCK_MODE=true` 자동
- 메모리 mock supabase 사용
- RPC·트리거 미동작 → 시그니처·인터페이스 검증 한정
- 일부 it 블록은 `process.env.USE_REAL_DB !== 'true'` 조건으로 자동 skip

### 2. 실 DB 모드 (정합 검증)

```bash
# .env.test 또는 환경변수로 설정
export USE_REAL_DB=true
export SUPABASE_TEST_URL=https://your-test-project.supabase.co
export SUPABASE_TEST_SERVICE_ROLE_KEY=...

# 사전: 마이그레이션 16개 적용된 인스턴스 필요
supabase db push  # 또는 psql로 개별 적용

npm run test:e2e:real
```

- 모든 RPC·트리거 실제 호출
- BEFORE 트리거 (팀 합계 검증), Immutable ledger, FIFO RPC 동작 검증
- afterAll에서 fixture CASCADE 삭제

## 픽스처 (helpers/fixtures.ts)

```typescript
const fixture = await setupOrgFixture(supabase, {
  orgName: 'Test Org',
  defaultDiscountRate: 0.1,
  selfApprovalHeadroomKrw: 5_000_000,
  walletDefaultValidityMonths: 12,
})

// 자동 생성:
//   - Org 1개
//   - Member 3명 (owner / admin / user)
//   - Team 2개 (미할당 / Engineering)
//   - 기본 결제일 1일
```

## 추가 검증 시나리오 (다음 라운드)

- 카드 만료 알림 큐 (D-30/D-7/D-0)
- 벤더 invoice 매칭 임계 (1%/5%)
- Token rotation (회전)
- e2e UI flow (Playwright)

## CI 통합

GitHub Actions 예시:

```yaml
- name: e2e (mock)
  run: npm run test:e2e

- name: e2e (real DB)
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  env:
    USE_REAL_DB: true
    SUPABASE_TEST_URL: ${{ secrets.SUPABASE_TEST_URL }}
    SUPABASE_TEST_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_TEST_KEY }}
  run: npm run test:e2e:real
```
