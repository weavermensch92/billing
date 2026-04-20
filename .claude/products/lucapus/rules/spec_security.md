# LucaPus / Rules / Spec — 보안 (D-040~D-050)

> spec-common 보안 카테고리. JWT / BCrypt / RBAC / MFA / 감사.
> **core 전체**. 조직 MUST 기본.

---

## 개요

| 범위 | 항목 수 | 스코프 |
|---|---|---|
| D-040 ~ D-050 | 11건 | core (전체) |

### 공통 원칙

모든 항목이 조직 MUST 후보 (G-042). 예외 허용 시 OA 명시 승인 필요.

---

## D-040 — JWT 인증

### 본문

JWT (JSON Web Token) 기반 인증:

- **Access Token**: 15분 만료 (기본)
- **Refresh Token**: 7일, RTR (Rotation) 전략
- 서명: RS256 또는 ES256 (비대칭) 권장. HS256 은 내부 전용.

### 강제 수준

**MUST** (조직 레벨, 대부분).

### 적합화 HITL

🔷 기술 결정:
- Access Token 만료: 15분 / 30분 / 60분
- Refresh Token 전략: RTR / 단순 재발급
- Stateful (blacklist) vs Stateless

---

## D-041 — BCrypt 비밀번호 해싱

### 본문

```java
// ✅ 올바름
String hash = BCrypt.hashpw(password, BCrypt.gensalt(12));
BCrypt.checkpw(input, hash);

// ❌ 절대 금지
MessageDigest.getInstance("SHA-256").digest(password.getBytes());
```

- Cost factor: **12 이상**
- Argon2 도 허용 (더 강함)
- MD5 / SHA-* 단독 사용 **절대 금지**

### 강제 수준

**MUST** (조직 레벨, 전 프로젝트).

### 검증

SSOT Verifier T3 + T4:
- MD5 / SHA-1 단독 해싱 패턴 감지 → 즉시 FAIL
- BCrypt cost < 12 → 경고

---

## D-042 — RBAC (역할 기반 접근 제어)

### 본문

```typescript
enum Role { OA, L1, L2, L3, L4, SUPER }

@RequireRole([Role.L3, Role.L4])
async function approveDeploy() { /* ... */ }
```

### 강제 수준

**MUST**.

### 연관

- `03_hierarchy.md § 3` (G-044) 6단 위계
- Wiring 위계 vs AiOPS 3단 권한 매핑 (PA-004-01)

---

## D-043 — MFA (다중 인증)

### 본문

- TOTP (Google Authenticator, Authy) 기본
- WebAuthn / FIDO2 (엔터프라이즈)
- SMS 2차 (금융 / 엔터)

### 강제 수준

**MUST** (Enterprise 플랜).
**SHOULD** (Starter / Growth).

### 적합화 HITL

🔶 비즈니스 결정: MFA 강제 여부 / 대상 역할.

---

## D-044 — CSRF / XSS 방어

### 본문

- CSRF: SameSite=Strict 쿠키 + CSRF 토큰
- XSS: CSP (Content Security Policy) 헤더 + 입력 escape
- OWASP Top 10 준수

### 강제 수준

**MUST**.

---

## D-045 — SQL Injection 방어

### 본문

- Prepared Statement 필수
- ORM 사용 시 raw SQL 금지

```typescript
// ❌ 금지
db.query(`SELECT * FROM users WHERE id = ${userId}`);

// ✅ 올바름
db.query('SELECT * FROM users WHERE id = $1', [userId]);
```

### 강제 수준

**MUST**.

### 검증

SSOT Verifier T3: 문자열 인터폴레이션 + `query` 패턴 감지.

---

## D-046 — 개인정보 암호화 (저장)

### 본문

저장 시 암호화:
- 주민번호 / 여권번호 / 계좌번호 → AES-256
- 비밀번호 → BCrypt (D-041)
- 전화번호 / 이메일 → 필요 시 암호화

### 강제 수준

**MUST** (PIPA / GDPR 적용).

### 연관

`08_security.md § 4` (G-143) 참조.

---

## D-047 — 감사 로그 대상

