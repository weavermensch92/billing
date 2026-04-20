# AiOPS / Screens / coaching_inbox — `/app/coaching`

> 개인 맞춤 코칭 카드 수신함. Member 가 가장 자주 보는 화면. AI 활용 개선 제안 + 실습 가능한 팁.

---

## 목적

개인별로 AI 사용 패턴 분석 → 맞춤 코칭 카드 발송. Member 가 "나만의 AI 성장 코치" 경험.

## 레이아웃

```
┌──────────────────────────────────────────────┐
│ 내 코칭 카드                                   │
│ 오늘의 추천: 3 · 전체: 12 (미확인 2)           │
├──────────────────────────────────────────────┤
│ 필터: [전체] [새 카드] [완료] [북마크]         │
├──────────────────────────────────────────────┤
│ 🆕 오늘의 추천 (3)                              │
│                                                │
│ ┌────────────────────────────────────────┐ │
│ │ 💡 세션 깊이 늘리기                       │ │
│ │                                            │ │
│ │ 최근 7일간 세션당 평균 후속 질문이 2.1회  │ │
│ │ (조직 평균 3.5회). 이 방법을 시도해보세요: │ │
│ │                                            │ │
│ │ 📚 5단계 기법:                             │ │
│ │ 1. 첫 답변 받기                            │ │
│ │ 2. "더 구체적으로" 요청                    │ │
│ │ 3. "왜 이 방법이죠?" 근거 확인              │ │
│ │ 4. "다른 접근은?" 대안 탐색                │ │
│ │ 5. "실제 코드로" 구현 요청                  │ │
│ │                                            │ │
│ │ 오늘 시도할 과제:                          │ │
│ │ ☐ 다음 Claude 세션에서 4회 이상 후속 질문 │ │
│ │                                            │ │
│ │ [시작하기]  [북마크]  [나중에]              │ │
│ └────────────────────────────────────────┘ │
│                                                │
│ ┌────────────────────────────────────────┐ │
│ │ 🔧 다양한 도구 시도                        │ │
│ │                                            │ │
│ │ Claude 만 사용 중이에요 (Variety 점수 낮음)│ │
│ │ 업무 유형별 추천 도구:                      │ │
│ │                                            │ │
│ │ 🎨 Cursor - 코드 자동완성                  │ │
│ │ 🔍 Perplexity - 실시간 검색                 │ │
│ │ 📝 Notion AI - 문서 작성                    │ │
│ │                                            │ │
│ │ [상세 가이드]  [팀 설정 요청]               │ │
│ └────────────────────────────────────────┘ │
│                                                │
│ ┌────────────────────────────────────────┐ │
│ │ 🎯 피드백 루프 강화                        │ │
│ │                                            │ │
│ │ Claude 응답 후 그대로 사용 vs 수정 비율:   │ │
│ │ ████████████░ 그대로 78% / 수정 22%        │ │
│ │                                            │ │
│ │ 더 나은 응답을 얻는 방법...                 │ │
│ │                                            │ │
│ │ [더 보기]                                   │ │
│ └────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│ 📚 전체 코칭 카드 (9)                          │
│                                                │
│ ✅ 좋은 프롬프트 7가지 원칙                     │
│    (2주 전 완료)                                │
│                                                │
│ 🔖 API 모델과 Web 모델의 차이                   │
│    (북마크)                                      │
│                                                │
│ ...                                            │
└──────────────────────────────────────────────┘
```

## 카드 생성 로직 (PA-010 자동)

```sql
-- 주간 분석 배치 (매주 월요일 06:30)
INSERT INTO coaching_cards (
  org_id, user_id, card_template_id,
  personalization_data, severity
)
SELECT 
  u.org_id, u.id, 
  ct.id,
  jsonb_build_object(
    'user_score', ms.overall_score,
    'axis_score', ms.axis_depth,
    'org_avg', org_avg.score
  ),
  CASE 
    WHEN ms.overall_score < org_avg.score * 0.7 THEN 'high'
    WHEN ms.overall_score < org_avg.score * 0.85 THEN 'medium'
    ELSE 'low'
  END
FROM users u
JOIN maturity_scores ms ON ms.user_id = u.id
  AND ms.snapshot_week = (SELECT MAX(snapshot_week) FROM maturity_scores)
JOIN LATERAL (
  -- 가장 낮은 축에 대한 카드 템플릿
  SELECT id FROM coaching_card_templates
  WHERE target_axis = (
    SELECT axis FROM (VALUES 
      ('frequency', ms.axis_frequency),
      ('depth', ms.axis_depth),
      ('variety', ms.axis_variety),
      ('feedback', ms.axis_feedback)
    ) t(axis, score) ORDER BY score ASC LIMIT 1
  )
  LIMIT 1
) ct ON TRUE
JOIN LATERAL (
  SELECT overall_score AS score 
  FROM maturity_scores WHERE org_id = u.org_id AND scope = 'org'
  ORDER BY snapshot_week DESC LIMIT 1
) org_avg ON TRUE
WHERE u.coaching_enabled = TRUE
  AND u.status = 'active';
```

