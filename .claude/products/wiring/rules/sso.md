# Wiring / SSO — 규칙 본문

> PW-014 본문. Wiring 웹 UI의 SSO 연동 구현 규칙.
> 엔터프라이즈 고객 필수. SAML / OIDC / SCIM 프로토콜.

---

## PW-014 — SSO 연동 (MUST)

### 지원 프로토콜

- **SAML 2.0** — Okta / Azure AD / OneLogin / Ping
- **OIDC** — Auth0 / Keycloak / Google Workspace
- **SCIM 2.0** — 사용자 프로비저닝 (선택)

G-046 / G-142-02 / PW-010-05 정합.

### UI 위치

`/org/sso` (Org Admin 전용 페이지, PW-010-05 참조)

---

## PW-014-01 — SAML 2.0 구현 (MUST)

### 라이브러리

- `samlify` (Node.js 표준 SAML 라이브러리)
- 또는 `passport-saml` (Express.js 통합)

### 설정 흐름

```
1. OA가 /org/sso 접속
2. [SAML 연결하기] 클릭
3. Gridge 측 정보 제공 (복사 가능):
   - Entity ID: https://wiring.gridge.ai/saml/{org_id}/metadata
   - ACS URL: https://wiring.gridge.ai/sso/saml/{org_id}/acs
   - SLS URL: https://wiring.gridge.ai/sso/saml/{org_id}/sls
4. OA가 IdP(Okta 등)에 Gridge 앱 등록
5. IdP Metadata XML 업로드 or URL 입력
6. Gridge가 Metadata 파싱 → DB 저장
7. [테스트 로그인] → 성공 확인
8. 활성화
```

### Assertion 검증 필수 (MUST)

```typescript
import * as samlify from 'samlify';

const sp = samlify.ServiceProvider({ ... });
const idp = samlify.IdentityProvider({
  metadata: await fetchIdpMetadata(org.sso_metadata_url),
});

async function handleSAMLCallback(req, res) {
  try {
    const { extract } = await sp.parseLoginResponse(idp, 'post', req);

    // ✅ 반드시 검증
    // - 서명 검증 (samlify 기본)
    // - NotBefore / NotOnOrAfter 시간 검증
    // - Audience 검증 (Entity ID 일치)
    // - Subject 추출

    const externalId = extract.nameID;
    const email = extract.attributes.email;
    const groups = extract.attributes.groups;

    // 역할 매핑
    const role = mapGroupsToLevel(org.id, groups);

    // 세션 생성
    const session = await createSession({ email, role, org_id: org.id });
    res.cookie('session', session.token, { httpOnly: true, secure: true });
    res.redirect('/');
  } catch (err) {
    // 감사 로그
    await logAuditEvent({ action: 'sso_login_failed', reason: err.message });
    res.status(401).send('SSO authentication failed');
  }
}
```

### 금지 사항

- ❌ Assertion 서명 검증 생략
- ❌ NotOnOrAfter 시간 무시 (재전송 공격 가능)
- ❌ HTTP 엔드포인트 허용 (HTTPS만)
- ❌ `unauthenticated SAML` 모드

---

## PW-014-02 — OIDC 구현 (MUST)

### 라이브러리

- `openid-client` (Node.js 표준)
- 또는 NextAuth.js 의 OIDC provider

### 설정 흐름

```
1. OA가 /org/sso 접속
2. [OIDC 연결하기] 선택
3. 입력 필드:
   - Issuer URL (예: https://company.okta.com/oauth2/default)
   - Client ID
   - Client Secret (암호화 저장)
   - Scopes (기본: openid profile email groups)
4. [테스트 연결]
5. 활성화
```

### 세션 처리

```typescript
import { Issuer } from 'openid-client';

const issuer = await Issuer.discover(org.oidc_issuer);
const client = new issuer.Client({
  client_id: org.oidc_client_id,
  client_secret: decrypt(org.oidc_client_secret),
  redirect_uris: [`https://wiring.gridge.ai/sso/oidc/${org.id}/callback`],
});

async function handleOIDCCallback(req, res) {
  const params = client.callbackParams(req);
  const tokenSet = await client.callback(redirectUri, params, { state });

  // ✅ ID token 검증 (nonce, iss, aud, exp)
  const userinfo = await client.userinfo(tokenSet.access_token);

  const role = mapGroupsToLevel(org.id, userinfo.groups);
  const session = await createSession({
    email: userinfo.email,
    role,
    org_id: org.id,
  });
  res.cookie('session', session.token, { httpOnly: true, secure: true, sameSite: 'strict' });
  res.redirect('/');
}
```

### State & Nonce

- `state`: CSRF 방지 (세션 저장 + 콜백 검증)
- `nonce`: ID token replay 방지 (랜덤 값, ID token에 포함 확인)

---

## PW-014-03 — SCIM 2.0 프로비저닝 (SHOULD)

### 목적

IdP 에서 사용자 추가/수정/비활성화 시 Wiring 자동 동기화.

### 엔드포인트

```
POST   /scim/v2/Users          — 사용자 생성
GET    /scim/v2/Users          — 사용자 목록
GET    /scim/v2/Users/:id      — 사용자 조회
PATCH  /scim/v2/Users/:id      — 사용자 수정
DELETE /scim/v2/Users/:id      — 사용자 비활성화 (soft delete)
```

### 인증

- Bearer Token 방식 (SCIM Token)
- OA 가 `/org/sso` 에서 발급/회전
- 90일 만료, 분기별 회전 권장

### 스키마

```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "userName": "john.doe@company.com",
  "name": {
    "familyName": "Doe",
    "givenName": "John"
  },
  "emails": [{ "value": "john.doe@company.com", "primary": true }],
  "groups": [{ "display": "Engineers" }],
  "active": true
}
```

### 그룹 → 역할 매핑 (SCIM)

SCIM 이 전달한 `groups` 배열로 자동 역할 할당. 수동 역할 변경은 SCIM 활성 시 **잠금**.

---

## PW-014-04 — 역할 매핑 (MUST)

### 설정 UI

```
SSO 그룹 → Wiring 위계 매핑:

  [Okta Group            ▼]    [Wiring Level ▼]
  "IT Administrators"           OA
  "Executive"                   L1
  "Product Managers"            L2
  "Engineering Leaders"         L3
  "Engineers"                   L4

