# LucaPus / Rules / Spec — 코딩 표준 (D-077~D-090)

> spec-common 코딩 표준 카테고리. 네이밍 / 파일 구조 / 주석 / 에러 / 타입.
> 공통 코딩 표준은 `07_coding_standard.md` (G-120~135) 와 연결.

---

## 개요

| 범위 | 항목 수 | 스코프 |
|---|---|---|
| D-077 ~ D-090 | 14건 | core + domain |

### 연관

이 카테고리는 `07_coding_standard.md` 와 **중첩되지만 스펙 수준**:
- `07_coding_standard.md` = 조직 레벨 공통 (Gridge 가 만든 모든 제품 / 고객 코드)
- 이 문서 = spec-common 으로서 고객에게 적합화되는 기본값

---

## D-077 — 네이밍 컨벤션

### 본문

| 대상 | 규칙 | 예시 |
|---|---|---|
| 변수 | camelCase | `userName` |
| 함수 | camelCase | `getUserProfile()` |
| 클래스 | PascalCase | `UserService` |
| 인터페이스 | PascalCase | `UserRepository` |
| 상수 | UPPER_SNAKE | `MAX_RETRY` |
| 파일 | kebab-case | `user-profile.ts` |
| 패키지 | lowercase | `com.acme.user` |

### 강제 수준

**MUST**.

---

## D-078 — 파일당 1 export

### 본문

```typescript
// user-service.ts
export class UserService { /* ... */ }  // 이 파일의 주 export

// 관련 helper 는 같은 파일 OK, but default export 는 하나
```

### 강제 수준

**SHOULD**.

---

## D-079 — 주석 규칙

### 본문

- **왜** (why) 주석: 의도 설명 → 필요
- **무엇** (what) 주석: 코드 중복 → 금지

```typescript
// ❌ 금지
// 사용자 ID 가져오기
const userId = req.userId;

// ✅ 올바름
// 인증된 사용자 ID. 미인증 요청은 middleware 에서 차단됨.
const userId = req.userId;
```

### 강제 수준

**SHOULD**.

---

## D-080 — Public API JSDoc / docstring

### 본문

```typescript
/**
 * 사용자 프로필을 가져온다.
 *
 * @param userId - 사용자 식별자 (UUID)
 * @returns 프로필 객체 또는 null (없을 때)
 * @throws {UnauthorizedError} 권한 없음
 */
async function getUserProfile(userId: string): Promise<Profile | null>
```

### 강제 수준

**MUST** (public API 인 경우).

---

## D-081 — 에러 처리 원칙

### 본문

- 예외는 "예외적" 상황만 (제어 흐름으로 사용 금지)
- 정상 흐름 분기는 Result<T, E> / Either / Option 패턴
- 모든 예외는 로그 (G-123 정합)

```typescript
// ❌ 금지 (예외를 제어 흐름으로)
try {
  return parseInt(input);
} catch {
  return 0;
}

// ✅ 올바름
const num = tryParseInt(input);
if (num.isErr()) return 0;
return num.value;
```

### 강제 수준

**MUST**.

---

## D-082 — 무음 실패 금지 (G-123 정합)

### 본문

```typescript
// ❌ 금지
try {
  await riskyCall();
} catch (e) {
  // 무시
}

// ✅ 올바름
try {
  await riskyCall();
} catch (e) {
  logger.error({ err: e, context }, 'riskyCall failed');
  throw new OperationFailedError(e);
}
```

### 강제 수준

**MUST**.

---

## D-083 — 타입 명시

### 본문

- TypeScript: `strict: true` 필수 (`strictNullChecks`, `noImplicitAny` 전부)
- Python: `mypy --strict` 또는 `ruff`
- Java: 원시 타입 보다 불변 객체 선호

### 강제 수준

**MUST**.

---

## D-084 — any / Object 금지

### 본문

- TypeScript `any`, Python `Any`, Java `Object` 남용 금지
- 타입 모호 시 `unknown` 또는 generic 사용

