# LucaPus / Rules / Spec — 기타 (D-091~D-105)

> spec-common 기타 카테고리. 소셜 로그인 / vendor 격리 / 검색 / 파일 업로드 등.
> 대부분 mixed 스코프. 프로젝트 특성별 적합화 잦음.

---

## 개요

| 범위 | 항목 수 | 스코프 |
|---|---|---|
| D-091 ~ D-105 | 15건 | mixed |

---

## D-091 — 소셜 로그인 (OAuth2 기반)

### 본문

OAuth2 + PKCE flow 기본:

```
사용자 → /auth/kakao → Kakao OAuth → callback → 토큰 발급
```

지원 provider: 네이버 / 카카오 / 구글 / 애플.

### 강제 수준

**SHOULD** (B2C 서비스).

### 적합화 HITL ★

🔷 기술 결정 (예시):
```
"소셜 로그인 인프라를 코어에 포함할까요?"
spec-common D-091~092 참조
- A: OAuth2 연동 기반까지 코어, provider 목록 + 추가정보 수집은 도메인 (AI 추천 82%)
- B: 전체를 코어에서 제외 (코어는 이메일/비밀번호만)
- C: Task 2 외부 조사 후 확정
```

---

## D-092 — 소셜 로그인 추가 정보 수집 시점

### 본문

소셜 로그인 성공 후 추가 정보 (전화번호 / 주소 등) 수집 시점:
- 즉시 (로그인 직후) → 이탈률 높음
- 필요 시 (주문 / 견적 진입 시) → 이탈률 낮음

### 강제 수준

**SHOULD**.

### 적합화 HITL

🔶 비즈니스 결정 (PM).

---

## D-093 — 이메일 인증

### 본문

회원 가입 시 이메일 인증:
- `UserVerificationCode` 테이블 (6자리 코드, 10분 만료)
- 재발송 제한 (1분 간격, 5회/일)

### 강제 수준

**SHOULD**.

---

## D-094 — 비밀번호 재설정

### 본문

- 이메일 기반 재설정 (토큰 링크)
- 토큰 TTL: 30분
- 재설정 후 전체 세션 무효화

### 강제 수준

**MUST** (인증 기반 서비스).

---

## D-095 — Vendor 데이터 격리 ★

### 본문

멀티 벤더 (이커머스 / 플랫폼 비즈니스) 에서 Vendor 데이터 분리:

```
User role: USER / ADMIN / VENDOR
VendorProfile: domain.ecommerce.vendor
```

### 적합화 HITL ★

🔷 기술 결정 (실제 Wiring 연출 예시):
```
"사용자 역할에서 VENDOR를 어떻게 분리할까요?"
spec-common D-095 참조
- A: 코어에 USER/ADMIN만, VENDOR는 도메인 확장 (AI 추천 87%)
- B: 전체 포함하되 VENDOR는 미사용 표기
- C: 외부 조사 후 확정
```

---

## D-096 — 파일 업로드

### 본문

- 최대 크기: 50MB (기본)
- MIME 타입 허용 목록 (whitelist)
- virus scanning (ClamAV)
- CDN 경유 서빙

### 강제 수준

**MUST**.

### 적합화 HITL

🔷 기술 결정: 저장소 (S3 / GCS / 자체 호스팅).

---

## D-097 — 검색 기능

### 본문

| 규모 | 도구 |
|---|---|
| 소규모 | DB LIKE / Full-Text Search |
| 중대규모 | Elasticsearch / Meilisearch |
| 대규모 | OpenSearch / Vespa |

### 강제 수준

**SHOULD**.

### 적합화 HITL

🔷 기술 결정.

---

## D-098 — 다국어 (i18n)

### 본문

- 백엔드: Accept-Language 헤더 + 리소스 번들
- 프론트엔드: `next-intl` / `react-i18next`
- DB: 번역 필드 분리 (`name_ko`, `name_en`)

### 강제 수준

**SHOULD** (글로벌 서비스).

---

## D-099 — 시간대 (Timezone)

### 본문

- DB 저장: **UTC** 고정 (TIMESTAMPTZ)
- API 응답: ISO 8601 + TZ (`2026-04-18T14:20:00+09:00`)
- UI 표시: 사용자 TZ 또는 서비스 기본 TZ

### 강제 수준

**MUST**.

### 검증

SSOT Verifier T3: `TIMESTAMP` (TZ 없음) 사용 감지 → 경고.

