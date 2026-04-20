# 08_Security — 보안 · 컴플라이언스 · 감사

> PII 최소 수집, 감사 로그 immutable, 암호화, 인증/인가, 데이터 보유 정책.
> 제품 규칙 전반에서 참조되는 보안 기준.
> 규칙 ID: G-140~G-179.

---

## 1. PII 최소 수집 (G-140)

### G-140-01 — 수집 필요 최소 범위

Gridge AIMSP가 수집하는 PII는 **운영 필수** 범위로 제한:

| 데이터 | 수집 | 용도 |
|---|---|---|
| 이메일 | ✅ | 로그인, 알림 |
| 이름 | ✅ | UI 표시 |
| 조직 / 팀 / 역할 | ✅ | 위계 라우팅 |
| 프로필 사진 | ❌ (선택 SSO 동기화만) | — |
| 전화번호 | ❌ | — |
| 주민등록번호 | ❌ | — |
| 금융 정보 | ❌ (결제는 Stripe/Toss 경유) | — |
| IP 주소 | ✅ (로그인 감사만) | 위치 추적 X |
| 브라우저 정보 | ✅ (로그인 감사만) | — |

### G-140-02 — 수집 금지

- 고객 코드 내부의 **실제 사용자 데이터** (이름/이메일 등)
- 에이전트 프롬프트에 포함된 **실명 정보**
- Mode B 고객 환경에서 감지된 PII는 해당 환경을 벗어나지 않음

---

## 2. 감사 로그 immutable (G-141) ★ 핵심

### 2.1 원칙

모든 감사 로그는 **변경 불가(immutable), 삭제 불가**.

### 2.2 보존 기간

| 기본 | 1년 |
|---|---|
| 엔터프라이즈 옵션 | 3년, 5년, 무기한 |
| 법적 보존 요청 시 | 무기한 |

Org Admin이 설정 > 감사 로그에서 변경 가능 (최소값 = 1년).

### 2.3 감사 대상 행위 (전체 목록)

| 카테고리 | 행위 | 필드 |
|---|---|---|
| **적합화** | HITL 결정 확정 | actor, cardType, option, aiRecommend, alignedWithAi, duration |
| 적합화 | 규칙 수동 편집 | actor, ruleId, before, after |
| 적합화 | 코드 패턴 승격 | actor, patternId, occurrences, severity |
| 적합화 | 온톨로지 추천 수락/거부 | actor, recommendationId, decision |
| **코드** | PR merge | actor, prId, ruleIds, diffSize |
| 코드 | 프로덕션 배포 | actor, commitSha, approvedBy |
| **위계/권한** | 사용자 역할 변경 | actor, target, before, after |
| 위계 | 팀 생성/이동/삭제 | actor, teamId, memberIds |
| 위계 | 조직 MUST 규칙 추가/수정 | OA, ruleId, severity |
| 위계 | SSO 설정 변경 | OA, protocol, mapping |
| **인프라** | 인프라 모드 변경 | 슈퍼 어드민, before, after, reason |
| 인프라 | 하네스 재설계 | L3, before, after |
| 인프라 | Stage 전환 | actor, before, after |
| **데이터** | 데이터 내보내기 | actor, scope, format, at |
| 데이터 | API 키 발급/회전/삭제 (Mode C) | actor, keyId (마스킹) |
| **보안** | 로그인 성공 / 실패 | actor, ip, userAgent, result |
| 보안 | 권한 거부 발생 | actor, resource, action |
| 보안 | 데이터 보유 기간 변경 | OA, before, after |

### G-141-01 — 감사 로그 DB 제약

```sql
-- Supabase / PostgreSQL
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- 애플리케이션 레이어
-- UPDATE / DELETE 함수 존재 금지
```

**코드 리뷰 시 감사:** `audit_logs` 테이블에 `UPDATE` / `DELETE` SQL이 있으면 **Conflict 발동**.

### G-141-02 — 내보내기 포맷

| 포맷 | 용도 |
|---|---|
| CSV | 엑셀 분석, 단순 리포트 |
| PDF | 법적 증거 제출 |
| JSON | 시스템 간 연동 |
| ZIP | 전체 (모든 포맷 + 인덱스) |

---

## 3. 인증 (G-142)

### G-142-01 — 세션

- **JWT 기반** (Supabase Auth 또는 커스텀)
- Access Token: 15분 만료
- Refresh Token: 7일 만료, 회전(rotation)
- 로그아웃 시 서버 측 블랙리스트 등록 (Redis)

### G-142-02 — SSO

- **SAML 2.0** (Okta, Azure AD, OneLogin)
- **OIDC** (Auth0, Keycloak, Google Workspace)
- **SCIM 2.0** (사용자 프로비저닝, 선택)

매핑 상세: `03_hierarchy.md § 7`.

### G-142-03 — 2FA

