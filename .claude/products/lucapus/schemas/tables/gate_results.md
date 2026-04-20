# LucaPus / Schemas / gate_results — 테이블 본문

> PL-005 4-Tier Gate (T1~T4) 실행 결과.
> SSOT Verifier + 정적 분석 + 테스트 + 규칙 검증 + 보안 각 단계 이력.

---

## DDL

```sql
CREATE TABLE gate_results (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 대상
  pr_id          text NOT NULL,              -- GitHub/GitLab PR 식별자
  commit_sha     text,                        -- Git commit hash
  branch         text,                        -- 브랜치명
  
  -- 게이트 정보
  tier           smallint NOT NULL CHECK (tier BETWEEN 1 AND 4),
  verdict        text NOT NULL CHECK (verdict IN ('pass','warn','fail','skipped')),
  duration_ms    integer NOT NULL,

  -- 실행 결과
  issues         jsonb DEFAULT '[]'::jsonb,
  /* Issue[] 배열:
     [{
       "severity": "error",
       "category": "contract",
       "file": "src/payment/controller.ts",
       "line": 42,
       "message": "...",
       "related_spec": "architecture.md § 4.2",
       "related_rule_id": "rule-bcrypt"
     }]
  */
  
  -- 긴급 배포 / 스킵 (PL-005-04)
  skipped_reason text,                       -- skipped 일 때만
  emergency_deploy_by uuid REFERENCES users(id),
  retroactive_check_scheduled_at timestamptz,

  -- 메타
  run_at         timestamptz NOT NULL DEFAULT now(),
  run_by         text NOT NULL DEFAULT 'system',  -- 'system' | user_id (긴급 배포 시)
  retry_attempt  integer NOT NULL DEFAULT 0       -- 재생성 시도 횟수
);

-- 인덱스
CREATE INDEX idx_gate_project_pr ON gate_results(project_id, pr_id, tier);
CREATE INDEX idx_gate_failed ON gate_results(project_id, verdict, run_at DESC)
  WHERE verdict = 'fail';
CREATE INDEX idx_gate_skipped ON gate_results(project_id, run_at DESC)
  WHERE verdict = 'skipped';

-- RLS
ALTER TABLE gate_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gate_results_org_isolation"
  ON gate_results FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- immutable (PL-005-04)
CREATE POLICY "gate_results_system_write"
  ON gate_results FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') IN ('gridge_system', 'gridge_lucapus'));

CREATE RULE gate_results_no_update AS ON UPDATE TO gate_results DO INSTEAD NOTHING;
CREATE RULE gate_results_no_delete AS ON DELETE TO gate_results DO INSTEAD NOTHING;
```

---

## 필드 설명

### `tier` / `verdict`

4-Tier Gate (PL-005-03):

| Tier | 용도 | verdict=fail 동작 |
|---|---|---|
| 1 | 정적 분석 (lint/tsc) | 재생성 3회 후 Tech Leader 에스컬레이션 |
| 2 | 테스트 (단위/통합) | QA Verifier 결함 재현 |
| 3 | 적합화 규칙 준수 (T3 = SSOT Verifier policy_check) | Tech Leader 검토 → 규칙 예외 or 수정 |
| 4 | 보안 + 컴플라이언스 | 배포 차단 + OA 즉시 알림 |

### `issues`

T3/T4 에서 특히 중요. `related_rule_id` 로 `rule_timeline` 참조:

```json
[
  {
    "severity": "error",
    "category": "policy",
    "file": "src/auth/login.ts",
    "line": 15,
    "message": "BCrypt 해싱 누락 — 조직 MUST 위반",
    "related_rule_id": "rule-bcrypt"
  }
]
```

### `skipped` + 긴급 배포 (PL-005-04)

긴급 배포 모드에서 T3/T4 스킵 허용 (T1+T2 필수):
```json
{
  "tier": 3,
  "verdict": "skipped",
  "skipped_reason": "prod incident - OA approved emergency deploy",
  "emergency_deploy_by": "user-oa-id",
  "retroactive_check_scheduled_at": "2026-04-19T00:00:00Z"
}
```

사후 24h 내 재검증 필수 + 감사 로그 (G-141).

---

## 성능 목표 (PL-005-06)

| Tier | p50 | p99 |
|---|---|---|
| T1 | 30s | 2min |
| T2 | 3min | 15min |
| T3 | 1min | 5min |
| T4 | 2min | 10min |

`duration_ms` 로 이 메트릭 모니터링.

---

## 조회 패턴

### PR 전체 게이트 상태

```sql
SELECT tier, verdict, duration_ms, jsonb_array_length(issues) as issue_count
FROM gate_results
WHERE project_id = $1 AND pr_id = $2
ORDER BY tier;
```

### 최근 실패 이슈 (Wiring 운영 탭)

```sql
SELECT pr_id, tier, issues, run_at
FROM gate_results
WHERE project_id = $1 AND verdict = 'fail'
  AND run_at > now() - interval '7 days'
ORDER BY run_at DESC
LIMIT 50;
```

### 긴급 배포 이력 (감사)

```sql
SELECT gr.*, u.name as deploy_approver
FROM gate_results gr
LEFT JOIN users u ON u.id = gr.emergency_deploy_by
WHERE gr.project_id = $1
  AND gr.verdict = 'skipped'
ORDER BY gr.run_at DESC;
```

---

## Wiring UI 반영

실시간 로그 탭에 게이트 결과 스트리밍 (I-002 이벤트):
- `{ type: 'gate.result', pr_id, tier, verdict }`
- 로그 카테고리: 검증🔍

---

## 관계

- `gate_results.pr_id` → GitHub/GitLab 외부 참조 (FK 아님)
- `gate_results.issues[].related_rule_id` → `rule_timeline.rule_id`
- `gate_results.emergency_deploy_by` → `users.id`

---

## 참조

- 4-Tier Gate 규칙: `products/lucapus/rules/gate.md` (PL-005)
- 우회 금지: `products/lucapus/rules/gate.md § PL-005-04`
- 외부 노출 금지 (T1~T4 용어): `01_product.md § 4` (G-004)
- 감사 로그: `products/wiring/schemas/tables/audit_logs.md`
- Wiring 실시간 로그: `products/wiring/rules/pipeline_view.md`
