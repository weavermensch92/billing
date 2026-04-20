# AiOPS / Schemas — INDEX

> AiOPS 백엔드(Supabase) 테이블 카탈로그.
> F/S 체인의 탐색 단계(§ 2.2)가 참조.

---

## 테이블 전수 목록

### 핵심 (PA-001)

| 테이블 | 용도 | 본문 | 우선순위 |
|---|---|---|---|
| `orgs` | 고객 조직 + 옵션 (plan / prompt_storage / infra_mode) | `tables/orgs.md` | ★ P1 |
| `users` | 사용자 + 3단 권한 (super_admin/admin_teams/member) | `tables/users.md` | ★ P1 |
| `logs` | 모든 AI 호출 로그 | `tables/logs.md` | ★ P1 |

### 알림 / 거버넌스 (PA-007~009)

| 테이블 | 용도 | 본문 | 우선순위 |
|---|---|---|---|
| `alerts` | 감지된 이상 알림 | `tables/alerts.md` | P1 |
| `audit_logs` | immutable 감사 로그 | `tables/audit_logs.md` | ★ P1 |

### 분석 (PA-010)

| 테이블 | 용도 | 본문 | 우선순위 |
|---|---|---|---|
| `maturity_scores` | AI 성숙도 주간 스냅샷 | `tables/maturity_scores.md` | P2 |
| `usage_patterns` | 일간 집계 (재질문 / 세션 깊이 등) | `tables/usage_patterns.md` | P2 |
| `coaching_cards` | 개인 코칭 카드 (발송 이력) | `tables/coaching_cards.md` | P2 |

### 연동 (I-xxx)

| 테이블 | 용도 | 본문 | 우선순위 |
|---|---|---|---|
| `integrations` | Slack / SSO 등 외부 연동 상태 | `tables/integrations.md` | P2 |
| `msp_signals` | MSP 업셀 신호 (내부 영업용) | `tables/msp_signals.md` | P3 |

---

## ★ 핵심 테이블 인라인 DDL

본문 파일 미존재 시 이 요약으로 대체 가능.

### logs (PA-001)

→ `products/aiops/rules/data_model.md § PA-001` 에 전체 DDL 포함.

### audit_logs (G-141)

```sql
CREATE TABLE audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,

  action        text NOT NULL,
  actor_user    uuid NOT NULL REFERENCES users(id),
  actor_role    text NOT NULL,

  target_type   text,
  target_id     uuid,

  before_value  jsonb,
  after_value   jsonb,

  ip_address    inet,
  user_agent    text,

  at            timestamptz NOT NULL DEFAULT now()
);

-- immutable
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

CREATE INDEX idx_audit_org_time ON audit_logs(org_id, at DESC);
CREATE INDEX idx_audit_actor ON audit_logs(actor_user, at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, at DESC);
```

### alerts (PA-009)

→ `products/aiops/rules/alerts.md § PA-009-02` 에 전체 DDL 포함.

### maturity_scores (PA-010)

→ `products/aiops/rules/maturity.md § PA-010-03` 에 전체 DDL 포함.

---

## 공통 RLS 원칙

G-144 정합. 모든 테이블에 RLS:

- **SELECT**: `org_id = session.org_id` + 역할별 스코프 (PA-004-04)
- **INSERT**: 프록시 서버는 service role (RLS 우회), 사용자 액션은 명시 권한
- **UPDATE**: `audit_logs`, 저장된 `logs`는 불가. `alerts.status`만 가능.
- **DELETE**: `audit_logs` 절대 불가. 나머지는 org_id 일치 + 관리자만.

---

## 스키마 마이그레이션

- Supabase 마이그레이션: `supabase/migrations/`
- S 체인 진입 시 진행
- 컬럼 추가: `NOT NULL` 금지 (backward compat), `DEFAULT` 또는 `NULL` 만

---

## 참조

- 전체 데이터 모델: `products/aiops/rules/data_model.md` (PA-001)
- 권한 / RLS: `products/aiops/rules/auth.md` (PA-004)
- 감사 규칙: `08_security.md § 2` (G-141)
- Wiring schemas INDEX (스타일 정합): `products/wiring/schemas/INDEX.md`