- 기본 **TOTP** (Google Authenticator, 1Password, Authy 등)
- 선택 **WebAuthn/FIDO2** (엔터프라이즈 옵션)
- SMS 2FA 지원 X (보안 취약)
- 조직 MUST로 강제 가능 (OA 설정)

---

## 4. 암호화 (G-143)

### 4.1 전송 구간

- **TLS 1.3** 필수 (TLS 1.2 지원, 1.1 이하 차단)
- HSTS 헤더 (`Strict-Transport-Security: max-age=31536000; includeSubDomains`)
- 내부 서비스 간 통신도 TLS (mTLS 권장)

### 4.2 저장 구간

| 데이터 | 암호화 |
|---|---|
| 비밀번호 | BCrypt (cost 12+) — 조직 MUST 샘플 |
| API 키 (Mode C) | **AES-256-GCM** (마스터 키는 AWS KMS / Azure Key Vault) |
| 세션 토큰 (Redis) | AES-256 |
| 개인 토큰 (SSH, OAuth refresh 등) | AES-256 |
| DB 수준 | Supabase 자체 암호화 + 추가 필드 암호화 (PII) |

### G-143-01 — 키 관리

- 마스터 키는 HSM 또는 Cloud KMS에만 존재
- 애플리케이션 서버가 직접 마스터 키 보관 **금지**
- 키 회전: 분기별 1회 + 유출 의심 시 즉시
- 이전 키는 복호화 용도만 유지 (암호화는 최신 키)

---

## 5. 데이터 격리 (G-144)

### G-144-01 — 고객 간 격리

- DB 수준: `org_id` 컬럼 + RLS (Row Level Security)
- 애플리케이션 수준: 서버 함수가 `session.org_id` 외 데이터 반환 금지
- 로깅 수준: 로그에 `org_id` 필터 필수

### G-144-02 — Mode B 격리

Mode B 고객 데이터는 고객 서버에만 존재:
- 그릿지 운영진이 Mode B 고객 데이터 접근 **불가**
- 긴급 장애 시에도 원격 접속 SOP: 고객 승인 → VPN → 스크린 공유 (직접 SSH X)
- 로그 수집도 고객 서버 내부에서만

### G-144-03 — 에이전트 컨텍스트 격리

하나의 에이전트 세션 컨텍스트가 다른 고객의 요청에 영향 주면 안 됨:
- 매 요청마다 컨텍스트 초기화
- 프로젝트 간 메모리 공유 금지
- Mode A의 전용 컴퓨터는 **1 고객 1 컴퓨터 원칙** (여러 컴퓨터는 OK, 1 컴퓨터 내 여러 고객은 금지)

---

## 6. 데이터 보유 / 삭제 (G-145)

### 6.1 보유 기간 옵션

| 데이터 유형 | 기본 | 범위 |
|---|---|---|
| 감사 로그 | 1년 | 1~무기한 |
| 적합화 규칙 / 타임라인 | 무기한 | 무기한 고정 |
| 에이전트 세션 / 프롬프트 | 90일 | 30 / 60 / 90일 / 무기한 |
| HITL 카드 (이미 처리됨) | 1년 | 1~5년 |
| 활동 로그 (6유형) | 90일 | 30 / 60 / 90일 |
| 백업 | 30일 | 7 / 30 / 90일 |

### G-145-01 — 서비스 종료 처리

고객 서비스 종료 시 `93_workflow § G-206` 와 별개로:

1. **전체 ZIP 자동 생성** (적합화 규칙 + 아키텍처 + 감사 로그)
2. 고객에게 전달 (이메일 + 다운로드 링크, 30일 유효)
3. **30일 유예 기간** — 고객이 재가입/복원 가능
4. 유예 후 **완전 삭제** (DB + 백업까지)
5. **삭제 확인서** 발급 (Org Admin에게 PDF)

Mode B의 경우: 원본이 고객 서버. 그릿지 측 메타 정리만.

---

## 7. 프롬프트 저장 옵션 (G-146)

에이전트 프롬프트와 응답을 저장할지 고객이 선택:

| 옵션 | 저장 |
|---|---|
| `전체` | 프롬프트 + 응답 원문 |
| `요약` | AI가 생성한 요약 (200자) + 메타데이터만 |
| `미저장` | 토큰 수 / 시각 / 에이전트명만 — 프롬프트 원문 X |

### G-146-01 — 옵션별 제약

- `미저장` 선택 시 **AI 코칭 기능 제한** (사용자에게 명시)
- `요약` 선택 시 "재질문 감지" 같은 일부 패턴 분석 정확도 저하
- 기본값은 `요약` (privacy by default)

---

## 8. IP 화이트리스트 (G-147)

### 조건

- 엔터프라이즈 옵션 (`Growth` 이상 플랜)
- Org Admin이 설정
- 허용 IP 외 접속 시 차단 + 감사 로그 기록

### G-147-01 — VPN 지원