## 카드 상호작용

```typescript
async function handleCardAction(cardId: string, action: string) {
  const card = await db.selectOne('coaching_cards', cardId);
  
  switch (action) {
    case 'start':
      await db.update('coaching_cards', cardId, {
        started_at: new Date(),
        status: 'in_progress'
      });
      // 챌린지 시작 알림
      break;
      
    case 'complete':
      await db.update('coaching_cards', cardId, {
        completed_at: new Date(),
        status: 'completed'
      });
      // 보상 (조직 마일리지, Phase 2+)
      break;
      
    case 'bookmark':
      await db.update('coaching_cards', cardId, {
        bookmarked: true
      });
      break;
      
    case 'dismiss':
      await db.update('coaching_cards', cardId, {
        dismissed_at: new Date(),
        dismiss_reason: $reason
      });
      break;
      
    case 'later':
      await db.update('coaching_cards', cardId, {
        snoozed_until: new Date(Date.now() + 7*24*3600*1000)
      });
      break;
  }
}
```

## 챌린지 추적

카드에 `challenge` 가 있으면 자동 추적:

```typescript
// 예: "다음 Claude 세션에서 4회 이상 후속 질문"
const challenge = {
  type: 'depth_threshold',
  condition: {
    platform: 'claude',
    min_followups: 4,
    session_type: 'single'
  },
  deadline: new Date(Date.now() + 7*24*3600*1000)
};

// 배치 감지 (매일)
async function checkChallenges() {
  const activeChallenges = await db.select('coaching_cards', 
    { status: 'in_progress', deadline: { gt: new Date() } });
  
  for (const card of activeChallenges) {
    const passed = await evaluateChallenge(card.user_id, card.challenge);
    if (passed) {
      await db.update('coaching_cards', card.id, {
        status: 'completed',
        completed_at: new Date(),
        completion_type: 'auto_detected'
      });
      await notifyUser(card.user_id, 'challenge_completed', card);
    }
  }
}
```

## 관련 로그 링크

카드에 "관련 로그" 섹션 (근거 제공):
```
📊 이 카드의 근거
──────────────────
• 최근 7일 세션 중 후속 질문 2.1회 평균
• 조직 평균 3.5회 대비 낮음
• [관련 로그 보기 (10건)]
  → logs_explorer 로 이동 (본인 세션 필터 자동)
```

## Admin 뷰 (팀 코칭 현황)

`admin_teams` 는 `/app/coaching/team/[team]` 에서 팀원 코칭 현황:
```
개발팀 코칭 현황
─────────────────
전체 발송: 15 · 완료: 8 · 진행 중: 4 · 무시: 3

Charlie 가 3주 연속 카드 무시 중
  → [1:1 상담 제안]
```

## 권한

- **member**: 본인 카드만
- **admin_teams**: + 담당 팀 멤버 수신 현황 (요약만, 개별 카드 열람 금지)
- **super_admin**: 전체 조직

## 발송 정책

- 주 2~3개 (과부하 방지)
- 우선순위: severity high → medium → low
- Dismiss 된 카드는 다음 주 재생성 안 함
- 완료율 60% 이상 유지 목표

## Sprint 우선순위

**Sprint 2 필수**. Member 의 주 진입 화면. 개인 가치 제공의 핵심.

## 참조

- 규칙 PA-010: `rules/maturity.md`
- `coaching_cards` 테이블 (v0.28+ 별도 본문): `schemas/INDEX.md`
- `maturity_scores`: `schemas/tables/maturity_scores.md`
- 로그 탐색: `screens/logs_explorer.md`
