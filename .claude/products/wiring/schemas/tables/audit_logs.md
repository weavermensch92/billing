# Wiring / Schemas / audit_logs — 테이블 본문

> `audit_logs` 테이블 — immutable 감사 로그.
> G-141 정합. 모든 감사 대상 행위 20종 기록.

---

## DDL

```sql
CREATE TABLE audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,    -- NULL이면 조직 레벨

  -- 행위
  action          text NOT NULL,
  /* 대상 행위 (G-141):
     HITL_resolved, rule_edited, pattern_promoted, ontology_decision,
     pr_merged, prod_deployed,
     role_changed, team_changed, org_must_added, sso_configured,
     infra_mode_changed, harness_redesigned, stage_changed,
     data_exported, api_key_rotated,
     login_success, login_failed, permission_denied, retention_changed
  */

  -- 행위자
  actor_user      uuid NOT NULL REFERENCES users(id),
  actor_level     text NOT NULL CHECK (actor_level IN ('super','OA','L1','L2','L3','L4')),

  -- 대상 (행위에 따라 다름)
  target_type     text,            -- 'rule', 'user', 'team', 'project', 'sso_config', ...
  target_id       uuid,
  target_name     text,            -- 인간이 읽을 수 있는 이름

  -- 변경 내용
  before_value    jsonb,           -- 이전 상태
  after_value     jsonb,           -- 이후 상태

  -- 부가 정보
  description     text,            -- 자연어 설명 ("L4 → L3 승격")
  reason          text,            -- 사용자 입력 이유 (선택)

  -- 요청 메타
  ip_address      inet,
  user_agent      text,

  -- 시각
  at              timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_audit_org_time ON audit_logs(org_id, at DESC);
CREATE INDEX idx_audit_project_time ON audit_logs(project_id, at DESC);
CREATE INDEX idx_audit_actor ON audit_logs(actor_user, at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, at DESC);
CREATE INDEX idx_audit_target ON audit_logs(target_type, target_id, at DESC);

-- Immutable (G-141-01)
CREATE RULE audit_logs_no_update AS
  ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS
  ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_read"
  ON audit_logs FOR SELECT
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND CASE
      WHEN (auth.jwt() ->> 'level') IN ('OA','super') THEN true
      WHEN (auth.jwt() ->> 'level') = 'L1' THEN project_id IS NOT NULL  -- 조직 레벨 감사는 L1 접근 X
      WHEN (auth.jwt() ->> 'level') = 'L2' THEN project_id = ANY(my_projects())
      ELSE false
    END
  );

CREATE POLICY "audit_logs_insert"
  ON audit_logs FOR INSERT
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);
```

---

## 필드 설명

### `action` (20종)

G-141 § 2.3 감사 대상 행위 카탈로그와 1:1 매핑:

| 행위 카테고리 | action 값 |
|---|---|
| 적합화 | `HITL_resolved`, `rule_edited`, `pattern_promoted`, `ontology_decision` |
| 코드 | `pr_merged`, `prod_deployed` |
| 위계/권한 | `role_changed`, `team_changed`, `org_must_added`, `sso_configured` |
| 인프라 | `infra_mode_changed`, `harness_redesigned`, `stage_changed` |
| 데이터 | `data_exported`, `api_key_rotated` |
| 보안 | `login_success`, `login_failed`, `permission_denied`, `retention_changed` |

### `actor_level`

행위 당시 사용자의 위계. 나중에 위계가 바뀌어도 **이 로그의 값은 불변**.

### `before_value` / `after_value`

jsonb 형식. 예:

```json
// role_changed
{
  "before_value": { "level": "L4" },
  "after_value": { "level": "L3" }
}

// infra_mode_changed
{
  "before_value": { "mode": "A" },
  "after_value": { "mode": "B", "reason": "고객 요청 — 보안 심사 통과 조건" }
}

// HITL_resolved (G-109 감사 필드 포함)
{
  "before_value": null,
  "after_value": {
    "card_id": "uuid",
    "option_id": "restore",
    "duration_sec": 142,
    "aligned_with_ai": true,
    "ai_recommendation": "restore",
    "ai_confidence": 87
  }
}
```

### `target_type`

감사 대상 분류:
- `rule` — 적합화 규칙
- `user` — 사용자
- `team` — 팀
- `project` — 프로젝트
- `sso_config` — SSO 설정
- `harness_config` — 하네스 배정
- `api_key` — Mode C API 키

---

## Immutable 원칙 (MUST)

### 데이터베이스 수준

```sql
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
```

UPDATE / DELETE 시도가 조용히 무시됨. 시도 자체도 별도 감사 테이블(`audit_tamper_attempts`)에 기록하는 것을 권장.

### 애플리케이션 수준

- API 엔드포인트 **존재 금지**: `PATCH /audit_logs/:id`, `DELETE /audit_logs/:id`
- Admin 도구 / 스크립트도 UPDATE 문 작성 금지
- 코드 리뷰 시 `UPDATE audit_logs` / `DELETE FROM audit_logs` 패턴 감지 → Conflict

---

## 보유 기간 (MUST)

G-145 정합:

- 기본: 1년
- 엔터프라이즈 옵션: 3년, 5년, 무기한
- OA가 설정 > 감사 로그에서 변경 가능 (최소값 1년, G-145)

### 아카이빙

보유 기간 경과 시:
- 콜드 스토리지 이관 (S3 Glacier 등)
- DB에서는 제거, 필요 시 복원 가능
- 아카이빙 자체도 감사 로그 대상 (`retention_changed`)

---

## 내보내기 (MUST)

G-141-02 정합. 4가지 포맷:

| 포맷 | 용도 |
|---|---|
| CSV | 엑셀 분석 / 간단 리포트 |
| PDF | 법적 증거 제출 |
| JSON | 시스템 연동 |
| ZIP | 전체 (모든 포맷 + 인덱스 + 무결성 해시) |

### 무결성 해시

내보내기 시 SHA-256 해시 포함:
```
audit_logs_20260418.csv          (CSV 본문)
audit_logs_20260418.csv.sha256   (해시)
metadata.json                     (시작/종료 시각, 행 수, 무결성 정보)
```

---

## 참조

- 감사 로그 immutable 원칙: `08_security.md § 2` (G-141)
- 감사 대상 행위 카탈로그: `08_security.md § 2.3`
- 보유 기간: `08_security.md § 6` (G-145)
- 위계 × 감사 접근: `03_hierarchy.md § 10` (G-053)
- Org Admin UI: `products/wiring/screens/org_admin.md § PW-010-06`
- HITL 감사 필드: `06_hitl.md § 8` (G-109)
