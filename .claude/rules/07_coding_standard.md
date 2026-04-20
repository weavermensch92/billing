# 07_Coding Standard — 코딩 표준

> Claude Code가 생성하는 모든 TS/TSX 코드가 지켜야 하는 표준.
> F/R/S/D 체인의 § 4.1 "코딩 표준 자가 점검"이 참조하는 본문.
> 규칙 ID: G-120~G-135.

---

## 0. 기본 스택 전제

- **언어**: TypeScript 5.x (strict mode)
- **런타임**: Node.js 20+ / 브라우저 (Next.js 14 App Router)
- **스타일**: Prettier + ESLint (`eslint-config-next`)
- **패키지 매니저**: pnpm

이 문서는 **Anthropic/Google 어떤 LLM 권장 코딩 규칙과도 충돌하지 않도록** 최소화된 공통 분모만 명시. 프로젝트별 추가 규칙은 팀 단위로.

---

## G-120 — TypeScript strict (MUST)

### 요건

- `tsconfig.json` 에 `"strict": true` 설정 필수
- `any` 금지. 불가피한 경우 `unknown` + 타입 가드 사용
- `@ts-ignore`, `@ts-expect-error` 사용 시 **이유 주석 필수**
- 모든 `export function` / `export const` 는 명시 타입 (반환 타입 포함)

### 체크 방법

```bash
pnpm tsc --noEmit
```

에러 0건 = 통과. 경고는 정보로만.

### 예외

- 외부 라이브러리 타입 정의 미비 시 `.d.ts` 로 보강. 인라인 `any` 금지.
- 테스트 파일(`*.test.ts`)은 `any` 허용 (목킹 용이성).

### 자동 감지

```typescript
// ❌ any 사용
export function handle(data: any) { ... }

// ❌ 반환 타입 생략
export function getUser(id: string) { ... }

// ✅ 올바름
export function handle(data: unknown): Result {
  if (!isValid(data)) throw new Error(...);
  ...
}
```

---

## G-121 — 파일 500줄 이하 (MUST)

### 요건

- 한 파일 500줄 이하
- 500줄 초과 감지 시 **자동 분할 제안** (R 체인으로 유도)
- 분할 기준: 도메인 → 역할 → 세부 기능

### 예외

- 자동 생성 파일 (`.generated.ts`, DB 마이그레이션): 상한 없음
- 타입 정의 파일 (`types.ts`): 1,000줄까지 허용 (분할 시 순환 참조 위험)
- 규칙 문서 (`rules/*.md`): 별도 상한 (`98_governance § 3`)

### 자동 감지

체인 종료 시 `wc -l` 자동 실행. 위반 시 자가 리뷰 경고:
```
⚠ G-121 위반: src/app/api/items/route.ts (587 lines)
  분할 제안: route.ts + item-handlers.ts + item-validators.ts
  R 체인 전환 권장 (92 § G-183)
```

---

## G-122 — 네이밍 (MUST)

### 파일명

| 유형 | 규칙 | 예 |
|---|---|---|
| TS/TSX 파일 | kebab-case | `hitl-filter.ts`, `user-service.ts` |
| React 컴포넌트 | PascalCase | `KanbanBoard.tsx`, `HitlFilterBar.tsx` |
| 유틸 / 훅 | kebab-case | `use-auth.ts`, `format-date.ts` |
| 타입 정의 전용 | `*.types.ts` | `kanban.types.ts` |
| 테스트 | `*.test.ts` | `point-usage.test.ts` |
| 스토리북 | `*.stories.tsx` | `button.stories.tsx` |

### 식별자

| 유형 | 규칙 | 예 |
|---|---|---|
| 변수, 함수 | camelCase | `getUserById`, `isAuthenticated` |
| 상수 (최상위) | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `API_BASE_URL` |
| 타입, 인터페이스 | PascalCase | `KanbanItem`, `HitlFilter` |
| 타입 파라미터 | PascalCase 1~3자 | `T`, `K`, `Fn` |
| React 컴포넌트 | PascalCase | `KanbanBoard` |
| React 훅 | `use` + PascalCase | `useAuth`, `useKanbanItems` |
| 이벤트 핸들러 | `handle` + 대상 | `handleSubmit`, `handleCardClick` |
| Boolean 변수 | `is/has/can/should` 접두 | `isOpen`, `hasError`, `canEdit` |

