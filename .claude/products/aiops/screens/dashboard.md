# AiOPS / Screens / dashboard — `/app/dashboard`

> super_admin 전용 조직 AI 사용 현황 대시보드. 채널별 사용량 + 성숙도 + 이상 이벤트 + 비용.

---

## 목적

조직 AI 도입 담당자 (보통 CTO / 개발팀장) 가 매일 아침 5분 훑어보는 화면. 
"어제 우리 팀 AI 사용 괜찮았나?" + "이상 징후 없나?" 확인.

## 레이아웃

```
┌──────────────────────────────────────────────────────┐
│ Alpha Inc. · 2026년 5월 15일                           │
├──────────────────────────────────────────────────────┤
│ 상단 StatCard 4개                                      │
│ ┌──────┬──────┬──────┬──────┐                       │
│ │ 오늘 │ 활성 │ 이상  │ 이번달│                       │
│ │ 호출 │ 사용자│ 알림  │ 비용  │                       │
│ │2,345│ 87   │ 🟠 2 │ ₩7.3M │                       │
│ │▲12% │▲ 5   │ ▼ 1  │       │                       │
│ └──────┴──────┴──────┴──────┘                       │
│                                                        │
├──────────────────────────────────────────────────────┤
│ 📊 채널별 사용량 (오늘)                                 │
│                                                        │
│ 🟠 Claude Code        ████████████░ 890건 (38%)       │
│ ⚫ ChatGPT Web        ████████░░░░░ 520건 (22%)        │
│ 🔵 Anthropic API      ██████░░░░░░░ 380건 (16%)        │
│ 🟢 Cursor             █████░░░░░░░░ 310건 (13%)        │
│ 🔵 Gemini Web         ████░░░░░░░░░ 145건 (6%)         │
│ 기타 (3채널)         █░░░░░░░░░░░░ 100건 (5%)         │
│                                                        │
│ [시간별 추이]  [팀별 분포]                             │
├──────────────────────────────────────────────────────┤
│ 🟠 이상 알림 (2)                                        │
│                                                        │
│ 🟡 민감 정보 감지: Alice 프롬프트에 주민번호 포함      │
│    2시간 전 · Claude Web                               │
│    [상세]  [처리]                                      │
│                                                        │
│ 🟡 새 채널 감지: Perplexity Pro 최초 사용              │
│    어제 · Bob                                           │
│    [승인]  [차단]  [보류]                              │
├──────────────────────────────────────────────────────┤
│ 📈 이번 달 성숙도 추이                                  │
│                                                        │
│ [라인 차트: 조직 평균]                                 │
│   만점 100                                              │
│   Week 1: 62 → Week 2: 68 → Week 3: 72 (▲10)           │
│                                                        │
│ 팀별 비교:                                              │
│ ├ 개발팀:    82 🟢                                     │
│ ├ 마케팅팀:  64 🟡                                     │
│ ├ 영업팀:    58 🟡                                     │
│ └ 디자인팀:  71 🟢                                     │
│                                                        │
│ [성숙도 상세 →]                                        │
├──────────────────────────────────────────────────────┤
│ 💰 이번 달 비용 분해                                    │
│                                                        │
│ Anthropic (Claude):  ₩3,200,000   44%                  │
│ OpenAI (ChatGPT):    ₩2,100,000   29%                  │
│ Google (Gemini):     ₩800,000     11%                  │
│ Cursor / Others:     ₩1,200,000   16%                  │
│ ────────────────────────────────────                   │
│ 총계:                ₩7,300,000                         │
│                                                        │
│ 전월 대비: ▲ +12% (추세: 사용량 증가 + 고성능 모델 전환)│
│                                                        │
│ [비용 최적화 제안]                                     │
└──────────────────────────────────────────────────────┘
```

## StatCard 4개 상세

### 1. 오늘 호출
```sql
SELECT COUNT(*) FROM logs
WHERE org_id = $1 AND created_at::date = CURRENT_DATE;
```
MoM 비교: 전일 동시간대 대비.

### 2. 활성 사용자
```sql
SELECT COUNT(DISTINCT user_id) FROM logs
WHERE org_id = $1 
  AND created_at >= now() - interval '7 days';
```

### 3. 이상 알림
```sql
SELECT COUNT(*) FROM alerts
WHERE org_id = $1 
  AND acknowledged_at IS NULL
  AND severity IN ('warning','critical');
```

### 4. 이번 달 비용
```sql
SELECT SUM(estimated_cost_krw) FROM logs
WHERE org_id = $1 
  AND created_at >= date_trunc('month', now());
```

## 채널별 사용량 바 차트

