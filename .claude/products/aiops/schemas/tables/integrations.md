# AiOPS / Schemas / integrations — 테이블 본문

> 외부 도구 연동 상태. Slack / SSO / Jira 등. 조직별 설정.

---

## DDL

```sql
CREATE TABLE integrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- 연동 유형
  integration_type TEXT NOT NULL CHECK (integration_type IN (
    'slack', 'sso_saml', 'sso_oidc', 'sso_scim',
    'jira', 'github', 'gitlab', 'notion',
    'webhook_generic'
  )),
  
  -- 상태
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','active','failed','disabled')),
  
  -- 설정 (암호화 필드는 Supabase Vault 별도 관리)
  config           JSONB DEFAULT '{}'::jsonb,
  /* 예시:
     slack: {"workspace_id": "...", "bot_token_vault_ref": "..."}
     sso_saml: {"idp_metadata_url": "...", "sp_entity_id": "..."}
  */
  
  -- 연결 검증
  last_verified_at TIMESTAMPTZ,
  last_error       TEXT,
  
  -- 관리
  enabled_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (org_id, integration_type)
);

CREATE INDEX idx_integrations_org ON integrations(org_id, status);
```

## 주요 연동 설정

### Slack (알림 채널)
```json
{
  "workspace_id": "T01234567",
  "channel_id": "C09876543",
  "bot_token_vault_ref": "vault_org_abc_slack_token",
  "notification_types": ["sensitive_detected", "maturity_regression"]
}
```

### SSO SAML
```json
{
  "idp_entity_id": "https://okta.example.com",
  "idp_metadata_url": "https://...",
  "sp_entity_id": "https://aiops.gridge.ai/saml",
  "attribute_mapping": {
    "email": "email",
    "name": "displayName",
    "team": "department"
  }
}
```

### GitHub (Claude Code / Copilot 사용 자동 감지)
```json
{
  "org_name": "alpha-inc",
  "install_id": 12345,
  "installed_repos": ["repo1", "repo2"]
}
```

## RLS

```sql
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- super_admin 만
CREATE POLICY "integrations_super_only"
  ON integrations FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_user_id = auth.uid() AND role = 'super_admin'
    )
  );
```

## 연결 검증 배치 (매일 09:00)

```sql
-- 연동 헬스체크
UPDATE integrations
SET last_verified_at = now(),
    last_error = NULL,
    status = CASE 
      WHEN status = 'failed' THEN 'active'  -- 복구
      ELSE status
    END
WHERE id IN (
  -- 헬스체크 API 호출 성공한 id 들
);
```

## 참조

- Slack 알림 (PA-009): `rules/alerts.md`
- SSO (PA-004): `rules/auth.md`
- GitHub 채널 수집: `rules/channels.md` (PA-005)
- 원본: `products/aiops/rules/data_model.md § integrations`