---

## D-100 — 알림 / 푸시

### 본문

| 채널 | 도구 |
|---|---|
| 이메일 | SendGrid / Resend / SES |
| SMS | Twilio / 국내 문자 API |
| 푸시 | FCM / APNs |
| 인앱 | WebSocket + 알림 테이블 |

### 강제 수준

**SHOULD**.

---

## D-101 — Feature Flag

### 본문

- LaunchDarkly / Unleash (오픈소스)
- 기능 점진 롤아웃 / A/B 테스트
- 긴급 기능 off 스위치

### 강제 수준

**SHOULD** (Enterprise).

---

## D-102 — A/B Testing

### 본문

- Feature Flag 기반
- 실험군 / 대조군 분리 (사용자 hash)
- 통계 유의성 검증

### 강제 수준

**MAY**.

---

## D-103 — 법적 동의

### 본문

- 서비스 이용약관 / 개인정보 처리방침
- 동의 이력 immutable 저장 (`consents` 테이블)
- 개정 시 재동의 프로세스

### 강제 수준

**MUST** (한국 서비스: PIPA).

---

## D-104 — GDPR / PIPA 준수

### 본문

- 수집 최소화
- 사용자 요청 시 조회 / 수정 / 삭제 지원
- Right to be forgotten (Hard Delete)
- 보유 기간 명시

### 강제 수준

**MUST**.

### 연관

- `08_security.md § 11` (G-152)
- `spec_security.md § D-046` (개인정보 암호화)

---

## D-105 — 접근성 (a11y)

### 본문

- WCAG 2.1 AA 이상
- 시맨틱 HTML
- 키보드 네비게이션
- 스크린 리더 aria-label

### 강제 수준

**SHOULD** (공공 / 대기업 B2C).

### 연관

`07_coding_standard.md § G-135`.

---

## 카테고리 요약

| ID | 제목 | 강제 | 적합화 HITL |
|---|---|---|---|
| **D-091** | **소셜 로그인** | SHOULD | 🔷 (잦음) |
| D-092 | 추가 정보 수집 시점 | SHOULD | 🔶 |
| D-093 | 이메일 인증 | SHOULD | — |
| D-094 | 비밀번호 재설정 | MUST | — |
| **D-095** | **Vendor 격리** | MUST | 🔷 (잦음) |
| D-096 | 파일 업로드 | MUST | 🔷 |
| D-097 | 검색 기능 | SHOULD | 🔷 |
| D-098 | 다국어 | SHOULD | 🔶 |
| D-099 | 시간대 | MUST | — |
| D-100 | 알림 / 푸시 | SHOULD | 🔷 |
| D-101 | Feature Flag | SHOULD (Ent) | — |
| D-102 | A/B Testing | MAY | — |
| D-103 | 법적 동의 | MUST | 🔶 |
| D-104 | GDPR / PIPA | MUST | — |
| D-105 | 접근성 | SHOULD | — |

---

## 적합화 프로세스

### 특징

이 카테고리는 **프로젝트 도메인 / 지역에 크게 의존**:
- B2C 국내 → D-091, D-103, D-104 필수
- B2B 글로벌 → D-098, D-099, D-104 (GDPR) 중요
- 플랫폼 비즈니스 → D-095 필수

### 초기 온보딩

- 도메인 감지 (PL-009) → 해당 항목 자동 추천
- 지역 설정 → 컴플라이언스 항목 자동 적용

---

## 자동 검증 체크리스트

- [ ] `TIMESTAMP` (TZ 없음) 사용 (D-099 위반)?
- [ ] 파일 업로드에 MIME 검증 없음 (D-096 위반)?
- [ ] 국내 서비스인데 법적 동의 이력 없음 (D-103 위반)?
- [ ] GDPR 적용 대상에 delete 경로 없음 (D-104 위반)?
- [ ] 외부 노출 금지어 포함?

---

## 참조

- 보안: `spec_security.md` (D-040~050)
- DB 영속성 (감사 필드): `spec_db_persistence.md § D-029`
- 접근성: `07_coding_standard.md § G-135`
- 컴플라이언스: `08_security.md § 11` (G-152)
- 온톨로지 (도메인 매칭): `products/lucapus/rules/ontology.md` (PL-007)
- 실제 HITL 예시 데이터 (D-091, D-095): 프로젝트 knowledge `최종_Wiring_v3_연출데이터.md`
