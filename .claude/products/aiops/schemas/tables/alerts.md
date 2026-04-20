# AiOPS / Schemas / alerts — 테이블 본문

> 감지된 이상 알림. PA-009. Slack / 이메일 발송 큐 역할.

---

## DDL

```sql
CREATE TABLE alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- 알림 분류
  alert_type    TEXT NOT NULL,
  /* 예시:
     'sensitive_detected', 'usage_surge', 'new_channel_detected',
     'prompt_length_exceeded', 'maturity_regression'
  */
  severity      TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  
  -- 관련 엔티티
  user_id       UUID REFERENCES users(id),
  log_id        UUID REFERENCES logs(id),
  
  -- 알림 내용
  title         TEXT NOT NULL,
  description   TEXT,
  detection_data JSONB,
  
  -- 전달 상태
  sent_channels JSONB DEFAULT '[]'::jsonb,   -- ['slack', 'email']
  sent_at       TIMESTAMPTZ,
  
  -- 사용자 응답
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id),
  
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_org_unack ON alerts(org_id, created_at DESC)
  WHERE acknowledged_at IS NULL;
CREATE INDEX idx_alerts_severity ON alerts(severity, created_at DESC);
```

## 주요 alert_type

| alert_type | 트리거 | 대상 |
|---|---|---|
| `sensitive_detected` | 프롬프트에서 주민번호/카드번호/이메일 감지 | super_admin |
| `usage_surge` | 사용자 일일 토큰 전주 대비 ×3 초과 | super_admin + 본인 |
| `new_channel_detected` | 조직 최초 사용 채널 등장 | super_admin |
| `prompt_length_exceeded` | 프롬프트 > 10k 토큰 | 본인 |
| `maturity_regression` | 주간 성숙도 점수 15% 하락 | admin_teams (해당 팀) |

## RLS

```sql
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- 역할별 조회
CREATE POLICY "alerts_role_based"
  ON alerts FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM users WHERE auth_user_id = auth.uid())
    AND (
      -- super_admin: 전체
      EXISTS (SELECT 1 FROM users 
        WHERE auth_user_id = auth.uid() AND role = 'super_admin')
      -- admin_teams: 담당 팀 멤버
      OR (EXISTS (SELECT 1 FROM users 
        WHERE auth_user_id = auth.uid() AND role = 'admin_teams'
          AND user_id IN (
            SELECT id FROM users WHERE team = ANY(managed_team_ids)
          )))
      -- 본인
      OR user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );
```

## 참조

- 알림 규칙: `rules/alerts.md` (PA-009)
- `logs` 연결: `tables/logs.md`
- Slack / 이메일 연동: `rules/governance.md` (PA-007 / PA-008)