### 금지

- 한글 식별자
- 숫자로 시작하는 식별자
- `_` 단독 (TypeScript 언더스코어 예외 규칙 제외)
- 예약어 변형 (`class_`, `default_`)

---

## G-123 — 무음 실패 금지 (MUST)

### 요건

에러 / 실패는 **반드시** 다음 중 하나로 처리:

1. `throw new Error(...)` — 호출자에게 책임 이양
2. 명시적 반환 타입 (`Result<T, E>` 패턴)
3. 로깅 + 에러 이벤트 발행 (외부 경계에서만)

### 금지 패턴

```typescript
// ❌ 빈 catch
try {
  await fetchData();
} catch {}

// ❌ 단순 로그만
try {
  await fetchData();
} catch (e) {
  console.error(e);
}

// ❌ 에러 삼키고 null 반환 (타입 정보 손실)
async function getUser(id: string) {
  try {
    return await db.getUser(id);
  } catch {
    return null;  // 호출자는 "null = 없음"인지 "null = 에러"인지 모름
  }
}

// ✅ 명시적 결과 타입
type Result<T> = { ok: true; data: T } | { ok: false; error: Error };

async function getUser(id: string): Promise<Result<User>> {
  try {
    return { ok: true, data: await db.getUser(id) };
  } catch (e) {
    return { ok: false, error: e as Error };
  }
}

// ✅ throw + 호출자 처리
async function getUser(id: string): Promise<User> {
  return await db.getUser(id);  // DB 에러는 호출자가 결정
}
```

### 예외

- UI 이벤트 핸들러(`onClick` 등): `try/catch` 후 사용자에게 토스트 표시 OK
- 최상위 에러 바운더리: Sentry 등으로 전송 후 fallback UI

---

## G-124 — 비동기 병렬화 (SHOULD)

### 요건

독립적인 비동기 호출은 **직렬 대신 병렬**:

```typescript
// ❌ 직렬 (총 3초)
const user = await getUser(id);        // 1초
const rules = await getRules(id);       // 1초
const items = await getItems(id);       // 1초

// ✅ 병렬 (총 1초)
const [user, rules, items] = await Promise.all([
  getUser(id),
  getRules(id),
  getItems(id),
]);
```

### 예외

- 후행 호출이 선행 결과에 의존 (순서 필수)
- Rate limit 우려 (API 제한)
- 트랜잭션 순서 보장 필요 (DB)

### 자동 감지

`await` 가 2회 이상 연속 등장 + 서로 의존 없음 감지 → 자가 리뷰 경고.

---

## G-125 — Import 경로 (MUST)

### 요건

- 절대 경로 사용 (`@/` prefix)
- 상대 경로는 **같은 디렉토리 내 파일만** (`./`)
- `../` 깊이 2 이상 금지

```typescript
// ❌ 깊은 상대 경로
import { Foo } from '../../../lib/foo';

// ✅ 절대 경로
import { Foo } from '@/lib/foo';

// ✅ 같은 디렉토리
import { Bar } from './bar';
```

### 정렬

Prettier + `@trivago/prettier-plugin-sort-imports` 자동 정렬:

1. React / Next.js
2. 외부 라이브러리
3. `@/` 절대 경로
4. 같은 디렉토리 (`./`)
5. 스타일 (`*.css`)
6. 타입 전용 (`import type ...`)

### 순환 참조

ESLint `import/no-cycle` 규칙 활성화. 위반 시 에러.

---

## G-126 — Null / undefined (SHOULD)

### 구분

- **`null`**: "값이 명시적으로 없음" (DB에서 명확히 null로 저장됨)
- **`undefined`**: "값이 설정되지 않음" (옵셔널 필드 미제공)

### 일관성

한 함수/타입 내에서는 **하나만** 사용. 혼용 금지.

```typescript
// ❌ 혼용
interface User {
  email: string;
  phone: string | null;
  address?: string | undefined;  // ?와 undefined 중복
}

// ✅ 일관 (DB 스키마와 정합)
interface User {
  email: string;
  phone: string | null;    // DB에 nullable 필드
  address?: string;        // API 선택 필드
}
```

