# Wiring / Schemas / activity_logs — 테이블 본문

> 실시간 활동 로그. 6유형 (에이전트 상태 변화 / HITL / Stage / 규칙 / 커밋 / 알림). 실시간 피드 UI 데이터 소스.

---

## DDL

```sql
CREATE TABLE activity_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id     UUID REFERENCES projects(id),
  
  -- 활동 유형 (6종)
  activity_type  TEXT NOT NULL CHECK (activity_type IN (
    'agent_state_change',    -- 에이전트 idle → running 등
    'hitl_event',            -- HITL 카드 생성 / 승인 / 반려
    'stage_transition',      -- Stage 0 → 1 → 2
    'rule_event',            -- 적합화 규칙 추가 / 수정
    'commit_event',          -- GitHub 커밋 연결
    'notification_sent'      -- Slack / 이메일 알림 발송
  )),
  
  -- 활동 주체
  actor_type     TEXT CHECK (actor_type IN ('user','agent','system')),
  actor_id       UUID,                     -- users.id / agents.id / NULL(system)
  actor_display_name TEXT,
  
  -- 관련 엔티티
  related_item_id   UUID REFERENCES items(id),
  related_agent_id  UUID REFERENCES agents(id),
  related_hitl_card_id UUID REFERENCES hitl_cards(id),
  
  -- 내용
  title          TEXT NOT NULL,
  description    TEXT,
  event_data     JSONB DEFAULT '{}'::jsonb,
  
  -- 표시 설정
  severity       TEXT DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  icon_hint      TEXT,                     -- 'check', 'alert', 'bot', 'user'
  
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 실시간 피드 최적화
CREATE INDEX idx_activity_logs_org_time ON activity_logs(org_id, created_at DESC);
CREATE INDEX idx_activity_logs_project ON activity_logs(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
CREATE INDEX idx_activity_logs_type ON activity_logs(activity_type, created_at DESC);

-- 오래된 로그 파티셔닝 (Phase 2)
-- 월별 파티션 / 12개월 이후 cold storage
```

## 6가지 activity_type

| type | 예시 | 생성 트리거 |
|---|---|---|
| `agent_state_change` | "be-developer 가 idle → running 전환" | `agents.status` UPDATE 트리거 |
| `hitl_event` | "적합화 카드 #234 승인 by 김TL" | `hitl_cards.status` 변경 |
| `stage_transition` | "프로젝트 A Stage 1 → Stage 2" | `projects.current_stage` 변경 |
| `rule_event` | "신규 규칙 R-045 추가: '모든 API 는 Zod 검증'" | `rule_timeline` INSERT |
| `commit_event` | "커밋 a3f5b2 by Alice, item #12 연결" | GitHub 웹훅 (I-003) |
| `notification_sent` | "Slack 알림: QA 실패 3건" | `alerts` INSERT |

## 자동 기록 트리거 예시

```sql
CREATE OR REPLACE FUNCTION log_agent_state_change() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO activity_logs (
      org_id, project_id, activity_type,
      actor_type, actor_display_name,
      related_agent_id,
      title, description, event_data, severity
    ) VALUES (
      NEW.org_id, NEW.project_id, 'agent_state_change',
      'system', 'Wiring',
      NEW.id,
      format('%s: %s → %s', NEW.agent_id, OLD.status, NEW.status),
      CASE 
        WHEN NEW.status = 'error' THEN 'Agent encountered error'
        ELSE NULL
      END,
      jsonb_build_object('from', OLD.status, 'to', NEW.status),
      CASE WHEN NEW.status = 'error' THEN 'critical' ELSE 'info' END
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_agent_state_change
  AFTER UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION log_agent_state_change();
```

## 실시간 피드 UI

`/app/activity` 실시간 스트림:
```typescript
supabase.channel('activity_stream')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'wiring', table: 'activity_logs' },
    (payload) => { prependToFeed(payload.new); })
  .subscribe();
```

## RLS

```sql
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_logs_org_member"
  ON activity_logs FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM users WHERE auth_user_id = auth.uid())
  );
```

## 참조

- 실시간 피드 UI: `screens/kanban.md` (v0.27+)
- 감사 로그 (민감): `tables/audit_logs.md`
- GitHub 연동: `integrations/wiring-github.md`