- 고객 VPN 서브넷 허용 가능 (CIDR 표기)
- 동적 IP 환경 지원 안 함 (보안 취약)

---

## 9. 비밀 정보 처리 (G-150)

### G-150-01 — 로그에 비밀 노출 금지

```typescript
// ❌ 금지
logger.info({ user, token, apiKey });

// ✅ 올바름
logger.info({ userId: user.id, action: 'login', tokenId: hash(token) });
```

### G-150-02 — 에러 메시지 노출 금지

고객 UI에 보여지는 에러에 내부 정보 노출 금지:
- DB 연결 문자열
- 파일 시스템 경로
- 내부 IP
- Stack trace (프로덕션에서는 에러 코드만)

### G-150-03 — Git 커밋 시크릿 스캔

pre-commit hook에서 `gitleaks` 또는 유사 도구로 스캔:
- API 키 패턴
- 비밀번호 패턴
- 인증서 / 개인 키
- AWS / GCP / Azure 자격 증명

위반 감지 시 커밋 차단.

---

## 10. 취약점 대응 (G-151)

### 10.1 주기

- 의존성 업데이트 스캔: **주간** (`npm audit` + Snyk 등)
- 침투 테스트: **분기별** (외부 감사)
- 코드 보안 스캔: **매 PR** (SAST 도구)

### 10.2 CVE 대응 시간

| CVE 심각도 | 대응 기한 |
|---|---|
| Critical | 24시간 |
| High | 7일 |
| Medium | 30일 |
| Low | 분기 단위 |

---

## 11. 컴플라이언스 (G-152)

Gridge AIMSP가 지원하는 컴플라이언스 (고객 요청 시):

| 표준 | 지원 | 비고 |
|---|---|---|
| ISO 27001 | 진행 중 | 2026년 목표 |
| SOC 2 Type II | 검토 중 | 엔터프라이즈 수요 대응 |
| GDPR | 준수 | EU 고객 대상 |
| PIPA (개인정보보호법) | 준수 | 기본 |
| HIPAA | 검토 중 | 의료 고객 요구 시 |
| K-ISMS | 검토 중 | 금융권 고객 요구 시 |

### G-152-01 — 컴플라이언스 질의 응답

고객이 "GDPR 준수하나요?" 등 질문 시:
- YES/NO 단답 지양
- 어떤 조항을 어떻게 지키는지 구체적으로 답변
- Data Processing Agreement (DPA) 제공

---

## 12. 자동 검증 체크리스트

체인 실행 중 감사 / 위반 시 Conflict 자동 발동:

- [ ] `audit_logs` 테이블에 UPDATE / DELETE SQL 존재?
- [ ] 로그에 비밀번호 / API 키 / 토큰 포함?
- [ ] 에러 메시지에 내부 경로 / DB 정보 노출?
- [ ] 비밀번호 해시 알고리즘이 BCrypt 아님?
- [ ] TLS 1.2 미만 허용?
- [ ] `org_id` 없이 `SELECT * FROM items` 같은 쿼리?
- [ ] Mode B 고객 데이터가 크로스 통계에 포함?
- [ ] G-141 감사 대상 행위 중 기록 누락?
- [ ] 2FA SMS 사용?
- [ ] 시크릿 환경 변수가 `NEXT_PUBLIC_*` 접두사?

---

## 13. 보안 사건 대응 (G-160)

### 13.1 감지

- 자동: 이상 접속 패턴, 급증한 권한 거부, SQL 인젝션 시도 등
- 수동: 고객 신고, 내부 제보

### 13.2 대응 프로세스

```
감지
  ↓
L3 기술 리드 + OA 즉시 통보
  ↓
영향 범위 분석 (어떤 고객 / 어떤 데이터)
  ↓
긴급 패치 or 계정 차단
  ↓
감사 로그 전수 검토
  ↓
고객 통보 (72시간 내, GDPR 기준)
  ↓
사후 분석 보고서 (1주 내, 이해관계자)
  ↓
재발 방지 조치 (규칙 추가, 자동 감지 개선)
```

### G-160-01 — 고객 통보 기준

| 사건 유형 | 통보 기한 |
|---|---|
| 데이터 유출 확인 | 72시간 (GDPR) |
| 데이터 유출 의심 | 7일 내 조사 결과 |
| 서비스 중단 4시간+ | 즉시 |
| 서비스 중단 1시간+ | 당일 |

---

## 14. 참조

- 감사 로그 테이블 DDL: `products/wiring/schemas/INDEX.md § audit_logs`
- HITL 감사 필드: `06_hitl.md § 8` (G-109)
- 위계 감사 대상: `03_hierarchy.md § 10` (G-053)
- 프로덕션 배포 승인: `93_workflow.md § G-220`
- Mode B 격리 원칙: `05_infra_mode.md § 7` (G-087)
- API 키 마스킹 구현: `products/wiring/rules/cost_display.md`
- Git 시크릿 스캔: `93_workflow.md § G-206`