---

## G-127 — 서버/클라이언트 경계 (MUST — Next.js)

### 요건

- 서버 컴포넌트에서 `'use client'` 컴포넌트 import OK
- 클라이언트 컴포넌트에서 서버 함수 직접 호출 **금지** (server action 경유)
- 서버 액션은 `'use server'` 파일 또는 인라인 `'use server'` 디렉티브

### 환경 변수

| 변수 | 노출 범위 | 접두사 |
|---|---|---|
| 서버 전용 | `.env` + `process.env.*` | 없음 |
| 클라이언트 노출 가능 | `.env` + `process.env.NEXT_PUBLIC_*` | `NEXT_PUBLIC_` 필수 |

**서버 전용 값이 클라이언트 번들에 들어가면 G-144 위반 (데이터 격리).**

---

## G-128 — 로깅 (SHOULD)

### 수준

| 수준 | 용도 |
|---|---|
| `logger.error` | 사용자 영향 있는 실패, 감사 대상 |
| `logger.warn` | 비정상이지만 동작 가능 |
| `logger.info` | 주요 상태 변경 (로그인, 결정 확정) |
| `logger.debug` | 개발 환경 전용 |

### 민감 정보 금지

로그에 포함 금지:
- 비밀번호, 토큰, API 키
- 전체 카드 번호 (마스킹 필수: `****-****-****-1234`)
- PII (주민번호, 상세 주소) — G-140 연동

```typescript
// ❌ 금지
logger.info({ user, password: user.password });

// ✅ 올바름
logger.info({ userId: user.id, action: 'login' });
```

---

## G-129 — 테스트 파일 위치 (SHOULD)

### 위치 규칙

같은 디렉토리에 `*.test.ts` 로 배치 (co-location):

```
src/features/point/
├── point-usage.ts
├── point-usage.test.ts       ← 단위 테스트
├── point-usage.integration.test.ts  ← 통합 테스트
└── types.ts
```

### 명명 규칙

- 단위: `*.test.ts`
- 통합: `*.integration.test.ts`
- E2E: `e2e/*.spec.ts` (별도 디렉토리)

---

## G-130 — 주석 (SHOULD)

### 언제 쓰나

- **왜** 이렇게 했는지 (의도)
- **어떻게** 가 자명하지 않을 때만
- TODO / FIXME / HACK 는 **날짜 + 담당자** 포함

```typescript
// ✅ 의도 설명
// 낙관적 락을 선택한 이유: 결제 트랜잭션 TPS > 100에서
// 비관적 락이 병목이 됨 (D-025 HITL 결정, 2026-04-14)
await pointUsage.consumeOptimistic(userId, amount);

// ✅ 날짜 + 담당자
// TODO(이시니어, 2026-04-25): Slack 알림 연동
sendNotification(userId);

// ❌ 코드 그대로 번역
// userId에 해당하는 사용자 조회
const user = await getUser(userId);
```

### JSDoc / TSDoc

공개 API (`export function`) 에만 작성. 내부 함수는 불필요.

---

## G-131 — 상수 관리 (SHOULD)

### 위치

| 범위 | 위치 |
|---|---|
| 전역 (앱 전체) | `src/constants/*.ts` |
| 모듈 범위 | 모듈 내부 `constants.ts` |
| 함수 내 | 함수 최상단 `const` |

### 매직 넘버 금지

```typescript
// ❌ 매직 넘버
if (items.length > 10) { ... }

// ✅ 상수
const MAX_DISPLAY_ITEMS = 10;
if (items.length > MAX_DISPLAY_ITEMS) { ... }
```

### 예외

- `0`, `1`, `-1`: 관용적 (인덱스, 초기값)
- 테스트의 기대값

---

## G-132 — React 컴포넌트 (MUST)

### 구조

1. imports
2. types / interfaces
3. constants (컴포넌트 전용)
4. 컴포넌트 함수
5. 보조 함수 (파일 하단)

### 원칙

- 하나의 컴포넌트 = 하나의 파일 (예외: 같이 쓰이는 하위 컴포넌트)
- Props 인터페이스는 `interface` 사용 (확장 용이)
- 함수 컴포넌트만 사용 (`class` 컴포넌트 금지)
- Hook 규칙 준수 (`eslint-plugin-react-hooks` 활성화)