[+ 매핑 추가]   [저장]
```

### 매핑 규칙

- 하나의 그룹이 하나의 위계에만 매핑 (1:1)
- 하나의 사용자가 여러 그룹 속할 경우 **가장 높은 위계** 적용 (OA > L1 > L2 > ...)
- 매핑되지 않은 그룹 = 로그인 거부 (OA에게 알림)

### 변경 감사

- 매핑 변경 시 감사 로그 (G-141)
- 영향 받는 사용자 목록 프리뷰: "이 변경으로 12명이 재매핑됩니다"

---

## PW-014-05 — 테스트 로그인 (MUST)

연결 설정 후 실제 로그인으로 검증:

```
[테스트 로그인] 클릭
 → IdP로 리다이렉트
 → 사용자 SSO 인증
 → 콜백 도착
 → 추출된 속성 표시:
     - NameID: john.doe@company.com
     - Email: john.doe@company.com
     - Groups: ['Engineers', 'AllStaff']
     - 매핑된 위계: L4
 → "이 속성으로 로그인 할까요?" [확인] [거부]
```

### 검증 실패 시

구체적 에러 메시지:
- "NameID 없음" → IdP에서 `nameid-format:emailAddress` 설정 필요
- "그룹 매핑 없음" → 사용자가 매핑된 그룹에 속하지 않음
- "시간 차이" → IdP와 서버 시간 동기화 확인

---

## PW-014-06 — 백업 로컬 로그인 (MUST)

### 왜 필요한가

SSO 장애 시 OA 가 Wiring에 접근 불가 → 복구 불가능.

### 구현

- OA 1명 이상은 **로컬 비밀번호 로그인 가능** (비밀번호 설정 강제)
- SSO 로그인 시 로컬 비밀번호는 내부적으로 비활성 (보안)
- SSO 장애 감지 시 로그인 페이지에 "로컬 로그인" 옵션 노출
- 로컬 로그인은 2FA 필수 (G-142)

### 감사

로컬 로그인 사용 시 특별 감사 로그:
```
{
  "action": "local_admin_login_during_sso_outage",
  "actor": "OA (김영희)",
  "reason": "sso_provider_unreachable",
  "sso_last_success": "2026-04-18 09:00",
  "at": "..."
}
```

---

## PW-014-07 — 세션 & 로그아웃 (MUST)

### SLO (Single Log-Out)

SAML/OIDC 지원:
- 사용자가 IdP에서 로그아웃 → Gridge 세션 무효화 (IdP 통지 기반)
- 사용자가 Gridge에서 로그아웃 → IdP 세션 유지 (다른 앱 영향 X)
- OA 가 "전체 기기 로그아웃" 옵션 선택 시 IdP 세션까지 종료 시도

### 세션 만료

- 일반 SSO 세션: 8시간 (기본, IdP 설정 따름)
- 유휴 시간: 30분 후 재인증 (high-security 모드)

---

## PW-014-08 — 외부 노출 금지 (MUST)

G-004 정합. SSO 설정 UI / 에러 메시지에 다음 금지:

- `LucaPus`, `Paperclip`, `voyage`, `하네스`
- 내부 서버 호스트명 / IP

대신:
- "Wiring 인증 서비스"
- "Gridge SSO"

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] SAML Assertion 서명 검증 생략?
- [ ] OIDC state/nonce 검증 누락?
- [ ] Client Secret 평문 저장 (G-143 위반)?
- [ ] HTTP 엔드포인트 허용 (HTTPS만이어야 함)?
- [ ] SCIM Token 로그 노출 (G-150 위반)?
- [ ] 로컬 백업 로그인 없음 (SSO 장애 시 복구 불가)?
- [ ] 매핑되지 않은 그룹에 자동 L4 부여 (권한 누수)?
- [ ] 역할 매핑 변경 시 감사 로그 누락?

---

## 참조

- SSO 매핑 원칙: `03_hierarchy.md § 7` (G-046)
- 인증 / 세션: `08_security.md § 3` (G-142)
- 암호화 / 시크릿: `08_security.md § 4, 9` (G-143, G-150)
- Org Admin UI: `products/wiring/screens/org_admin.md § PW-010-05`
- 외부 노출 금지: `01_product.md § 4` (G-004)
- AiOPS 3단 권한 매핑: `products/aiops/rules/auth.md § PA-004-06`
