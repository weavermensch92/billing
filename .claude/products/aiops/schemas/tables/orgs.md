# AiOPS / Schemas / orgs — 테이블 본문

> AiOPS 고객 조직. plan / prompt_storage / infra_mode 3개 옵션.

---

## DDL

```sql
CREATE TABLE orgs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  plan                TEXT NOT NULL CHECK (plan IN ('starter','growth','enterprise')),
  infra_mode          TEXT NOT NULL CHECK (infra_mode IN ('A','B','C')),

  -- 옵션 (PA-007 관리자 ON/OFF)
  prompt_storage      TEXT NOT NULL DEFAULT 'optional'
                      CHECK (prompt_storage IN ('optional','required','disabled')),
  sensitive_detection BOOLEAN DEFAULT TRUE,

  -- API 토큰 (PA-004)
  api_token           TEXT UNIQUE NOT NULL,  -- 'ak_...' 형식
  api_token_rotated_at TIMESTAMPTZ,

  -- 상태
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','suspended','terminated')),
  
  -- 통계
  daily_log_count     INT DEFAULT 0,  -- 배치 갱신

  -- 연동 (I-004 Billing 연계)
  billing_org_id      UUID,  -- Billing Mode D 병행 고객

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orgs_status ON orgs(status) WHERE status = 'active';
CREATE INDEX idx_orgs_infra_mode ON orgs(infra_mode);
```

## plan 매트릭스 (PA-xxx 연계)

| plan | 월 가격 | 기능 |
|---|---|---|
| `starter` | ₩29만 | 모니터링 + 기본 코칭 |
| `growth` | ₩99만 | 전체 기능 + 컴플라이언스 옵션 |
| `enterprise` | 협의 | + 전담 CS + 커스텀 |

## infra_mode (Mode A/B/C)

- `A`: Gridge 관리 API 키 (기본)
- `B`: 고객 온프레미스 LLM (G-087 격리)
- `C`: 고객 직접 API 키 (G-088)

## 특수 필드

### `prompt_storage` (PA-007)
- `optional`: 고객이 설정에서 선택
- `required`: 저장 필수 (감사 요건)
- `disabled`: 프롬프트 저장 안 함 (민감 업종)

### `billing_org_id` (I-004 연계)
Billing MSP (Mode D) 와 동일 고객 매칭. NULL 이면 AiOPS 단독 고객.

## RLS

```sql
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;

-- 본인 조직만
CREATE POLICY "orgs_member_select"
  ON orgs FOR SELECT
  USING (
    id IN (
      SELECT org_id FROM users WHERE auth_user_id = auth.uid()
    )
  );
```

## 참조

- `logs` / `users`: `tables/logs.md` / `tables/users.md`
- infra_mode 규칙: `05_infra_mode.md` (G-080~090)
- Mode B 격리: `rules/onprem.md` (PA-011)
- Billing 연동: `integrations/billing-aiops.md` (I-004)
