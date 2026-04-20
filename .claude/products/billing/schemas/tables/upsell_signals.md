# Billing / Schemas / upsell_signals — 테이블 본문

> 업셀 시그널 감지. I-005 파이프라인. Wiring / AiOPS 번들 전환 가능성.

---

## DDL

```sql
CREATE TABLE upsell_signals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- 시그널 유형
  signal_type      TEXT NOT NULL CHECK (signal_type IN (
    'wiring_upsell',      -- Wiring 도입 가능성
    'aiops_bundle',       -- AiOPS 번들 전환
    'enterprise_upgrade', -- 엔터프라이즈 플랜
    'contract_extension', -- 계약 연장
    'team_expansion'      -- 추가 팀 도입
  )),
  
  -- 신뢰도
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('low','medium','high')),
  confidence_score NUMERIC(3,2),            -- 0.00 ~ 1.00
  
  -- 근거 (자동 수집)
  evidence         JSONB NOT NULL DEFAULT '[]'::jsonb,
  /* 예시:
     [
       {"type": "ai_tool_usage", "detail": "개발팀 60% Cursor 사용"},
       {"type": "customer_message", "detail": "Luna 와의 5/10 대화 중 Wiring 언급"},
       {"type": "api_consumption_pattern", "detail": "Claude API 사용 급증"}
     ]
  */
  
  -- 추천 액션
  recommended_actions JSONB DEFAULT '[]'::jsonb,
  /* 예시:
     [
       {"action": "propose_demo", "template": "wiring_proposal_v1"},
       {"action": "prepare_roi_calc", "input": "current_ai_spend"}
     ]
  */
  
  -- 감지 원천
  source           TEXT CHECK (source IN ('auto_pattern','manual','aiops_bridge','csm_note')),
  detected_by      UUID REFERENCES admin_users(id),
  detected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- 관련 엔티티
  related_review_id UUID REFERENCES monthly_reviews(id),
  related_note_id   UUID REFERENCES csm_notes(id),
  
  -- 처리 상태
  status           TEXT NOT NULL DEFAULT 'new'
                   CHECK (status IN (
                     'new',           -- 신규 감지
                     'discussed',     -- 고객과 논의 중
                     'proposal_sent', -- 제안서 송부
                     'accepted',      -- 고객 수락 → 실제 전환
                     'rejected',      -- 고객 거절
                     'dismissed',     -- AM 이 시그널 기각 (false positive)
                     'stale'          -- 만료 (3개월 경과)
                   )),
  
  -- 결과
  resolved_at      TIMESTAMPTZ,
  resolution_note  TEXT,
  resulted_in_conversion BOOLEAN,
  
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_upsell_signals_open ON upsell_signals(org_id, confidence_score DESC)
  WHERE status IN ('new','discussed');
CREATE INDEX idx_upsell_signals_am_queue ON upsell_signals(detected_at DESC)
  WHERE status = 'new';
```

## 신뢰도 계산 예시 (Wiring 업셀)

```typescript
function calculateWiringSignalScore(org: Org): SignalScore {
  let score = 0;
  const evidence = [];
  
  // 1. AI 도구 사용률 (AiOPS 브릿지 데이터)
  if (org.aiops_org_id) {
    const aiUsagePct = getAiUsagePct(org.aiops_org_id);
    if (aiUsagePct >= 0.6) {
      score += 0.3;
      evidence.push({ type: 'ai_tool_usage', detail: `${Math.round(aiUsagePct*100)}% 사용률` });
    }
  }
  
  // 2. 대화 키워드 감지
  const wiringMentions = countMentions(org.id, ['Wiring', 'AI 에이전트', '자동화']);
  if (wiringMentions >= 2) {
    score += 0.2;
    evidence.push({ type: 'customer_message', detail: `Wiring 언급 ${wiringMentions}회` });
  }
  
  // 3. API 사용 급증
  const claudeApiSurge = detectApiSurge(org.id, 'anthropic');
  if (claudeApiSurge) {
    score += 0.2;
    evidence.push({ type: 'api_consumption_pattern', detail: 'Claude API 사용 급증' });
  }
  
  // 4. 개발 조직 규모
  const devTeamSize = getDevTeamSize(org.id);
  if (devTeamSize >= 10) {
    score += 0.15;
    evidence.push({ type: 'team_size', detail: `개발팀 ${devTeamSize}명` });
  }
  
  // 5. 크레딧백 종료 임박 (전환 기회)
  const daysToCreditbackEnd = getDaysToCreditbackEnd(org.id);
  if (daysToCreditbackEnd <= 90) {
    score += 0.15;
    evidence.push({ type: 'contract_lifecycle', detail: `크레딧백 D-${daysToCreditbackEnd}` });
  }
  
  return {
    score,
    level: score >= 0.7 ? 'high' : score >= 0.5 ? 'medium' : 'low',
    evidence
  };
}
```

## 자동 감지 배치 (매일 04:00)

```sql
-- 활성 고객 전체 대상 시그널 재계산
INSERT INTO upsell_signals (
  org_id, signal_type, confidence_level, confidence_score,
  evidence, recommended_actions, source
)
SELECT ... FROM active_orgs o
WHERE NOT EXISTS (
  SELECT 1 FROM upsell_signals 
  WHERE org_id = o.id 
    AND signal_type = 'wiring_upsell'
    AND status IN ('new','discussed')
    AND detected_at > now() - interval '30 days'
);
```

## AM 콘솔 UI 흐름

`/console/home` AM 뷰 업셀 카드 → 클릭:

```
[대화 시작] 
  → Slack Connect 열기 + 제안 템플릿 미리 채움
  → status = 'discussed'
  
[제안서 템플릿]
  → Wiring 제안서 PDF 생성 (실제 데이터 기반)
  → status = 'proposal_sent'

[시그널 무시]
  → 사유 입력 모달
  → status = 'dismissed'

[전환 확정]
  → status = 'accepted', resulted_in_conversion = TRUE
  → Wiring org 생성 트리거 (I-005)
```

## 전환율 KPI

```sql
-- 분기별 Wiring 업셀 전환율
SELECT 
  date_trunc('quarter', detected_at) AS quarter,
  signal_type,
  COUNT(*) AS signals_total,
  COUNT(*) FILTER (WHERE resulted_in_conversion = TRUE) AS conversions,
  ROUND(100.0 * COUNT(*) FILTER (WHERE resulted_in_conversion = TRUE) / COUNT(*), 1) AS conversion_rate_pct
FROM upsell_signals
WHERE signal_type = 'wiring_upsell'
  AND status IN ('accepted', 'rejected', 'dismissed')
GROUP BY quarter, signal_type
ORDER BY quarter DESC;
```

**KPI 목표 (Phase 2)**:
- Billing → Wiring 전환율 ≥ 10%
- Billing → AiOPS 번들 전환율 ≥ 20%

## 참조

- I-005 파이프라인: `integrations/billing-wiring.md`
- AM 콘솔 홈: `screens/console/home.md § 업셀 시그널`
- 월간 리뷰: `schemas/tables/monthly_reviews.md`
- Phase 2 체크포인트: `rules/phase_transition.md § PB-013-03`
- 원본: `03_데이터_모델.md § 16 업셀`
