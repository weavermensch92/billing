# LucaPus / Rules / Spec — API 규약 (D-032~D-039)

> spec-common API 카테고리. REST / GraphQL / 버전 관리 / 에러 포맷.

---

## 개요

| 범위 | 항목 수 | 스코프 |
|---|---|---|
| D-032 ~ D-039 | 8건 | core + domain |

---

## D-032 — API 스타일 선택

### 본문

| 스타일 | 권장 대상 |
|---|---|
| REST | 범용 웹 API |
| GraphQL | 복잡 쿼리 / 클라이언트 요구 다양 |
| gRPC | 내부 서비스 간 |
| tRPC | TypeScript 단일 레포 |

### 강제 수준

**SHOULD**.

### 적합화 HITL

🔷 기술 결정.

---

## D-033 — REST 리소스 네이밍

### 본문

복수형 + kebab-case:

```
GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/:id
PATCH  /api/v1/users/:id
DELETE /api/v1/users/:id

GET    /api/v1/users/:id/orders     # 하위 리소스
```

### 강제 수준

**MUST**.

---

## D-034 — API 버전 관리

### 본문

| 방식 | 예시 |
|---|---|
| URL Path | `/api/v1/...` `/api/v2/...` |
| Accept Header | `Accept: application/vnd.app.v2+json` |
| Query Param | `?version=2` (비권장) |

### 강제 수준

**SHOULD** — 프로젝트당 일관.

### 적합화 HITL

🔷 기술 결정.

---

## D-035 — HTTP 상태 코드 규약

### 본문

| 코드 | 용도 |
|---|---|
| 200 | 성공 + 응답 본문 |
| 201 | 생성 성공 |
| 204 | 성공 + 본문 없음 |
| 400 | 잘못된 요청 (검증 실패) |
| 401 | 미인증 |
| 403 | 권한 없음 |
| 404 | 리소스 없음 |
| 409 | 충돌 (중복 생성 등) |
| 422 | 검증 실패 (의미 오류) |
| 429 | Rate limit |
| 500 | 서버 에러 |
| 502 | 업스트림 에러 |
| 503 | 서비스 불가 |

### 강제 수준

**MUST**.

---

## D-036 — 에러 응답 포맷 (표준)

### 본문

Problem Details for HTTP APIs (RFC 7807):

```json
{
  "type": "https://api.acme.com/errors/insufficient-balance",
  "title": "Insufficient balance",
  "status": 400,
  "detail": "Current balance: $5.00. Required: $12.50",
  "instance": "/orders/12345",
  "errors": [
    { "field": "quantity", "message": "must be positive" }
  ]
}
```

### 강제 수준

**MUST**.

### 검증

SSOT Verifier T1: 에러 응답 타입 일치 확인.

---

## D-037 — Pagination / Filtering

### 본문

커서 기반 권장 (대량 데이터):

```
GET /users?cursor=eyJpZCI6MTAwfQ==&limit=20

응답:
{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJpZCI6MTIwfQ==",
    "has_more": true
  }
}
```

오프셋 기반 (단순 목록만):
```
GET /users?page=2&per_page=20
```

### 강제 수준

**SHOULD**.

### 적합화 HITL

🔷 기술 결정: 목록 특성 + 성능 요구.

---

## D-038 — OpenAPI / Swagger 문서화

### 본문

모든 API는 OpenAPI 3.0 스펙 보유:

```yaml
openapi: 3.0.3
info:
  title: Payment Service
  version: 1.0.0

paths:
  /api/v1/payments:
    post:
      summary: Create payment
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/PaymentRequest' }
      responses:
        '201': { ... }
```

### 강제 수준

**MUST**.

### 검증

SSOT Verifier contract_check: 코드 시그니처 ↔ OpenAPI 일치.

---

## D-039 — Rate Limiting

### 본문

| 범위 | 한도 예시 |
|---|---|
| 일반 API | 100 req/min/user |
| 로그인 | 5 attempt/min/IP |
| 결제 | 10 req/hour/user |

초과 시: `429 Too Many Requests` + `Retry-After` 헤더.

### 강제 수준

**MUST** (공개 API).

### 적합화 HITL

🔷 기술 결정: Redis 기반 rate limit vs API Gateway 기반.

---

## 카테고리 요약

| ID | 제목 | 강제 | 적합화 HITL |
|---|---|---|---|
| D-032 | API 스타일 | SHOULD | 🔷 |
| D-033 | REST 네이밍 | MUST | — |
| D-034 | 버전 관리 | SHOULD | 🔷 |
| D-035 | HTTP 상태 | MUST | — |
| D-036 | 에러 포맷 | MUST | — |
| D-037 | Pagination | SHOULD | 🔷 |
| D-038 | OpenAPI 문서 | MUST | — |
| D-039 | Rate Limiting | MUST | 🔷 |

---

## 적합화 프로세스

### 초기 온보딩

- 코드베이스 스캔 → 기존 API 스타일 감지 (controllers / GraphQL schemas)
- 기존 OpenAPI 스펙 존재 여부 확인
- 미확정 항목 → HITL 카드

### 진행 중

- OpenAPI vs 코드 불일치 감지 (SSOT Verifier contract_check)
- 에러 포맷 불일치 → 즉시 수정 요청

---

## 자동 검증 체크리스트

SSOT Verifier T3:

- [ ] 단수형 리소스 이름 (`/user/1` 아닌 `/users/1`)?
- [ ] 에러 응답이 Problem Details 규격 아님?
- [ ] OpenAPI 스펙 없는 엔드포인트?
- [ ] Rate limit 없는 공개 API?
- [ ] 200 OK로 에러 응답 반환?

---

## 참조

- 보안 / 인증 헤더: `spec_security.md` (D-040~050)
- 이벤트 API: `spec_event.md` (D-072~076)
- 아키텍처 문서 출력: `02_architecture.md § 8` (R1~R7)
- 스펙 검증 (contract_check): `products/lucapus/rules/gate.md § PL-005-01`