```typescript
<BarChart data={channelUsage}>
  <Bar dataKey="count" fill={(item) => channelColor[item.channel]} />
</BarChart>

const channelColor = {
  'claude_code': '#D97757',   // Claude 오렌지
  'chatgpt_web': '#10A37F',   // ChatGPT 초록
  'anthropic_api': '#D97757',
  'cursor': '#000',
  'gemini_web': '#4285F4',
  // ...
};
```

[시간별 추이] 클릭 → 오늘 24시간 히트맵
[팀별 분포] 클릭 → 팀 × 채널 매트릭스

## 이상 알림 카드

민감 정보 감지 (PA-007):
```
┌────────────────────────────────────────┐
│ 🟡 민감 정보 감지                         │
│                                            │
│ 사용자: Alice Kim                         │
│ 채널: Claude Web                          │
│ 감지 유형: 주민등록번호 패턴              │
│ 시각: 2026-05-15 12:34                    │
│                                            │
│ 마스킹된 프롬프트:                         │
│ "홍길동 9******-*******의 신용 확인..."  │
│                                            │
│ 조치:                                      │
│ [✅ 정상 업무 확인] [⚠️ 사용자에 경고]    │
│ [🔒 정책 강화]                             │
└────────────────────────────────────────┘
```

새 채널 감지 (PA-005):
```
┌────────────────────────────────────────┐
│ 🟡 새 채널 감지: Perplexity Pro          │
│                                            │
│ Bob 이 어제 최초 사용 시작                │
│ 호출 5회 · 약 ₩12,000 추정                │
│                                            │
│ 조직 정책:                                 │
│ ○ 자동 승인 (새 채널 허용)                │
│ ○ 관리자 승인 후 허용                      │
│ ○ 차단                                     │
│                                            │
│ [승인]  [차단]  [조건부 허용]              │
└────────────────────────────────────────┘
```

## 성숙도 라인 차트

```sql
SELECT snapshot_week, overall_score
FROM maturity_scores
WHERE org_id = $1 AND scope = 'org'
  AND snapshot_week >= now() - interval '12 weeks'
ORDER BY snapshot_week;
```

팀별 비교 바:
```sql
SELECT team, overall_score
FROM maturity_scores
WHERE org_id = $1 AND scope = 'team'
  AND snapshot_week = (SELECT MAX(snapshot_week) FROM maturity_scores WHERE org_id = $1);
```

## 비용 분해 (벤더별)

```sql
SELECT provider, SUM(estimated_cost_krw) AS total
FROM logs
WHERE org_id = $1 
  AND created_at >= date_trunc('month', now())
GROUP BY provider
ORDER BY total DESC;
```

### 최적화 제안 (AI 기반)

```typescript
// 비용 최적화 룰 엔진
function generateCostSuggestions(org: Org): Suggestion[] {
  const suggestions = [];
  
  // 1. 고비용 채널에 대체 채널 제안
  const claudeCost = await getVendorCost(org.id, 'anthropic');
  if (claudeCost > org.monthly_budget_krw * 0.4) {
    suggestions.push({
      type: 'channel_shift',
      title: 'Claude API 40% 초과 · Claude Code 권장',
      savings_estimate: claudeCost * 0.2,
      action: '개발팀 Claude Code 배포 안내'
    });
  }
  
  // 2. 반복 패턴 감지
  const repetitivePrompts = await detectRepetitive(org.id);
  if (repetitivePrompts.length > 5) {
    suggestions.push({
      type: 'prompt_library',
      title: `반복 프롬프트 ${repetitivePrompts.length}개 감지 · 라이브러리화 권장`,
      savings_estimate: repetitivePrompts.reduce((s, p) => s + p.cost, 0) * 0.3,
      action: '프롬프트 라이브러리 생성'
    });
  }
  
  return suggestions;
}
```

## 실시간 갱신

```typescript
// StatCard 만 실시간 (2초 debounce)
supabase.channel('dashboard_stats')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'aiops', table: 'logs' },
    (payload) => {
      debouncedUpdateStats();
    })
  .subscribe();
```

차트는 5분마다 refetch (부하 고려).

## 권한

- **super_admin 만**. admin_teams / member 는 다른 화면으로 redirect.

## Sprint 우선순위

**Sprint 1 필수**. Alpha 온보딩 D+1 부터 핵심 KPI 확인.

## 참조

- 규칙 PA-001~011: `rules/00_index.md`
- `logs` / `alerts`: `schemas/tables/`
- 민감 정보 규칙: `rules/governance.md` (PA-007)
- 새 채널 감지: `rules/channels.md` (PA-005)
- 성숙도: `rules/maturity.md` (PA-010) + `screens/maturity_view.md`
