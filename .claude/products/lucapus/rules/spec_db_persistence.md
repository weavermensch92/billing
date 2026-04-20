# LucaPus / Rules / Spec — DB / 영속성 (D-019~D-031)

> spec-common DB/영속성 카테고리. 트랜잭션 / 락 / 마이그레이션 / ORM.
> core + domain 혼재. **D-025 동시성 제어는 가장 자주 HITL 발생**.

---

## 개요

| 범위 | 항목 수 | 스코프 |
|---|---|---|
| D-019 ~ D-031 | 13건 | core + domain |

---

## D-019 — DB 엔진 선택

### 본문

| DB | 권장 대상 |
|---|---|
| PostgreSQL | 범용 RDBMS 기본 |
| MySQL | 레거시 호환 |
| MongoDB | 유연 스키마, 이벤트 저장 |
| Redis | 세션 / 캐시 / rate limit |

### 강제 수준

**SHOULD**.

### 적합화 HITL

🔷 기술 결정: 기존 스택 호환 + 팀 경험.

---

## D-020 — 스키마 마이그레이션 도구

### 본문

- Flyway / Liquibase (Java)
- Prisma Migrate / knex migrate (Node.js)
- Alembic (Python)
- Supabase CLI (Supabase)

**금지**: 프로덕션 DB 에 직접 SQL 실행 (항상 마이그레이션 경유).

### 강제 수준

**MUST**.

### 검증

`migrations/` 디렉토리 존재 + lock 파일 커밋 확인.

---

## D-021 — 마이그레이션 명명 규칙

### 본문

```
YYYY-MM-DD-HH-MM_<slug>.sql
예: 2026-04-18-14-30_add_user_preferences.sql
```

### 강제 수준

**MUST**.

---

## D-022 — Backward Compatible 스키마 변경

### 본문

- 컬럼 추가: `NOT NULL` 금지 (기존 행 영향) → `NULL` 또는 `DEFAULT`
- 컬럼 삭제: Deprecation 1버전 → 삭제
- 인덱스 추가: `CONCURRENTLY` (서비스 중단 X)
- 컬럼 이름 변경: 금지 (add new + remove old 2단계)

### 강제 수준

**MUST**.

### 검증

SSOT Verifier T1: ALTER TABLE 패턴 감지.

---

## D-023 — 트랜잭션 경계

### 본문

트랜잭션은 **Application 계층에서 시작**:

```typescript
// ❌ 금지 (Repository에서 트랜잭션 시작)
class UserRepository {
  async createWithProfile(user, profile) {
    await db.transaction(async (trx) => { /* ... */ });
  }
}

// ✅ 올바름 (Application/Service에서)
class UserService {
  async createWithProfile(input) {
    return db.transaction(async (trx) => {
      const user = await userRepo.save(input.user, trx);
      const profile = await profileRepo.save(input.profile, trx);
      return { user, profile };
    });
  }
}
```

### 강제 수준

**MUST**.

---

## D-024 — 트랜잭션 격리 수준

### 본문

기본: `READ COMMITTED`.
특정 케이스:
- 재고 관리 / 포인트 차감 → `SERIALIZABLE` 또는 `REPEATABLE READ` + 락
- 읽기 전용 → `READ COMMITTED`

### 강제 수준

**SHOULD**.

### 적합화 HITL

🔷 기술 결정.

---

## D-025 — 동시성 제어 (낙관적 락 vs 비관적 락) ★

### 본문 (가장 자주 HITL 발생)

```java
// 낙관적 락 (Optimistic Lock)
@Entity
public class Product {
  @Version private Long version;
  private Integer stock;
}

// 비관적 락 (Pessimistic Lock)
Product p = em.find(Product.class, id, LockModeType.PESSIMISTIC_WRITE);
```

| 전략 | 장점 | 단점 |
|---|---|---|
| 낙관적 | 빠름, 확장 좋음 | 충돌 시 재시도 필요, UX 영향 |
| 비관적 | 안전, 단순 | TPS 저하, 데드락 가능 |

### 강제 수준

**MUST** (프로젝트별 선택).

### 적합화 HITL ★

🔷 기술 결정. 예시 카드 (실제 Wiring 연출 데이터):

```json
{
  "type": "technical",
  "title": "PointUsage.consume()에 낙관적 락 vs 비관적 락?",
  "ruleRef": "spec-common D-025: 동시성 제어 결정",
  "tradeoff": "비관적 락: DB 수준 잠금. 안전하나 TPS 저하.\n낙관적 락: 버전 충돌 시 재시도. 빠르나 충돌 빈발 시 UX 저하.",
  "aiRecommendation": "낙관적 락",
  "aiConfidence": 74,
  "options": ["낙관적 락", "비관적 락", "다른 방법 제안"],
  "assignee": "이시니어",
  "level": "L3"
}
```

