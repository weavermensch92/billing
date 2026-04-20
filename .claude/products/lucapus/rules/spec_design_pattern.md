# LucaPus / Rules / Spec — 디자인 패턴 (D-011~D-018)

> spec-common 의 디자인 패턴 카테고리. Facade / Repository / Strategy 등.
> core 대부분. 🔷 기술 결정 + 🔶 코드 패턴 승격 모두 다발.

---

## 개요

| 범위 | 항목 수 | 스코프 |
|---|---|---|
| D-011 ~ D-018 | 8건 | core (대부분) |

---

## D-011 — Facade 패턴

### 본문

복잡한 하위 서비스를 단순 인터페이스로 노출:

```typescript
class PaymentFacade {
  constructor(
    private pg: PgService,
    private fraud: FraudCheckService,
    private audit: AuditService,
  ) {}

  async pay(order: Order, method: PaymentMethod) {
    await this.fraud.check(order);
    const result = await this.pg.execute(order, method);
    await this.audit.log(result);
    return result;
  }
}
```

### 강제 수준

**SHOULD**. 트랜잭션 경계 설정 시 유용.

### 적합화 HITL

🔷 기술 결정: Facade 사용 여부 + `@Transactional` 동시 적용 여부.

### 코드 패턴 감지

PL-009 가 "Facade + `@Transactional` + 이벤트 발행" 3회+ 감지 시:
→ 🔶 코드 패턴 승격 카드 생성.

---

## D-012 — Repository 패턴

### 본문

데이터 접근 추상화:

```typescript
interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

class JpaUserRepository implements UserRepository { /* ... */ }
class InMemoryUserRepository implements UserRepository { /* ... */ }  // 테스트용
```

### 강제 수준

**MUST** (DDD 프로젝트).

### 적합화 HITL

🔷 기술 결정:
- 단순 CRUD → ORM 직접 사용도 OK
- 복잡 도메인 → Repository 필수

---

## D-013 — Strategy 패턴 (정책 분기)

### 본문

런타임 정책 분기:

```typescript
interface DiscountStrategy {
  calculate(order: Order): number;
}

class CouponDiscount implements DiscountStrategy { /* ... */ }
class MembershipDiscount implements DiscountStrategy { /* ... */ }
```

### 강제 수준

**SHOULD**. 2개 이상 정책이 공존하는 경우.

---

## D-014 — Factory 패턴

### 본문

객체 생성 로직 캡슐화:

```typescript
class NotificationFactory {
  create(type: 'email' | 'sms' | 'push'): Notification {
    switch (type) {
      case 'email': return new EmailNotification();
      case 'sms':   return new SmsNotification();
      case 'push':  return new PushNotification();
    }
  }
}
```

### 강제 수준

**MAY**.

### 적합화 HITL

🔷 기술 결정:
- DI 컨테이너가 처리 → Factory 불필요
- 런타임 결정 → Factory 필수

---

## D-015 — Builder 패턴 (엔티티)

### 본문

복잡한 객체 생성:

```java
@Entity
@Builder
public class User {
  @Id private String id;
  private String email;
  private String name;
}

// 사용
User user = User.builder()
  .id(UUID.randomUUID().toString())
  .email("a@b.c")
  .name("홍길동")
  .build();
```

### 강제 수준

**SHOULD** (JPA / 복잡 엔티티).

### 적합화 HITL

🔶 코드 패턴 승격: `@Builder` 가 엔티티 3개+ 반복 감지 → "모든 JPA 엔티티에 @Builder 적용 (MUST)" 카드.

---

## D-016 — Decorator / Middleware

### 본문

기능 조합 (인증 / 로깅 / 캐싱):

```typescript
@Authenticated
@Logged
@Cached({ ttl: 60 })
async function getUserProfile(id: string) { /* ... */ }
```

### 강제 수준

**SHOULD**.

### 적합화 HITL

🔷 기술 결정: AOP vs 명시적 HOF vs 미들웨어 체인.

---

## D-017 — Observer / Event (pub/sub)

### 본문

느슨한 결합:

```typescript
eventBus.on('OrderPlaced', async (event) => {
  await emailService.sendConfirmation(event.order);
  await analyticsService.track(event);
});
```

### 강제 수준

**MUST** (도메인 이벤트 기반).

### 연관

`spec_event.md` (D-072~076) 상세.

---

## D-018 — Compensation / Saga (분산 트랜잭션)

### 본문

여러 서비스 걸친 트랜잭션 — 실패 시 보상:

```
OrderService → PaymentService → InventoryService
       ↓ (실패)
    RefundService ← CompensateInventory ← ...
```

### 강제 수준

**MUST** (마이크로서비스).

### 적합화 HITL

🔷 기술 결정:
- 2PC (2-Phase Commit) — 강일관성, 성능 저하
- Saga — 최종 일관성, 실패 처리 복잡
- 비즈니스 허용 수준 기반 L3 결정

---

## 카테고리 요약

| ID | 제목 | 강제 | 적합화 HITL |
|---|---|---|---|
| D-011 | Facade | SHOULD | 🔷 + 🔶 (코드 패턴) |
| D-012 | Repository | MUST | 🔷 |
| D-013 | Strategy | SHOULD | 🔷 |
| D-014 | Factory | MAY | 🔷 |
| D-015 | Builder (엔티티) | SHOULD | 🔶 (패턴 승격 잦음) |
| D-016 | Decorator/Middleware | SHOULD | 🔷 |
| D-017 | Observer/Event | MUST | 🔷 |
| D-018 | Saga/Compensation | MUST | 🔷 |

---

## 적합화 프로세스

### 초기 온보딩

코드베이스 (PL-009) 스캔 → 기존 패턴 감지:
- `Service`, `Repository`, `Facade` 네이밍 카운트
- `@Builder`, `@Transactional` 어노테이션 빈도
- 기존 패턴을 프로젝트 기본으로 설정

### 진행 중 (코드 패턴 승격)

PL-009 코드 패턴 감지 → 3회+ 반복 → 🔶 코드 패턴 카드.
L3 가 승격 / 기각 결정 → 승격 시 `rule_timeline` 추가.

---

## 자동 검증 체크리스트

SSOT Verifier T3:

- [ ] Repository 인터페이스 없이 ORM 직접 호출 (D-012 위반)?
- [ ] `@Builder` 없는 엔티티 (프로젝트 규칙이 MUST 라면)?
- [ ] Saga 없이 여러 서비스 걸친 쓰기 (D-018 위반)?
- [ ] 패턴 네이밍 불일치 (Facade / Service / Manager 혼용)?

---

## 참조

- 코드 패턴 승격 원리: `06_hitl.md § 6` (G-110)
- 코드베이스 감지: `products/lucapus/rules/codebase.md` (PL-009)
- 이벤트 상세: `spec_event.md` (D-072~076)
- DB 영속성 (Repository 연동): `spec_db_persistence.md` (D-019~031)
