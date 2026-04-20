# Wiring / Schemas / orgs — 테이블 본문

> Wiring 고객 조직. AiOPS / Billing 과는 별개 테이블 (product-level separation G-091-06).

---

## DDL

```sql
CREATE TABLE orgs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  plan             TEXT NOT NULL CHECK (plan IN ('starter','business','enterprise')),
  infra_mode       TEXT NOT NULL CHECK (infra_mode IN ('A','B','C')),
  
  -- Wiring 고유 설정
  hierarchy_enabled BOOLEAN DEFAULT TRUE,    -- 6단 위계 사용 여부
  hitl_strictness   TEXT DEFAULT 'standard'
                    CHECK (hitl_strictness IN ('relaxed','standard','strict')),
  
  -- 온톨로지 / 규칙 그래프
  ontology_version  TEXT,                    -- '2026-05-01' 등
  rule_graph_enabled BOOLEAN DEFAULT TRUE,
  
  -- 외부 연동
  slack_workspace_id TEXT,
  default_jira_project_key TEXT,
  
  -- 상태
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','suspended','terminated')),
  
  -- 연계 (다른 제품)
  aiops_org_id     UUID,     -- AiOPS 동일 고객
  billing_org_id   UUID,     -- Billing 동일 고객
  
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orgs_status ON orgs(status) WHERE status = 'active';
CREATE INDEX idx_orgs_infra_mode ON orgs(infra_mode);
```

## Wiring 고유 필드

### `hierarchy_enabled`
6단 위계 (CTO / PM / TL / SE / Jr. Dev / QA) 활성화 여부. OFF 면 플랫 구조 (모든 멤버 동등).

### `hitl_strictness` (PW-002~004 연계)
| 값 | 의미 |
|---|---|
| `relaxed` | L1 에이전트 자동 승인, L2 이상 HITL |
| `standard` | L2 이상 HITL, 긴급 처리 후 보고 가능 |
| `strict` | L1~L6 전 단계 HITL, 모든 단계 명시 승인 |

### `ontology_version`
조직별 온톨로지 스냅샷. PW-006 적합화 기준. 버전 변경 시 기존 분류 재검증 트리거.

## Mode 별 연동 (I-001~I-003)

- **Mode A**: 다 Gridge 호스팅
- **Mode B**: 온프레미스 (hitl 절차만 Gridge, 데이터 자체 격리)
- **Mode C**: 고객 API 키, 실행 격리

## RLS

```sql
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orgs_member_select"
  ON orgs FOR SELECT
  USING (
    id IN (SELECT org_id FROM users WHERE auth_user_id = auth.uid())
  );
```

## 연계 (Cross-product)

```sql
-- AiOPS + Wiring 병행 고객 조회
SELECT w.* FROM wiring.orgs w
WHERE w.aiops_org_id IS NOT NULL;

-- 3제품 전체 (AiOPS + Billing + Wiring)
SELECT w.* FROM wiring.orgs w
WHERE w.aiops_org_id IS NOT NULL AND w.billing_org_id IS NOT NULL;
```

업셀 전환율 KPI 계산 원본.

## 참조

- 디자인 원칙: `rules/design.md` (PW-001)
- 6단 위계: `products/wiring/schemas/tables/users.md`
- Mode 경계: `rules/05_infra_mode.md` (G-080~091)
- I-001 AiOPS 연동: `integrations/aiops-wiring.md`
- Billing 연동 (I-005): `integrations/billing-wiring.md`
