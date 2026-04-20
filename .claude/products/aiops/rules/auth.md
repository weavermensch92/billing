# AiOPS / Auth — 규칙 본문

> PA-004 본문. AiOPS 고유의 **3단 권한 체계**.
> Wiring의 6단 위계(OA/L1/L2/L3/L4/super)와 다르므로 주의.

---

## PA-004 — 3단 권한 구조 (MUST)

AiOPS는 "AI 사용 모니터링" 도메인 특성상 더 단순한 3단 권한:

| 역할 | 범위 | 주 기능 |
|---|---|---|
| **super_admin** | 전 조직 | 고객사 생성, 모드 할당, 크로스 org 통계 (Gridge 내부 전용) |
| **admin_teams** | 지정 팀 | 담당 팀 대시보드, 팀원 코칭 발송, 이슈 확인 |
| **member** | 본인 | 개인 대시보드, 본인 코칭 카드 |

### Wiring 위계와의 매핑 (G-048)

| AiOPS 역할 | Wiring 위계 (통합 고객사일 때) |
|---|---|
| super_admin | 슈퍼 어드민 (Gridge 운영) |
| admin_teams | OA (Org Admin) 또는 L1~L2 |
| member | L3~L4 |

단, AiOPS를 **단독 판매** 하는 고객은 Wiring 위계와 무관. 3단만 사용.

---

## PA-004-01 — 인증 메커니즘 (MUST)

### 개인 사용자 (대시보드 로그인)

- 기본: 이메일 + 비밀번호 (BCrypt 해싱, G-143)
- SSO: Okta / Azure AD / Google Workspace (SAML 2.0 / OIDC, G-046)
- 2FA: TOTP 기본 / WebAuthn 엔터프라이즈 (G-142)

### 프록시 서버 (고객 앱 → 프록시)

- **x-org-token 헤더** 전용 (`orgs.api_token`)
- 사용자 인증 X (고객 앱이 자체 내부 사용자 관리)
- 토큰 회전: 분기별 + 유출 의심 시 즉시

### API (외부 연동)

- JWT Bearer Token
- 발급: 대시보드 > 설정 > API 토큰
- 만료: 90일, 회전 권장

---

## PA-004-02 — 세션 관리 (MUST)

G-142 정합:

```typescript
interface Session {
  user_id: string;
  org_id: string;
  role: 'super_admin' | 'admin_teams' | 'member';
  admin_teams?: string[];  // admin_teams 역할일 때만
  exp: number;              // Access Token 15분
}

interface RefreshToken {
  user_id: string;
  rotation_id: string;      // 회전 추적
  exp: number;              // 7일
}
```

### 로그아웃

- Access Token 즉시 무효화 (Redis 블랙리스트)
- Refresh Token 무효화 (DB에서 row 삭제)
- 모든 기기 로그아웃: 사용자의 전체 Refresh Token 삭제

---

## PA-004-03 — 권한 매트릭스 (MUST)

| 기능 | member | admin_teams | super_admin |
|---|---|---|---|
| **개인 대시보드 조회** | ✅ 본인 | ✅ 본인 | ✅ 본인 |
| **팀 대시보드 조회** | ❌ | ✅ 담당 팀만 | ✅ 전 팀 |
| **전사 대시보드 조회** | ❌ | ❌ | ✅ |
| **본인 로그 상세** | ✅ 본인 | ✅ 담당 팀원 | ✅ 전체 |
| **다른 사용자 로그 상세** | ❌ | ✅ 담당 팀만 | ✅ 전체 |
| **이슈 알림 확인** | ✅ 본인 | ✅ 담당 팀 | ✅ 전체 |
| **이슈 해소/무시** | ❌ | ✅ 담당 팀 | ✅ 전체 |
| **개인 코칭 수신** | ✅ | ✅ | ✅ |
| **팀 코칭 발송** | ❌ | ✅ 담당 팀 | ✅ 전체 |
| **AI 성숙도 조회** | ❌ | ✅ 담당 팀 | ✅ 전체 |
| **AI 성숙도 외부 공유** | ❌ | ❌ | ✅ (opt-in 필요) |
| **채널 연동 추가** | ❌ | ❌ | ✅ |
| **직원 고지 템플릿 발송** | ❌ | ❌ | ✅ |
| **데이터 보유 정책 변경** | ❌ | ❌ | ✅ |
| **프롬프트 저장 옵션 변경** | ❌ | ❌ | ✅ |
| **SSO 설정** | ❌ | ❌ | ✅ |
| **조직 전체 감사 로그** | ❌ | ❌ | ✅ |
| **사용자 초대/역할 부여** | ❌ | ❌ | ✅ |

### admin_teams 범위 제한

- `users.admin_teams` 배열에 등록된 팀만 접근
- 예: `admin_teams: ['Backend팀', 'Platform팀']` → 이 두 팀만 조회
- super_admin이 할당, admin_teams 본인은 변경 불가

---

## PA-004-04 — 권한 체크 구현 (MUST)

### 서버 사이드 (G-052 서버 필터링 우선)

```typescript
// Supabase RLS (org_id 이미 적용됨, PA-001-04)
// 추가로 role별 스코프 제한

CREATE POLICY "Role-based log access"
  ON logs FOR SELECT
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND CASE
      WHEN (auth.jwt() ->> 'role') = 'super_admin' THEN true
      WHEN (auth.jwt() ->> 'role') = 'admin_teams' THEN
        user_id IN (
          SELECT id FROM users
          WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
            AND team = ANY((auth.jwt() -> 'admin_teams')::text[])
        )
      ELSE user_id = (auth.jwt() ->> 'user_id')::uuid
    END
  );
```

