# LucaPus / Rules / Spec — 테스트 (D-053~D-060)

> spec-common 테스트 카테고리. 단위 / 통합 / E2E / 커버리지.
> 4-Tier Gate T2 와 직접 연결.

---

## 개요

| 범위 | 항목 수 | 스코프 |
|---|---|---|
| D-053 ~ D-060 | 8건 | core + domain |

---

## D-053 — 테스트 피라미드

### 본문

```
         /\
        /E2E\         — 소수 (~10%)
       /─────\
      / Integ \       — 중간 (~30%)
     /─────────\
    /   Unit    \     — 다수 (~60%)
```

### 강제 수준

**SHOULD**.

---

## D-054 — 단위 테스트 프레임워크

### 본문

| 언어 | 프레임워크 |
|---|---|
| TypeScript | Vitest (권장) / Jest |
| Python | pytest |
| Java | JUnit 5 + AssertJ |
| Go | testing (내장) + testify |
| Rust | cargo test |

### 강제 수준

**MUST** (프로젝트당 하나).

---

## D-055 — Mocking 전략

### 본문

- **외부 의존성** (DB / HTTP / 파일시스템)만 mock
- 도메인 로직은 mock 금지 (진짜 객체 사용)
- `sinon.js` / `pytest-mock` / `mockito` 등 권장

### 강제 수준

**SHOULD**.

### 적합화 HITL

🔷 기술 결정: Mock 범위.

---

## D-056 — 통합 테스트

### 본문

- DB + 서비스 조합
- Testcontainers (Java / Node / Python 지원) 사용 권장
- CI 마다 실행

### 강제 수준

**MUST**.

---

## D-057 — E2E 테스트

### 본문

| 도구 | 용도 |
|---|---|
| Playwright | 웹 E2E |
| Cypress | 웹 (팀 친화) |
| Detox | 모바일 (RN) |
| Appium | 모바일 (네이티브) |

### 강제 수준

**SHOULD** (주요 유저 플로우만, 예산 고려).

---

## D-058 — 커버리지 기준

### 본문

- 최소: 70% (core), 50% (domain)
- 신규 코드: 80%+
- 조직 MUST 로 설정 가능

### 강제 수준

**MUST** (조직 플랜별).

### 검증

4-Tier Gate T2 에서 커버리지 체크.

### 적합화 HITL

🔶 비즈니스 결정: 목표 커버리지.
🔷 기술 결정: 커버리지 측정 도구.

---

## D-059 — 테스트 데이터 관리

### 본문

- Fixture: 고정 데이터 (`__fixtures__/`)
- Factory: 동적 생성 (`fakerjs`, `factory_boy`)
- Seed: DB 초기 데이터 (`seeds/`)

### 강제 수준

**SHOULD**.

---

## D-060 — 테스트 실행 속도

### 본문

- 단위 테스트: 5초 이내 전체 실행
- CI 전체: 15분 이내 목표
- 느린 테스트 태깅 (`@Slow`) → 야간 배치

### 강제 수준

**SHOULD**.

### 검증

테스트 실행 시간 로깅 → p99 > 10분 시 경고.

---

## 카테고리 요약

| ID | 제목 | 강제 | 적합화 HITL |
|---|---|---|---|
| D-053 | 테스트 피라미드 | SHOULD | — |
| D-054 | 프레임워크 | MUST | 🔷 |
| D-055 | Mocking 전략 | SHOULD | 🔷 |
| D-056 | 통합 테스트 | MUST | — |
| D-057 | E2E 테스트 | SHOULD | 🔶 + 🔷 |
| D-058 | 커버리지 기준 | MUST | 🔶 + 🔷 |
| D-059 | 테스트 데이터 | SHOULD | — |
| D-060 | 실행 속도 | SHOULD | — |

---

## 적합화 프로세스

### 초기 온보딩

- 코드베이스 스캔 → 테스트 프레임워크 감지
- 기존 커버리지 추정 → 목표 설정 카드

### 진행 중

- T2 실패 시 → QA Verifier 가 결함 재현 시도
- 커버리지 하락 → 경고 (SHOULD 위반)

---

## 자동 검증 체크리스트

SSOT Verifier T2:

- [ ] 테스트 프레임워크 없음 (D-054 위반)?
- [ ] 통합 테스트 없음 (D-056 위반)?
- [ ] 커버리지 목표 미달 (D-058 위반)?
- [ ] 신규 코드 커버리지 80% 미만?
- [ ] CI 전체 실행 30분+ (D-060 위반)?
- [ ] 도메인 로직 mock 남용?

---

## 참조

- 4-Tier Gate T2: `products/lucapus/rules/gate.md § PL-005-03`
- QA Verifier 역할: `products/lucapus/orchestrators/roles.md § PL-003`
- CI 기본 구조: `spec_module_build.md § D-007`
- 코드 스타일: `spec_coding.md` (D-077~090)
