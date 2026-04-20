# LucaPus / Rules / Spec — 이벤트 (D-072~D-076)

> spec-common 이벤트 카테고리. Domain Event / Pub/Sub / Event Sourcing.
> core 메커니즘 + domain 이벤트 정의.

---

## 개요

| 범위 | 항목 수 | 스코프 |
|---|---|---|
| D-072 ~ D-076 | 5건 | core + domain |

---

## D-072 — 도메인 이벤트 정의

### 본문

```typescript
// core/shared/event/DomainEvent.ts
abstract class DomainEvent {
  readonly id: string = uuid();
  readonly occurredAt: Date = new Date();
  abstract readonly eventType: string;
}

// domain/order/OrderPlacedEvent.ts
class OrderPlacedEvent extends DomainEvent {
  readonly eventType = 'OrderPlaced';
  constructor(
    readonly orderId: string,
    readonly userId: string,
    readonly total: number,
  ) { super(); }
}
```

### 강제 수준

**MUST** (도메인 이벤트 기반 프로젝트).

### 적합화 HITL

🔷 기술 결정: 메커니즘은 core, 이벤트 정의는 domain (D-047 감사 로그와 유사).

---

## D-073 — Pub/Sub 메커니즘

### 본문

| 도구 | 용도 |
|---|---|
| Redis Pub/Sub | 간단, 저지연 |
| Kafka | 대용량, 순서 보장 |
| RabbitMQ | 신뢰성, 라우팅 유연 |
| AWS SNS/SQS | AWS 네이티브 |
| NATS | 경량, 마이크로서비스 |

### 강제 수준

**SHOULD**.

### 적합화 HITL

🔷 기술 결정.

---

## D-074 — 이벤트 전달 보장

### 본문

3수준:
- **At most once**: 중복 X, 손실 가능
- **At least once**: 손실 X, 중복 가능 (+ idempotent 처리)
- **Exactly once**: 이상적, 구현 복잡 (Kafka 2PC)

### 강제 수준

**MUST** (정합성 필요한 도메인).

### 적합화 HITL

🔷 기술 결정.

---

## D-075 — Idempotency (멱등성)

### 본문

이벤트 핸들러는 **멱등** 해야 함 (같은 이벤트 중복 처리 시 결과 동일):

```typescript
async function handleOrderPlaced(event: OrderPlacedEvent) {
  const existing = await findByEventId(event.id);
  if (existing) return;  // 이미 처리됨, 중복 무시

  // 실제 처리
}
```

Idempotency key 저장 (Redis TTL 7일).

### 강제 수준

**MUST**.

### 검증

SSOT Verifier T3: 이벤트 핸들러에 idempotency 체크 확인.

---

## D-076 — 이벤트 버전 관리

### 본문

이벤트 스키마 변경 시:
- 필드 추가 OK (backward compatible)
- 필드 삭제 금지 (consumer 가 depending)
- 타입 변경 금지 → 새 eventType 정의 (`OrderPlacedV2`)

### 강제 수준

**MUST**.

---

## 카테고리 요약

| ID | 제목 | 강제 | 적합화 HITL |
|---|---|---|---|
| D-072 | 도메인 이벤트 정의 | MUST | 🔷 |
| D-073 | Pub/Sub 메커니즘 | SHOULD | 🔷 |
| D-074 | 전달 보장 | MUST | 🔷 |
| D-075 | Idempotency | MUST | — |
| D-076 | 이벤트 버전 관리 | MUST | — |

---

## 적합화 프로세스

### 초기 온보딩

- 코드베이스 스캔 → 기존 이벤트 메커니즘 감지
- `EventEmitter` / Kafka Producer / Redis Pub 사용 빈도
- Domain Event 정의 유무

### 진행 중

- 이벤트 실패 / 지연 모니터링
- 이벤트 스키마 변경 PR 감지 → breaking change 경고

---

## 자동 검증 체크리스트

SSOT Verifier T3:

- [ ] 이벤트 핸들러에 idempotency 체크 누락 (D-075 위반)?
- [ ] 이벤트 필드 삭제 / 타입 변경 감지 (D-076 위반)?
- [ ] Domain Event 상속 관계 없음 (D-072 위반)?
- [ ] Pub/Sub 에러 핸들링 없음?

---

## 참조

- Observer 패턴: `spec_design_pattern.md § D-017`
- Saga / Compensation: `spec_design_pattern.md § D-018`
- API 규약 (이벤트 → API): `spec_api.md`
- 감사 로그 (이벤트 기반): `spec_security.md § D-047`
- 코드 패턴 감지: `products/lucapus/rules/codebase.md § PL-009-03`
