-- ============================================================
-- 서비스 카탈로그 Seed (PB-006 약관 실사 화이트리스트)
-- Sprint 1 Day 5 필수
-- ============================================================

INSERT INTO billing.services (name, vendor, category, tos_review_status, tos_review_note, tos_reviewed_at, tos_next_review_at, pricing_policy, is_anthropic_partnership, unit_price_usd)
VALUES
  -- ✅ Anthropic
  ('Claude Team', 'anthropic', 'subscription', 'approved',
   '법인 구독 명시적 허용. 재판매 조항 없음 — 리셀러 구조 적법.',
   '2026-04-01', '2026-07-01', 'passthrough', TRUE, 30.00),

  ('Claude API', 'anthropic', 'api', 'approved',
   'API 조건 허용. Anthropic 파트너십으로 10% 패스스루.',
   '2026-04-01', '2026-07-01', 'passthrough', TRUE, NULL),

  -- ✅ OpenAI
  ('ChatGPT Team', 'openai', 'subscription', 'approved',
   '법인 구독 명시. 재판매 제한 없음 — 리셀러 운용 가능 해석.',
   '2026-04-01', '2026-07-01', 'passthrough', FALSE, 25.00),

  ('OpenAI API', 'openai', 'api', 'approved',
   'Usage 기반 API. 법인 명의 결제 허용.',
   '2026-04-01', '2026-07-01', 'passthrough', FALSE, NULL),

  -- ✅ Cursor
  ('Cursor Business', 'cursor', 'subscription', 'approved',
   '엔터프라이즈 플랜 법인 결제 허용. 팀 관리 기능 포함.',
   '2026-04-01', '2026-07-01', 'passthrough', FALSE, 40.00),

  -- ✅ GitHub
  ('GitHub Copilot Business', 'github', 'subscription', 'approved',
   'Microsoft/GitHub 법인 구독. 약관 명확.',
   '2026-04-01', '2026-07-01', 'passthrough', FALSE, 19.00),

  -- ⚠️ ChatGPT Plus (조건부)
  ('ChatGPT Plus', 'openai', 'subscription', 'conditional',
   '개인 계정 기반. 법인 결제 허용 여부 불명확. 1인당 계정 발급 시 리셀러 구조 위험 — 반드시 ChatGPT Team 전환 권고.',
   '2026-04-01', '2026-07-01', 'passthrough', FALSE, 20.00),

  -- ✅ Perplexity
  ('Perplexity Pro', 'perplexity', 'subscription', 'approved',
   '개인/법인 구독 허용. 약관상 재판매 금지 조항 없음.',
   '2026-04-01', '2026-07-01', 'passthrough', FALSE, 20.00),

  -- ✅ Windsurf
  ('Windsurf Pro', 'codeium', 'subscription', 'approved',
   '법인 구독 허용. Cursor 대안으로 주목.',
   '2026-04-01', '2026-07-01', 'passthrough', FALSE, 15.00),

  -- ⚠️ Lovable (검토 중)
  ('Lovable Pro', 'lovable', 'agent_credit', 'pending',
   '에이전트 크레딧 기반. 법인 결제 및 재판매 조항 검토 필요. 분기 실사 예정.',
   NULL, '2026-07-01', 'passthrough', FALSE, NULL);