### 본문

다음 행위는 `audit_logs` 기록:

- 로그인 성공 / 실패
- 권한 변경
- 관리자 설정 변경
- 데이터 내보내기
- 민감 데이터 조회 (의료 / 금융)
- 결제 / 환불

### 강제 수준

**MUST**.

### 적합화 HITL

🔷 기술 결정:
- "메커니즘=코어, 대상 목록=도메인 확장" (AI 추천 91%)
- "전체를 코어로 분류"

### 예시 카드 (실제 Wiring 연출 데이터):

```json
{
  "title": "감사 로그 대상 범위를 어디까지?",
  "ruleRef": "spec-common D-047: 감사 로그 대상",
  "aiRecommendation": "A",
  "aiConfidence": 91,
  "options": ["A: 메커니즘=코어, 대상=도메인 확장", "B: 전체 코어"]
}
```

---

## D-048 — 세션 관리

### 본문

- Session 타임아웃: 30분 유휴
- "Remember me": 30일 max
- 로그아웃 시 server-side 무효화

### 강제 수준

**MUST**.

---

## D-049 — API 키 / 시크릿 관리

### 본문

- 환경 변수 or Secret Manager (AWS Secrets Manager, HashiCorp Vault)
- 커밋 절대 금지 (gitleaks 자동 체크)
- 분기별 회전 (Mode C API 키, G-088)

### 강제 수준

**MUST**.

### 검증

SSOT Verifier T4 + gitleaks (G-150).

---

## D-050 — HTTPS / TLS

### 본문

- TLS 1.3 필수 (G-143)
- HSTS 헤더 설정
- HTTP 자동 redirect to HTTPS

### 강제 수준

**MUST**.

---

## 카테고리 요약

| ID | 제목 | 강제 | 조직 MUST 기본 |
|---|---|---|---|
| D-040 | JWT 인증 | MUST | ✅ |
| D-041 | BCrypt 해싱 | MUST | ✅ |
| D-042 | RBAC | MUST | ✅ |
| D-043 | MFA | MUST/SHOULD | 엔터프라이즈 |
| D-044 | CSRF/XSS 방어 | MUST | ✅ |
| D-045 | SQL Injection 방어 | MUST | ✅ |
| D-046 | 개인정보 암호화 | MUST | ✅ |
| D-047 | 감사 로그 | MUST | ✅ |
| D-048 | 세션 관리 | MUST | ✅ |
| D-049 | API 키 관리 | MUST | ✅ |
| D-050 | HTTPS / TLS | MUST | ✅ |

---

## 적합화 프로세스

### 초기 온보딩

- 코드베이스 스캔 → 기존 인증 방식 감지 (Spring Security / passport.js / NextAuth)
- 보안 설정 감지 (HTTPS / CORS / CSRF)
- 미충족 항목 → 즉시 🔷 기술 결정 카드

### 지속 검증

- T4 보안 스캔 주기적 실행
- CVE 감지 시 즉시 알림 (G-151)

---

## 자동 검증 체크리스트

SSOT Verifier T3 + T4:

- [ ] BCrypt cost < 12 (D-041 위반)?
- [ ] MD5 / SHA-1 비밀번호 해싱 감지?
- [ ] SQL 인터폴레이션 패턴 (D-045 위반)?
- [ ] 감사 로그 대상 행위 누락 (D-047 위반)?
- [ ] API 키 커밋 (gitleaks 감지, D-049)?
- [ ] HTTP 엔드포인트 (D-050 위반)?
- [ ] Session 타임아웃 30분 초과?
- [ ] MFA 없는 관리자 계정 (Enterprise)?

---

## 참조

- 공통 보안: `08_security.md § 1~13` (G-140~G-160)
- 비밀 정보 로그 금지: `08_security.md § 9` (G-150)
- 감사 로그 immutable: `08_security.md § 2` (G-141)
- Wiring SSO: `products/wiring/rules/sso.md` (PW-014)
- AiOPS 권한: `products/aiops/rules/auth.md` (PA-004)
- 4-Tier Gate T4: `products/lucapus/rules/gate.md § PL-005-03`
