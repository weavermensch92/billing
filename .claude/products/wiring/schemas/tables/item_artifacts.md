# Wiring / Schemas / item_artifacts — 테이블 본문

> 산출물 (스펙 / 코드 / 테스트 / 문서). B1~B6 레이어의 출력물 저장.

---

## DDL

```sql
CREATE TABLE item_artifacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  sub_item_id     UUID REFERENCES sub_items(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- 아티팩트 유형
  artifact_type   TEXT NOT NULL CHECK (artifact_type IN (
    'ssot_spec',          -- B1 SSOT 확정 문서
    'technical_spec',     -- B2 기술 스펙
    'source_code',        -- B3 코드 파일
    'test_code',          -- B4 테스트 코드
    'test_result',        -- B4 테스트 실행 결과
    'review_note',        -- B5 리뷰 노트
    'documentation',      -- B6 문서
    'deployment_record'   -- B6 배포 기록
  )),
  
  -- 저장 방식
  storage_type    TEXT CHECK (storage_type IN ('inline','github','s3','supabase_storage')),
  
  -- inline 저장 (작은 텍스트)
  content_text    TEXT,
  
  -- 외부 참조
  github_commit_sha TEXT,
  github_file_path  TEXT,
  github_pr_number  INT,
  storage_url     TEXT,                   -- S3/Supabase Storage URL
  
  -- 메타
  file_name       TEXT,
  file_size_bytes BIGINT,
  content_type    TEXT,                   -- 'text/markdown', 'application/typescript'
  
  -- 버전
  version         INT NOT NULL DEFAULT 1,
  parent_artifact_id UUID REFERENCES item_artifacts(id),
  
  -- 생성
  generated_by_agent_session_id UUID REFERENCES agent_sessions(id),
  generated_by_user_id UUID REFERENCES users(id),
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_item_artifacts_item ON item_artifacts(item_id, artifact_type);
CREATE INDEX idx_item_artifacts_sub_item ON item_artifacts(sub_item_id);
CREATE INDEX idx_item_artifacts_type ON item_artifacts(artifact_type, created_at DESC);
```

## artifact_type 별 기본 storage

| artifact_type | storage_type (기본) | 이유 |
|---|---|---|
| `ssot_spec` | inline | 짧은 마크다운, DB 내 저장 |
| `technical_spec` | inline or supabase_storage | 길이에 따라 |
| `source_code` | github | 실제 코드는 Git 저장소 |
| `test_code` | github | 동일 |
| `test_result` | inline | CI 결과 요약 |
| `review_note` | inline | 짧은 노트 |
| `documentation` | github | README 등 저장소 내 |
| `deployment_record` | inline | URL, 버전 등 간단 |

## 버전 관리

```sql
-- 새 버전 작성 (retry 시)
INSERT INTO item_artifacts (
  item_id, sub_item_id, org_id, artifact_type,
  storage_type, content_text,
  version, parent_artifact_id,
  generated_by_agent_session_id
)
SELECT 
  item_id, sub_item_id, org_id, artifact_type,
  'inline', $new_content,
  version + 1, id AS parent_artifact_id,
  $new_session_id
FROM item_artifacts
WHERE id = $previous_artifact_id;
```

## GitHub 연동 (I-003)

```sql
-- GitHub PR 생성 시
UPDATE item_artifacts
SET github_pr_number = $pr_number,
    github_commit_sha = $commit_sha
WHERE id = $artifact_id;

-- activity_logs 자동 기록
INSERT INTO activity_logs (..., activity_type='commit_event', ...);
```

## 조회 (아이템 상세)

```sql
-- 특정 아이템의 전체 산출물
SELECT ia.*, si.layer AS from_layer,
  CASE ia.storage_type
    WHEN 'inline' THEN ia.content_text
    WHEN 'github' THEN format('https://github.com/%s/blob/%s/%s', 
      p.github_repo, ia.github_commit_sha, ia.github_file_path)
    ELSE ia.storage_url
  END AS preview_or_url
FROM item_artifacts ia
LEFT JOIN sub_items si ON si.id = ia.sub_item_id
LEFT JOIN items i ON i.id = ia.item_id
LEFT JOIN projects p ON p.id = i.project_id
WHERE ia.item_id = $1
ORDER BY si.layer, ia.version DESC;
```

## 참조

- `items`: `tables/items.md`
- `sub_items`: `tables/sub_items.md`
- `agent_sessions`: `tables/agent_sessions.md`
- GitHub 연동: `integrations/wiring-github.md` (v0.27+)
- SSOT 원칙: `rules/ssot.md` (공통)
