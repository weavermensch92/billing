# LucaPus / Schemas / codebase_snapshots — 테이블 본문

> PL-009 코드베이스 분석 결과 저장.
> 주간 스냅샷 + 이벤트 기반 증분 분석.

---

## DDL

```sql
CREATE TABLE codebase_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 기술 스택 감지 결과
  tech_stack        jsonb NOT NULL,
  /* 예시:
     {
       "languages": { "typescript": 0.72, "css": 0.15, "markdown": 0.13 },
       "frameworks": ["Next.js 14", "Supabase"],
       "databases": ["PostgreSQL", "Redis"],
       "infrastructure": ["Docker", "Vercel"],
       "ci_cd": ["GitHub Actions"],
       "test_frameworks": ["Vitest", "Playwright"],
       "test_coverage_estimate": 0.68
     }
  */

  -- 감지된 코드 패턴 (PL-009-03)
  detected_patterns jsonb,
  /* pattern_detections 테이블의 요약 배열 */

  -- 아키텍처 드리프트 (PL-009-04)
  drift_report      jsonb,
  /* {
       "violations": [{ rule_id, severity, file, line, message }],
       "trend": { "last_week": 12, "this_week": 18, "delta": 6 }
     }
  */

  -- 기본 메트릭
  file_count        integer NOT NULL,
  loc               integer NOT NULL,              -- Lines of code
  language_breakdown jsonb,                         -- { lang: loc }

  -- 스캔 메타
  scan_type         text NOT NULL CHECK (scan_type IN ('init','weekly','on-demand','pr-hook')),
  triggered_by      text,                           -- 'system', user_id, 'cli:gridge-init', ...
  duration_ms       integer,

  scanned_at        timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_codebase_project_time ON codebase_snapshots(project_id, scanned_at DESC);
CREATE INDEX idx_codebase_scan_type ON codebase_snapshots(project_id, scan_type, scanned_at DESC);

-- RLS
ALTER TABLE codebase_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "codebase_snapshots_org_isolation"
  ON codebase_snapshots FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
```

---

## 필드 설명

### `tech_stack`

PL-009-01 감지 결과. 예:
```json
{
  "languages": { "typescript": 0.72, "python": 0.23 },
  "frameworks": ["Spring Boot 3.2", "React 18"],
  "databases": ["PostgreSQL 15", "Redis"],
  "infrastructure": ["Docker", "Kubernetes"],
  "ci_cd": ["GitHub Actions", "ArgoCD"],
  "test_frameworks": ["JUnit 5", "Vitest"],
  "test_coverage_estimate": 0.74
}
```

언어 비율 합계 ~ 1.0 (반올림 오차 허용).

### `detected_patterns` (요약)

`pattern_detections` 테이블 (별도) 의 요약. 전체 상세는 별도 테이블:
```json
{
  "total": 8,
  "high_confidence": 3,
  "pending_review": 5,
  "top_patterns": ["@Builder", "Facade", "Repository"]
}
```

### `drift_report`

PL-009-04 드리프트 감지:
```json
{
  "violations": [
    {
      "rule_id": "rule-bcrypt",
      "severity": "MUST",
      "file": "src/auth/login.ts",
      "line": 15,
      "message": "BCrypt 누락 — 조직 MUST 위반"
    }
  ],
  "trend": { "last_week": 12, "this_week": 8, "delta": -4 }
}
```

### `scan_type`

| 값 | 트리거 |
|---|---|
| `init` | `gridge init` 최초 |
| `weekly` | 주간 배치 |
| `on-demand` | L3 "재분석" 요청 |
| `pr-hook` | Git hook (PR 생성 시 증분) |

---

## 보유 기간

- 최근 90일 유지
- 초과분 자동 아카이빙 (cold storage)
- `init` / `weekly` 스냅샷은 영구 보존 권장

---

## Mode B 격리 (PL-009-08, G-087)

Mode B 고객:
- 스캐너 에이전트 = 고객 서버 내부 실행
- 결과 = 고객 DB 에만 저장
- 소스 코드 원문 저장 X (메타 / 카운트만)
- Gridge 서버로 전송 = 없음

---

## 조회 패턴

### 최근 스냅샷

```sql
SELECT * FROM codebase_snapshots
WHERE project_id = $1
ORDER BY scanned_at DESC
LIMIT 1;
```

### 드리프트 추이 (주간)

```sql
SELECT scanned_at, drift_report->'trend' as trend
FROM codebase_snapshots
WHERE project_id = $1 AND scan_type = 'weekly'
ORDER BY scanned_at DESC
LIMIT 12;  -- 최근 3개월
```

---

## 참조

- 코드베이스 규칙: `products/lucapus/rules/codebase.md` (PL-009)
- Never Touch 영역: `products/lucapus/rules/codebase.md § PL-009-05`
- Mode B 격리: `05_infra_mode.md § 7` (G-087)
- 패턴 감지 테이블: `schemas/tables/pattern_detections.md`