### 상태 관리

| 범위 | 도구 |
|---|---|
| 컴포넌트 로컬 | `useState`, `useReducer` |
| 폼 | `react-hook-form` |
| 서버 상태 | TanStack Query 또는 서버 컴포넌트 |
| 글로벌 UI 상태 | Zustand |
| URL 상태 | `useSearchParams` (G-052 서버 필터링과 정합) |

---

## G-133 — 성능 최적화 (SHOULD)

### React 메모이제이션

남용 금지. 측정 후 적용:

- `useMemo`: 계산 비용이 실측 비용보다 클 때만
- `useCallback`: 자식이 `React.memo`일 때만 의미 있음
- `React.memo`: prop 비교 비용 < 재렌더링 비용일 때만

### 번들 크기

- 동적 import (`next/dynamic`) 활용
- 라이브러리 트리 쉐이킹 가능한 것만 사용
- 큰 의존성 (chart.js 등) 은 lazy 로딩

---

## G-134 — 금지 API (MUST)

### 브라우저

- `alert`, `confirm`, `prompt`: UI 품질 저하 — 모달 컴포넌트 사용
- `document.write`: 절대 금지
- `innerHTML`: XSS 위험 — `textContent` 또는 React 사용

### Node.js

- `eval`, `Function(...)`: 보안 위험
- `child_process.exec`: 쉘 인젝션 위험 — `spawn` 사용
- 동기 파일 IO (`readFileSync`): 런타임 차단 — 초기화 단계만 예외

### TypeScript

- `enum` 대신 `as const` + Union (번들 크기, 트리 쉐이킹)
- `namespace` 금지 (ES Module 사용)

---

## G-135 — 접근성 (SHOULD)

### 기본

- 모든 이미지 `alt` 속성
- 폼 요소 `<label>` 연결
- 버튼 `<button>`, 링크 `<a>` 구분
- `tabIndex` 필요 최소한

### 키보드 접근

- 포커스 순서 논리적
- Esc로 모달 닫기
- Enter로 폼 제출

### 스크린리더

- `aria-label`, `aria-describedby` 적절히 사용
- 상태 변화는 `aria-live` 영역으로 알림

---

## 자동 검증 체크리스트 (F/R/S/D 체인 § 4.1 참조)

체인 실행 중 생성한 모든 TS/TSX 파일에 대해 자동 점검:

- [ ] G-120: `any` 사용 없음 + `tsc --noEmit` 0 error
- [ ] G-121: 파일 500줄 이하
- [ ] G-122: 파일명 + 식별자 네이밍 규칙 준수
- [ ] G-123: 빈 catch 블록 없음 / 단순 console.error 없음
- [ ] G-124: 연속 `await` 중 독립적인 것 Promise.all 변환 검토
- [ ] G-125: `../../` 깊이 2 이상 없음 / 순환 참조 없음
- [ ] G-126: null/undefined 혼용 없음 (한 인터페이스 내)
- [ ] G-127: 환경 변수 접두사 규칙 준수 + 서버 전용 값 클라이언트 노출 없음
- [ ] G-128: 민감 정보 로깅 없음
- [ ] G-129: 테스트 파일 co-location
- [ ] G-130: TODO/FIXME에 날짜 + 담당자 포함
- [ ] G-131: 매직 넘버 없음
- [ ] G-132: React 컴포넌트 구조 + Hook 규칙 준수
- [ ] G-133: 근거 없는 `useMemo`/`useCallback` 남용 없음
- [ ] G-134: 금지 API 사용 없음
- [ ] G-135: 이미지 alt / 라벨 연결

위반 감지 → 자가 리뷰 경고 (`93 § G-212`) + 심각 (G-120, G-123, G-127, G-134) 은 Conflict 발동.

---

## 참조

- 보안 상세: `08_security.md`
- 테스트 규칙: `93_workflow.md § 5 (G-215~G-217)`
- 코드 리뷰 흐름: `93_workflow.md § 4`
- 타입 정의 패턴: `products/wiring/rules/design.md` (작성 예정)