---

## D-026 — N+1 쿼리 방지

### 본문

JPA / ORM 사용 시 `JOIN FETCH` / `eager loading` / `preload` 사용.
감지 툴: `@QueryHint` / SQL 로그 모니터링.

### 강제 수준

**MUST**.

### 검증

SSOT Verifier T2 테스트 시 쿼리 수 검증 (5개 이하 / 요청).

---

## D-027 — 인덱스 전략

### 본문

- 자주 조회되는 컬럼 → 인덱스
- 카디널리티 높은 컬럼 우선
- 복합 인덱스: 조회 패턴 분석 후
- EXPLAIN 필수

### 강제 수준

**SHOULD**.

### 검증

테이블당 인덱스 개수 ≤ 7 (너무 많으면 write 성능 저하).

---

## D-028 — Soft Delete vs Hard Delete

### 본문

```sql
-- Soft Delete
UPDATE users SET deleted_at = now() WHERE id = $1;

-- Hard Delete
DELETE FROM users WHERE id = $1;
```

### 강제 수준

**SHOULD**.

### 적합화 HITL

🔶 비즈니스 결정:
- 감사 / 복구 필요 → Soft Delete
- GDPR Right to be forgotten → Hard Delete 필수

---

## D-029 — 감사 필드 (created_at / updated_at / deleted_at)

### 본문

모든 테이블 최소:
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` + trigger

감사 대상 테이블 추가:
- `created_by`, `updated_by` (user_id)
- `deleted_at`, `deleted_by` (soft delete)

### 강제 수준

**MUST**.

---

## D-030 — Connection Pool

### 본문

- PostgreSQL pgBouncer 권장 (PgPool)
- 풀 크기: `max_connections * 0.8`
- 애플리케이션 pool: 10~50

### 강제 수준

**SHOULD**.

---

## D-031 — Read Replica

### 본문

읽기 전용 쿼리 → replica 라우팅.
쓰기 직후 읽기 주의: replication lag 고려.

### 강제 수준

**SHOULD** (트래픽 많은 프로젝트).

### 적합화 HITL

🔷 기술 결정: replica 사용 여부 + lag 처리 전략.

---

## 카테고리 요약

| ID | 제목 | 강제 | 적합화 HITL |
|---|---|---|---|
| D-019 | DB 엔진 선택 | SHOULD | 🔷 |
| D-020 | 마이그레이션 도구 | MUST | — |
| D-021 | 마이그레이션 명명 | MUST | — |
| D-022 | Backward Compatible | MUST | — |
| D-023 | 트랜잭션 경계 | MUST | — |
| D-024 | 격리 수준 | SHOULD | 🔷 |
| **D-025** | **낙관적/비관적 락** | MUST | 🔷 (가장 잦음) |
| D-026 | N+1 방지 | MUST | — |
| D-027 | 인덱스 전략 | SHOULD | 🔷 |
| D-028 | Soft/Hard Delete | SHOULD | 🔶 (GDPR) |
| D-029 | 감사 필드 | MUST | — |
| D-030 | Connection Pool | SHOULD | 🔷 |
| D-031 | Read Replica | SHOULD | 🔷 |

---

## 적합화 프로세스

### 초기 온보딩

- 코드베이스 스캔 → 기존 ORM / 마이그레이션 도구 감지
- 트랜잭션 패턴 분석 → D-023 준수 여부
- 기존 엔티티의 `@Version` / `PESSIMISTIC_LOCK` 사용 빈도 → D-025 기본값

### 진행 중

- N+1 감지 (로그 기반) → 알림
- 마이그레이션 실패 → 즉시 알림
- 동시성 충돌 빈발 → D-025 재검토 제안

---

## 자동 검증 체크리스트

SSOT Verifier T3:

- [ ] Repository 내부 트랜잭션 시작 (D-023 위반)?
- [ ] `DELETE FROM` 직접 실행 (마이그레이션 없이, D-022 위반)?
- [ ] 감사 필드 (created_at/updated_at) 누락 테이블 (D-029 위반)?
- [ ] 인덱스 10개+ 테이블 (write 성능 저하 의심)?
- [ ] N+1 쿼리 감지 (D-026 위반)?

---

## 참조

- 이벤트 기반 아키텍처: `spec_event.md` (D-072~076)
- API 규약 (쿼리 파라미터): `spec_api.md` (D-032~039)
- 보안 (데이터 암호화): `spec_security.md` (D-040~050)
- 감사 로그: `08_security.md § 2` (G-141)
- 동시성 결정 UI: `products/wiring/rules/adapt_tab.md`
