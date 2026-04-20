# Skills — Supabase

> DB (Postgres) + Auth + Storage + Realtime.
> Wiring / AiOPS 백엔드 공통. Mode A/C 는 Gridge managed, Mode B 는 고객 self-hosted.

---

## 사용 영역

| 영역 | 용도 |
|---|---|
| DB (Postgres) | 모든 스키마 (`products/*/schemas/`) |
| Auth | JWT 기반 세션 (G-142) |
| RLS (Row Level Security) | 조직 격리 (G-144) |
| Realtime | 칸반 / 적합화 탭 실시간 업데이트 |
| Storage | 파일 업로드 (D-096) |
| Edge Functions | 가벼운 서버리스 (옵션) |

---

## RLS 패턴 (G-144 정합)

### 조직 격리 (기본)

```sql
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "items_org_isolation"
  ON items FOR ALL
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
```

### 위계별 접근

```sql
CREATE POLICY "audit_logs_level_gate"
  ON audit_logs FOR SELECT
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND CASE
      WHEN (auth.jwt() ->> 'level') IN ('OA','super') THEN true
      WHEN (auth.jwt() ->> 'level') = 'L1' THEN project_id IS NOT NULL
      WHEN (auth.jwt() ->> 'level') = 'L2' THEN project_id = ANY(my_projects())
      ELSE false
    END
  );
```

### Immutable (G-141)

```sql
CREATE RULE audit_logs_no_update AS
  ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS
  ON DELETE TO audit_logs DO INSTEAD NOTHING;
```

---

## 마이그레이션

### 구조

```
supabase/
├── migrations/
│   ├── 2026-04-18-14-30_init.sql
│   ├── 2026-04-18-15-00_add_hitl_cards.sql
│   └── ...
└── config.toml
```

### 규칙 (D-020~022)

- Forward only (DOWN 금지)
- Backward compatible (기존 row 영향 X)
- `CONCURRENTLY` 인덱스 추가

---

## 클라이언트 초기화

```typescript
// lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 10 } },
  }
);
```

### Server-side (RLS 우회 시)

```typescript
// lib/supabase/admin.ts (service role, 서버에서만)
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,  // ⚠ 서버 전용, 절대 클라이언트 노출 X
  { auth: { persistSession: false } }
);
```

---

## Realtime 구독

```typescript
const channel = supabase
  .channel('adapt-cards')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'hitl_cards',
    filter: `project_id=eq.${projectId}`,
  }, (payload) => {
    useAdaptStore.getState().handleRealtime(payload);
  })
  .subscribe();

return () => supabase.removeChannel(channel);
```

### 주의

- 필터는 `filter` 옵션에 (RLS 와 별개)
- 클라이언트 측 추가 권한 체크 필요 (RLS 가 기본 막지만)

---

## Auth

### SSO (SAML/OIDC) 연동

Supabase Auth + Custom SSO provider.
상세: `products/wiring/rules/sso.md` (PW-014).

### JWT 커스텀 claims

```typescript
// Hook: before_jwt_creation
const claims = {
  org_id: user.org_id,
  level: user.level,
  team_id: user.team_id,
};
```

---

## Mode B (Self-hosted)

- 고객 서버에 Supabase 자체 배포 (Docker Compose)
- 외부 Supabase.com 사용 금지 (데이터 반출)
- 업데이트는 고객 IT 팀 담당

---

## 자동 검증 체크리스트

- [ ] `service_role` 키가 클라이언트 번들에 포함?
- [ ] RLS 누락 테이블?
- [ ] `audit_logs` UPDATE/DELETE 규칙 없음 (G-141 위반)?
- [ ] Realtime 필터 없이 전체 구독 (성능 이슈)?
- [ ] Mode B 고객이 Supabase.com 사용?

---

## 참조

- G-141 감사 immutable: `08_security.md § 2`
- G-144 RLS: `08_security.md § 5`
- 위계: `03_hierarchy.md`
- Wiring schemas INDEX: `products/wiring/schemas/INDEX.md`
- AiOPS schemas INDEX: `products/aiops/schemas/INDEX.md`