### 강제 수준

**MUST**.

### 검증

SSOT Verifier T1 + ESLint `@typescript-eslint/no-explicit-any`.

---

## D-085 — 매직 넘버 금지

### 본문

```typescript
// ❌ 금지
if (balance > 5) { /* ... */ }

// ✅ 올바름
const MIN_BALANCE = 5;
if (balance > MIN_BALANCE) { /* ... */ }
```

### 강제 수준

**SHOULD**.

---

## D-086 — 함수 길이

### 본문

- 함수 본문: 50줄 이하 권장
- 1함수 1책임 (SRP)

### 강제 수준

**SHOULD**.

---

## D-087 — 파일 길이

### 본문

- 파일당 500줄 이하 권장
- 초과 시 분할 검토

### 강제 수준

**SHOULD**.

---

## D-088 — Deep Nesting 금지

### 본문

- 3-depth 이하 권장
- Early return 활용

```typescript
// ❌ 금지 (5-depth)
if (a) {
  if (b) {
    if (c) {
      if (d) {
        if (e) { /* ... */ }
      }
    }
  }
}

// ✅ 올바름
if (!a) return;
if (!b) return;
if (!c) return;
if (!d) return;
if (!e) return;
/* ... */
```

### 강제 수준

**SHOULD**.

---

## D-089 — Linter / Formatter

### 본문

| 언어 | Linter | Formatter |
|---|---|---|
| TypeScript | ESLint + @typescript-eslint | Prettier |
| Python | Ruff | Ruff / Black |
| Java | Checkstyle + PMD | google-java-format |
| Go | golangci-lint | gofmt |

### 강제 수준

**MUST**.

### 검증

4-Tier Gate T1 에서 자동 실행.

---

## D-090 — 일관된 import 순서

### 본문

```typescript
// 1. 외부 라이브러리
import React from 'react';
import { z } from 'zod';

// 2. 내부 공유 모듈
import { Logger } from '@/lib/logger';

// 3. 상대 경로
import { useUserStore } from './store';
```

### 강제 수준

**SHOULD**.

### 검증

ESLint import-order 플러그인.

---

## 카테고리 요약

| ID | 제목 | 강제 |
|---|---|---|
| D-077 | 네이밍 | MUST |
| D-078 | 파일당 1 export | SHOULD |
| D-079 | 주석 규칙 | SHOULD |
| D-080 | Public API 주석 | MUST |
| D-081 | 에러 처리 원칙 | MUST |
| D-082 | 무음 실패 금지 | MUST |
| D-083 | 타입 명시 | MUST |
| D-084 | any 금지 | MUST |
| D-085 | 매직 넘버 금지 | SHOULD |
| D-086 | 함수 길이 | SHOULD |
| D-087 | 파일 길이 | SHOULD |
| D-088 | Deep Nesting | SHOULD |
| D-089 | Linter / Formatter | MUST |
| D-090 | Import 순서 | SHOULD |

---

## 적합화 프로세스

### 초기 온보딩

- 기존 ESLint / Prettier 설정 감지
- 기존 네이밍 컨벤션 분석 → 프로젝트 기본값
- 미설정 항목 → 자동 설정 제안

---

## 자동 검증 체크리스트

SSOT Verifier T1 + T3:

- [ ] `any` 남용 감지 (D-084 위반)?
- [ ] try-catch 에 로그 없음 (D-082 위반)?
- [ ] 함수 100줄+ (D-086 위반)?
- [ ] 매직 넘버 5+ 감지 (D-085 위반)?
- [ ] Linter 설정 없음 (D-089 위반)?
- [ ] Public API 주석 누락 (D-080 위반)?

---

## 참조

- 공통 코딩 표준: `07_coding_standard.md` (G-120~135)
- 무음 실패 금지: `07_coding_standard.md § G-123`
- 4-Tier Gate T1: `products/lucapus/rules/gate.md § PL-005-03`
- 테스트: `spec_test.md` (D-053~060)