### API 엔드포인트 레벨

```typescript
import { requireRole } from '@/lib/auth';

// GET /api/org/stats — super_admin 전용
export const GET = requireRole('super_admin', async (req, session) => {
  const stats = await computeOrgStats(session.org_id);
  return Response.json(stats);
});

// GET /api/team/[teamName]/stats — admin_teams + super_admin
export const GET = requireRole(['admin_teams', 'super_admin'], async (req, session, { params }) => {
  const { teamName } = params;
  if (session.role === 'admin_teams' && !session.admin_teams.includes(teamName)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const stats = await computeTeamStats(session.org_id, teamName);
  return Response.json(stats);
});
```

### 클라이언트 사이드 (표현 계층만)

```typescript
// 메뉴 가리기는 서버 응답의 `allowed_routes` 에 따름 (G-090)
const { data: { allowed_routes } } = await getSessionMeta();
return allowed_routes.includes('admin') ? <AdminMenu /> : null;
```

---

## PA-004-05 — 역할 부여 흐름 (MUST)

### super_admin 할당

- Gridge 내부 프로세스. 고객사 생성 시 **최초 super_admin 1명**을 이메일로 지정
- 이후 super_admin 본인이 추가 super_admin 승격 가능 (최대 3명 권장)

### admin_teams 할당

- super_admin 또는 기존 admin_teams 가 지정
- 설정 > 팀원 관리 > 사용자 선택 > 역할 변경
- 감사 로그 기록 (G-141): `actor / target / before_role / after_role / admin_teams[]`

### member → admin_teams 승격 예시

```
OA: "김팀장을 Backend팀 admin_teams로 승격"
 → users.role = 'admin_teams'
 → users.admin_teams = ['Backend팀']
 → 감사 로그 기록
 → 김팀장에게 이메일 알림 + 대시보드 새 메뉴 노출
```

---

## PA-004-06 — SSO 매핑 (G-046 연동)

Okta / Azure AD 그룹 → AiOPS 역할 매핑:

```yaml
# .context/sso_mapping.yml (OA가 관리)
sso_provider: okta
role_mapping:
  'AiOPS Super Admins':  super_admin
  'AiOPS Team Leads':    admin_teams
  'AiOPS Users':         member

team_mapping_field: 'department'  # SSO 속성에서 팀 이름 추출
```

### SCIM 프로비저닝

- 사용자 생성/비활성/역할 변경을 SSO → AiOPS 자동 동기화
- 주기: 즉시 (이벤트 기반) + 매 1시간 전체 스윕

---

## PA-004-07 — 비밀 정보 보호 (MUST)

G-150 연동:

- 비밀번호는 **BCrypt cost 12+** 로 해시 (평문 저장 절대 금지)
- `api_token` 은 로그 / 에러 메시지에 노출 금지
- 세션 토큰은 HttpOnly + Secure + SameSite=Strict 쿠키
- Bearer 토큰은 Authorization 헤더로만 (URL 쿼리 금지, G-144-02)

### 로그에서 마스킹

```typescript
// logger.ts 에 자동 마스킹 필터
function maskSecrets(obj: any): any {
  const SECRET_KEYS = /password|token|api_key|secret|auth/i;
  return mapDeep(obj, (key, value) => {
    if (typeof key === 'string' && SECRET_KEYS.test(key)) {
      return typeof value === 'string' ? `***${value.slice(-4)}` : '***';
    }
    return value;
  });
}
```

---

## PA-004-08 — 로그인 감사 (MUST)

G-141 감사 대상 행위 20개 중 "로그인" 항목 구현:

```sql
INSERT INTO audit_logs (
  org_id, action, actor_user, actor_level,
  at,
  before_value, after_value
) VALUES (
  $1, 'login_success', $2, 'member',
  now(),
  jsonb_build_object('ip', $3, 'user_agent', $4),
  NULL
);
```

### 감지 알림 (PA-009 연동)

- 동일 사용자 30분 내 5회+ 로그인 실패 → 계정 잠금 + super_admin 알림
- 새로운 IP / 지리적 위치 → 이메일 알림 ("로그인 확인")
- 2FA 없이 로그인 시도 (조직 MUST로 강제된 경우) → 차단 + 기록

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] Wiring 위계(L1~L4)를 AiOPS 역할로 혼용?
- [ ] member 가 다른 사용자의 로그를 조회 가능?
- [ ] admin_teams 가 담당 팀 외 데이터 접근 가능?
- [ ] super_admin 권한을 클라이언트 조건 분기로 제어 (G-052 위반)?
- [ ] 비밀번호 BCrypt 아닌 다른 해시?
- [ ] `x-org-token` / `api_token` 로그 노출?
- [ ] SSO 매핑 없이 수동 역할 할당만 가능?
- [ ] 로그인 실패 감사 로그 누락?

---

## 참조

- 3단 권한 매핑: `03_hierarchy.md § 4.2` (G-047, G-048)
- SSO 설정: `03_hierarchy.md § 7` (G-046)
- JWT / 2FA: `08_security.md § 3` (G-142)
- 비밀번호 / 암호화: `08_security.md § 4` (G-143)
- 비밀 정보 로그 금지: `08_security.md § 9` (G-150)
- 감사 로그 immutable: `08_security.md § 2` (G-141)
- UI 분기 원칙: `03_hierarchy.md § 9` (G-052) / `05_infra_mode.md § 9` (G-090)
