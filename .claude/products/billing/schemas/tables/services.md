# Billing / Schemas / services — 테이블 본문

> AI 서비스 카탈로그. **약관 검증된 화이트리스트** (PB-006). 글로벌 테이블 (org_id 없음).

---

## DDL

```sql
CREATE TABLE services (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT UNIQUE NOT NULL,        -- 'svc_claude_team'
  display_name       TEXT NOT NULL,               -- 'Claude Team'
  vendor             TEXT NOT NULL,               -- 'Anthropic'
  category           TEXT NOT NULL CHECK (category IN ('subscription','api','agent')),
  billing_type       TEXT NOT NULL CHECK (billing_type IN ('subscription','usage_based','credit')),

  -- 가격 정보 (공개)
  list_price_krw     BIGINT,                      -- 표시 가격 (월 정액 서비스만)
  pricing_url        TEXT,
  signup_url         TEXT,

  -- 약관 실사 (PB-006)
  tos_review_status  TEXT NOT NULL DEFAULT 'pending'
                     CHECK (tos_review_status IN ('approved','pending','rejected','conditional')),
  tos_review_date    DATE,
  tos_review_by      UUID REFERENCES admin_users(id),
  tos_reference_url  TEXT,                        -- 약관 URL
  tos_notes          TEXT,                        -- 실사 메모

  -- 활성화 제어
  is_active          BOOLEAN NOT NULL DEFAULT FALSE,
  restrictions       JSONB,                       -- 조건부 허용 제한

  -- 통계
  active_account_count INT DEFAULT 0,             -- 배치로 갱신

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_services_active ON services(is_active, tos_review_status)
  WHERE is_active = TRUE;
CREATE INDEX idx_services_vendor ON services(vendor, category);
```

## 핵심 제약 (PB-006)

**고객에게 노출되는 서비스는 반드시**:
- `is_active = TRUE`
- `tos_review_status IN ('approved', 'conditional')`

두 조건 모두 만족해야만 `/app/services/new` 드롭다운에 표시.

## 초기 시드 (Alpha 파일럿 기준)

```sql
INSERT INTO services (code, display_name, vendor, category, billing_type, tos_review_status, is_active) VALUES
  -- Anthropic (✅ 파트너십 승인 시 패스스루 자동 적용)
  ('svc_claude_team',       'Claude Team',       'Anthropic', 'subscription', 'subscription', 'approved',    TRUE),
  ('svc_claude_max',        'Claude Max',        'Anthropic', 'subscription', 'subscription', 'approved',    TRUE),
  ('svc_anthropic_api',     'Anthropic API',     'Anthropic', 'api',          'usage_based',  'approved',    TRUE),
  -- OpenAI
  ('svc_chatgpt_team',      'ChatGPT Team',      'OpenAI',    'subscription', 'subscription', 'approved',    TRUE),
  ('svc_chatgpt_enterprise','ChatGPT Enterprise','OpenAI',    'subscription', 'subscription', 'approved',    TRUE),
  ('svc_openai_api',        'OpenAI API',        'OpenAI',    'api',          'usage_based',  'approved',    TRUE),
  -- Cursor
  ('svc_cursor_business',   'Cursor Business',   'Anysphere', 'subscription', 'subscription', 'approved',    TRUE),
  ('svc_cursor_pro',        'Cursor Pro',        'Anysphere', 'subscription', 'subscription', 'conditional', TRUE),
  -- Google
  ('svc_gemini_api',        'Gemini API',        'Google',    'api',          'usage_based',  'approved',    TRUE),
  -- 에이전트 (개별 실사 필요)
  ('svc_lovable',           'Lovable',           'Lovable',   'agent',        'credit',       'pending',     FALSE),
  ('svc_manus',             'Manus',             'Manus',     'agent',        'credit',       'pending',     FALSE),
  ('svc_v0',                'v0',                'Vercel',    'agent',        'credit',       'pending',     FALSE),
  ('svc_replit',            'Replit',            'Replit',    'agent',        'credit',       'pending',     FALSE),
  -- 개인 요금제 (업그레이드 유도)
  ('svc_chatgpt_plus',      'ChatGPT Plus',      'OpenAI',    'subscription', 'subscription', 'rejected',    FALSE),
  ('svc_claude_pro',        'Claude Pro',        'Anthropic', 'subscription', 'subscription', 'rejected',    FALSE);

-- conditional 예시
UPDATE services SET restrictions = '{
  "note": "개인 요금제는 기업 대리 관리 명시 조항 없음",
  "recommendation": "Cursor Business 권장",
  "customer_acknowledgment_required": true
}'::jsonb WHERE code = 'svc_cursor_pro';
```

## RLS

```sql
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- 모든 인증된 사용자 (고객+운영자) 읽기
CREATE POLICY "services_public_read"
  ON services FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      is_active = TRUE                         -- 고객에게는 활성만
      OR (auth.jwt() ->> 'is_admin')::bool     -- 운영자는 전체
    )
  );

-- Super 만 쓰기
-- (admin Auth 별도 — 서버 미들웨어에서 검증)
```

## 정기 재실사 (PB-006-06)

분기별 자동 배치:
```sql
-- 90일 경과 서비스 알림
SELECT * FROM services
WHERE tos_review_status IN ('approved','conditional')
  AND tos_review_date < now() - interval '90 days';
```

결과 → 콘솔 `/console/super/services` 배지 + Super 알림.

## 관계

- `accounts.service_id → services.id`
- 패스스루 판단: `services.vendor = 'Anthropic'` AND `feature_flag.anthropic_passthrough = ON`

## 참조

- 벤더 약관 규칙: `rules/vendor_compliance.md` (PB-006)
- 서비스 카탈로그 콘솔: `screens/console/services.md` (v0.19)
- 원본: `03_데이터_모델.md § 6 계정·VCN` + `01_서비스_정의.md § 4-4`
