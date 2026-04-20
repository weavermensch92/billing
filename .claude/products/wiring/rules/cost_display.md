# Wiring / Cost Display — 규칙 본문

> PW-011 본문. 칸반 / 파이프라인 / 설정 등 UI 전반의 비용 표시 규칙.
> 모드별 분기 (G-082 정합).

---

## PW-011 — 비용 표시 (MUST)

### 표시 위치

| 위치 | 예시 |
|---|---|
| 칸반 상단 요약 바 | `오늘 485 tk | 잔여 8,420 tk` |
| AI 노드 서브노드 📊 | 모드별 다름 |
| 아이템 상세 ⑥ 연관 섹션 | 해당 아이템 비용 |
| 설정 > 비용 관리 | 에이전트별 / 모델별 breakdown |
| 보고서 탭 | 월간 / 주간 추이 |

---

## PW-011-01 — 모드별 표시 (MUST)

G-082 정합:

### Mode A (매니지드)

단위: **토큰 (tk)**

```
오늘 485 tk | 잔여 8,420 tk

에이전트별:
  SSOT Master    120 tk
  Tech Leader     62 tk
  BE Developer   180 tk
  QA Verifier      0 tk
```

클릭 → **토큰 충전 페이지** 이동.

### Mode B (온프레미스)

**비용 미표시** 원칙. 대안으로 자원 사용률:

```
CPU 2.4 시간 / GPU 0.8 시간
메모리 피크 18GB
```

**절대 `$` / USD 노출 금지** (G-082-01).

### Mode C (고객 API)

단위: **USD**

```
오늘 $12.40

에이전트별:
  SSOT Master   $3.42
  Tech Leader   $1.84
  BE Developer  $4.20
  ...

벤더별:
  Anthropic (Claude)  $6.80
  OpenAI (GPT-4o)     $5.60
```

클릭 → **USD breakdown 페이지** 이동.

---

## PW-011-02 — 포맷 규칙 (MUST)

### 토큰 (Mode A)

```typescript
function formatTokens(tk: number): string {
  if (tk < 1000) return `${tk} tk`;
  if (tk < 1_000_000) return `${(tk / 1000).toFixed(1)}k tk`;
  return `${(tk / 1_000_000).toFixed(2)}M tk`;
}

// 예:
// 485      → "485 tk"
// 8420     → "8.4k tk"
// 1200000  → "1.20M tk"
```

### USD (Mode C)

```typescript
function formatUSD(usd: number): string {
  if (usd < 1) return `$${usd.toFixed(3)}`;      // $0.342
  if (usd < 100) return `$${usd.toFixed(2)}`;    // $12.40
  if (usd < 10000) return `$${usd.toFixed(0)}`;  // $1,240
  return `$${(usd / 1000).toFixed(1)}k`;         // $12.4k
}
```

### 자원 (Mode B)

- CPU: `N.N 시간` (소수 1자리)
- 메모리: `NN GB` (정수)
- GPU: `N.N 시간`

---

## PW-011-03 — 서버 응답 기반 (MUST)

G-090 정합. 클라이언트 분기 금지:

```typescript
// ❌ 금지
const display = mode === 'A'
  ? formatTokens(tokens)
  : mode === 'C'
    ? formatUSD(usd)
    : null;

// ✅ 올바름
// 서버 응답: { cost_display: "$12.40", unit: "USD", raw: 12.40 }
const { cost_display } = costData;
```

서버가 모드별로 이미 포맷된 문자열 반환. 클라이언트는 표시만.

---

## PW-011-04 — 비용 예산 & 경고 (Mode A/C, MUST)

### 예산 설정

설정 > 비용 관리:
- 월간 예산 금액 (Mode A: 토큰 수 / Mode C: USD)
- 경고 임계치 3단계: 50% / 80% / 100%
- 초과 시 동작: 계속 / 제한 (임계치 도달 시 차단)

### 경고 UI

임계치 도달 시 칸반 상단 배너:

```
⚠ 이번 달 예산 80% 도달  [상세 보기]
```

100% 도달 시:
- Mode A: **충전 유도** 모달 + 에이전트 작업 일시 정지 옵션
- Mode C: **관리자 알림** + 초과 계속 진행 (고객 결제)

---

## PW-011-05 — Mode B 비용 "미표시" 원칙 (MUST)

