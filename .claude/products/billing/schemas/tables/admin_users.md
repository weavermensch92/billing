# Billing / Schemas / admin_users — 테이블 본문

> 그릿지 내부 운영자. Super / AM / Finance / Ops 4역할.

---

## DDL

```sql
CREATE TABLE admin_users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,

  -- 역할 (복수 가능)
  role              TEXT NOT NULL CHECK (role IN ('super','am','finance','ops')),
  secondary_roles   TEXT[] DEFAULT ARRAY[]::text[],  -- 겸직

  -- 2FA 필수 (Phase 0 부터)
  twofa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  twofa_secret      TEXT,                             -- TOTP secret (암호화)

  -- IP 화이트리스트
  allowed_ips       INET[],                           -- 널이면 전체 허용

  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','active','suspended','retired')),

  -- 메타
  last_login_at     TIMESTAMPTZ,
  last_ip           INET,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_users_role ON admin_users(role, status);
```

## 역할 정의

| 역할 | 책임 | Phase 0 담당자 |
|---|---|---|
| `super` | 플랫폼 전체 / 서비스 카탈로그 / 위험 액션 | 위버 |
| `am` | 고객 요청 처리 / 월간 리뷰 / 업셀 | Luna |
| `finance` | 청구서 확정 / 수납 / 손익 / 세계서 | (Phase 0 super 겸직) |
| `ops` | VCN 발급 / 카드사 / 결제 모니터링 | (Phase 0 am 겸직) |

Phase 0 기준:
- **Luna = am + ops** (secondary_roles = `['ops']`)
- **위버 = super + finance** (secondary_roles = `['finance']`)

## 권한 매트릭스 (콘솔)

| 페이지 영역 | super | am | finance | ops |
|---|---|---|---|---|
| `/console/orgs/*` 조회 | ✅ | ✅ (담당) | ✅ | ✅ |
| `/console/orgs/new` 신규 등록 | ✅ | ❌ | ❌ | ❌ |
| `/console/requests/*` | ✅ | ✅ | ❌ | ✅ |
| `/console/vcn/*` | ✅ | ❌ | ❌ | ✅ |
| `/console/payments/*` | ✅ | ❌ | ✅ | ✅ |
| `/console/billing/*` | ✅ | ❌ | ✅ | ❌ |
| `/console/csm/*` | ✅ | ✅ | ❌ | ❌ |
| `/console/super/*` | ✅ | ❌ | ❌ | ❌ |

서버 측 `assertRole(req, ['super','am'])` 미들웨어로 강제 (RLS 아님 — admin 은 별도 Auth).

## 2FA + IP 화이트리스트 (Phase 0 필수)

- **2FA**: TOTP 앱 (Google Authenticator 등). `twofa_enabled = TRUE` 아니면 로그인 차단.
- **IP 화이트리스트**: 사무실 IP / VPN IP 등록. 미등록 IP 로그인 시 차단.
  - `allowed_ips` NULL → 전체 허용 (Phase 0 개발 중만)
  - 프로덕션 배포 시 필수 설정

## 초기 시드

```sql
INSERT INTO admin_users (email, name, role, twofa_enabled, status) VALUES
  ('weaver@gridge.ai', 'Weaver', 'super', TRUE, 'active'),
  ('am-luna@gridge.ai', 'Luna', 'am', TRUE, 'active');

UPDATE admin_users SET secondary_roles = ARRAY['ops'] WHERE email = 'am-luna@gridge.ai';
UPDATE admin_users SET secondary_roles = ARRAY['finance'] WHERE email = 'weaver@gridge.ai';
```

## 감사 (별도 Admin Auth)

- 모든 admin 액션 → `audit_logs.actor_type = 'admin'` + `actor_id`
- 민감 액션 (VCN 전체 번호 조회 등) → `visibility = 'internal_only'` 필수
- 매 분기 비활성 admin 자동 retire

## 참조

- 콘솔 인증: `screens/console/login.md` (v0.19)
- 운영 역할 분장: `playbook/team-operations.md` (v0.20)
- am_assignments (AM 고객 매핑): `tables/am_assignments.md` (향후)
- 원본: `03_데이터_모델.md § 5-1 admin_users`