G-082-01 정합.

### 절대 금지

- `$` 기호 노출
- 토큰 수 표시 (고객이 벤더 직접 결제 아님)
- "비용: 0" 같은 0 값 표시 (혼란 유발)

### 허용 표시

- "Mode B에서는 고객 인프라를 직접 사용합니다"
- 자원 사용률만 (CPU / GPU / 메모리)
- 인프라 상태 탭으로 가이드

### 탭 분기

```tsx
// Mode B
<div>
  <p>Mode B는 고객 인프라를 직접 사용합니다.</p>
  <Link href="/settings/infra">인프라 자원 모니터링 →</Link>
</div>

// Mode A / C
<div>
  [비용 상세 UI]
</div>
```

---

## PW-011-06 — 실시간 업데이트 (SHOULD)

### WebSocket 이벤트

```typescript
socket.on('cost:updated', ({ agentId, deltaTokens, deltaUsd }) => {
  useAgentStore.getState().addCost(agentId, { deltaTokens, deltaUsd });
});
```

### 표시 정책

- 상단 요약 바: 실시간 (WebSocket)
- 에이전트별 breakdown: 1분 간격 polling
- 월간 집계: 5분 간격 cache invalidation

---

## PW-011-07 — 내역 breakdown (Mode A/C) (SHOULD)

### 에이전트별

```
| 에이전트      | 오늘    | 주간     | 월간     |
|--------------|--------|----------|----------|
| SSOT Master  | 120 tk | 540 tk   | 1,250 tk |
| Tech Leader  | 62 tk  | 300 tk   | 870 tk   |
| BE Developer | 180 tk | 1,200 tk | 4,350 tk |
```

### 모델별 (Mode C)

```
| 모델              | 호출 수 | 입력 tk   | 출력 tk  | 비용    |
|-------------------|--------|-----------|---------|---------|
| claude-sonnet-4-6 | 45     | 180,000   | 32,000  | $1.02   |
| gpt-4o            | 120    | 500,000   | 120,000 | $4.30   |
```

### 벤더별 (Mode C)

```
Anthropic (Claude)   $6.80  ███████
OpenAI (GPT-4o)      $5.60  ██████
Google (Gemini)      $0.40  █
```

---

## PW-011-08 — ROI 계산기 (Mode A/C 전용, SHOULD)

설정 > 보고서 > ROI 계산기:

```
수동 개발 시 예상 비용:
  - 개발자 인건비: 1명 × $100/h × 40h = $4,000

AI 지원 개발 비용:
  - AI 토큰: $142
  - 개발자 시간: 1명 × $100/h × 12h = $1,200

절약: $2,658 (66%)
```

Mode B 에서는 ROI 계산기 숨김 (비용 표시 원칙 위반).

---

## PW-011-09 — API 키 / 토큰 마스킹 (Mode C, MUST)

G-088 / G-150 정합. 설정 > 비용 관리 UI 에서:

```
API 키: sk-ant-****-****-1234   [회전]  [복사]
```

- 풀 키 **절대 평문 노출 금지**
- 마지막 4자만 표시
- `[복사]` 클릭 시에만 1회 복사 (브라우저 클립보드 자동 클리어 30초 후)

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] Mode B 에 `$` 또는 토큰 수 표시 (G-082-01 위반)?
- [ ] 클라이언트 `if (mode === ...)` 로 포맷 결정?
- [ ] 서버 응답 없이 클라이언트가 `cost_display` 계산?
- [ ] Mode B 에서 ROI 계산기 노출?
- [ ] 토큰 / USD 가 같은 화면에 병기?
- [ ] API 키 전체가 UI에 노출?
- [ ] 예산 초과 시 경고 없이 자동 차단?

---

## 참조

- 모드별 비용 원칙: `05_infra_mode.md § 2` (G-082)
- 서브노드 📊: `05_infra_mode.md § 4` (G-084)
- 서버 응답 분기: `05_infra_mode.md § 9` (G-090)
- API 키 마스킹: `05_infra_mode.md § 8` (G-088)
- 비밀 정보 노출 금지: `08_security.md § 9` (G-150)
- 파이프라인 서브노드: `products/wiring/rules/pipeline_view.md § PW-005`
- 칸반 요약 바: `products/wiring/rules/kanban.md`
