# AiOPS / Maturity — 규칙 본문

> PA-010 본문. AI 성숙도 5단계 분류 + Next Step 추천 로직.
> MSP 업셀 데이터 소스.

---

## PA-010 — AI 성숙도 5단계 (SHOULD)

### 5단계 레벨

| 레벨 | 명칭 | 특징 |
|---|---|---|
| Level 1 | **탐색기** | 일부 팀원이 개인적으로 써보는 단계 |
| Level 2 | **실험기** | 팀 단위로 특정 업무에 쓰기 시작 |
| Level 3 | **정착기** | 업무 프로세스에 AI가 일부 통합됨 |
| Level 4 | **확장기** | 다양한 업무에 AI가 활용됨 |
| Level 5 | **최적화기** | AI 활용이 조직 전반에 내재화됨 |

### 5개 평가 항목

| 항목 | 측정 방법 | 가중치 |
|---|---|---|
| **활용 범위** | 사용 중인 업무 유형 수 (분류 태그 기준) | 20% |
| **활용 깊이** | 단발성 질문 vs 맥락 있는 대화 비율 (세션 깊이) | 25% |
| **활용 효율** | 재질문 비율 (낮을수록 좋음), 비용 대비 업무 커버리지 | 20% |
| **활용 확산** | 전체 팀원 중 실제 사용자 비율 | 20% |
| **활용 안전성** | 이슈 발생 빈도 (민감 정보 / 비용 폭증 / 재질문) | 15% |

각 항목 0~100점 산출 → 가중 평균 → 레벨 매핑.

---

## PA-010-01 — 점수 계산 (MUST)

### 활용 범위 (20%)

```typescript
async function computeScope(org_id: string, since: Date): Promise<number> {
  const uniqueTaskTypes = await db.rpc('count_unique_task_types', { org_id, since });
  // 태스크 타입: code / doc / analysis / search / summary / translation / ...

  // 8개 이상이면 100점
  return Math.min((uniqueTaskTypes / 8) * 100, 100);
}
```

### 활용 깊이 (25%)

```typescript
async function computeDepth(org_id: string, since: Date): Promise<number> {
  const sessions = await db.rpc('avg_session_turns', { org_id, since });
  // avg_turns 1 (단발) ~ 10+ (깊은 대화)

  // 5턴 이상이면 100점
  return Math.min((sessions.avg_turns / 5) * 100, 100);
}
```

### 활용 효율 (20%)

```typescript
async function computeEfficiency(org_id: string, since: Date): Promise<number> {
  const stats = await db.rpc('efficiency_stats', { org_id, since });
  // reQueryRatio: 재질문 비율 (낮을수록 좋음)
  // 기준: 25% 이하면 100점, 50% 이상이면 0점

  const reQueryScore = Math.max(0, Math.min(100, (0.5 - stats.reQueryRatio) * 400));

  // costPerTaskScore: 과비용 비율 (고비용 모델 단순 작업 사용)
  const costScore = Math.max(0, 100 - stats.overCostRatio * 200);

  return (reQueryScore + costScore) / 2;
}
```

### 활용 확산 (20%)

```typescript
async function computeSpread(org_id: string, since: Date): Promise<number> {
  const { totalUsers, activeUsers } = await db.rpc('user_activity', { org_id, since });
  // 최근 7일 1회+ 사용자 = activeUsers

  if (totalUsers === 0) return 0;
  return (activeUsers / totalUsers) * 100;
}
```

### 활용 안전성 (15%)

```typescript
async function computeSafety(org_id: string, since: Date): Promise<number> {
  const issueCount = await db.rpc('flagged_issue_count', { org_id, since });
  const totalLogs = await db.rpc('total_log_count', { org_id, since });

  if (totalLogs === 0) return 100;
  const issueRatio = issueCount / totalLogs;

  // 이슈 비율 1% 이하면 100점, 5% 이상이면 0점
  return Math.max(0, Math.min(100, (0.05 - issueRatio) * 2000));
}
```

---

## PA-010-02 — 레벨 매핑 (MUST)

```typescript
function mapLevel(totalScore: number): 1 | 2 | 3 | 4 | 5 {
  if (totalScore >= 85) return 5;   // 최적화기
  if (totalScore >= 70) return 4;   // 확장기
  if (totalScore >= 55) return 3;   // 정착기
  if (totalScore >= 35) return 2;   // 실험기
  return 1;                         // 탐색기
}

interface MaturityScore {
  org_id: string;
  computed_at: Date;

  level: 1 | 2 | 3 | 4 | 5;
  level_name: string;
  total_score: number;  // 0~100

  breakdown: {
    scope: number;
    depth: number;
    efficiency: number;
    spread: number;
    safety: number;
  };

  trend: 'rising' | 'stable' | 'declining';  // 이전 달 대비
  delta: number;                              // 점수 변화
}
```

---

## PA-010-03 — 계산 주기 (MUST)

| 주기 | 동작 |
|---|---|
| 일간 | 지표 배치 계산 (`avg_session_turns`, `reQueryRatio` 등) |
| 주간 | 전체 성숙도 점수 + 트렌드 업데이트 |
| 월간 | 관리자 보고서 자동 생성 |

### 저장 테이블

```sql
CREATE TABLE maturity_scores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id),
  level       smallint NOT NULL CHECK (level BETWEEN 1 AND 5),
  total_score numeric(5,2) NOT NULL,
  breakdown   jsonb NOT NULL,     -- {scope, depth, efficiency, spread, safety}
  computed_at timestamptz NOT NULL DEFAULT now()
);

-- 인덱스: 조직별 최근 스코어 조회
CREATE INDEX idx_maturity_org_time ON maturity_scores(org_id, computed_at DESC);
```

---

## PA-010-04 — Next Step 추천 (SHOULD)

### 레벨별 추천 템플릿

| 레벨 | 단기 (1개월) | 중기 (3개월) | 장기 (6개월) |
|---|---|---|---|
| 1 탐색기 | AI 교육 세션 / 파일럿 팀 선정 | 1팀 파일럿 시작 / 가이드라인 기초 | 팀 단위 활용 확산 / ROI 측정 |
| 2 실험기 | 저사용 팀 온보딩 / 프롬프트 템플릿 | 반복 업무 자동화 검토 / 가이드라인 수립 | 챔피언 제도 / 통합 로드맵 |
| 3 정착기 | 모델 최적화 / 코칭 강화 | 커스텀 워크플로 / 에이전트 도입 | 조직 전체 내재화 |
| 4 확장기 | 고도화 지표 분석 | 자동화 에이전트 확장 | 업계 벤치마크 / MSP 계약 |
| 5 최적화기 | — (유지) | 내부 지식 축적 | 타사 모델 케이스 제공 |

### 개인화 추천 (Sprint 3+)

레벨 매핑 외에 **특정 팀 / 특정 지표 낮음** 기반 추천:

```
현재 상태
  개발팀 중심 Claude Code 활발 / 마케팅·기획팀 거의 미사용
  평균 재질문 비율 41% (권장 25% 이하)

단기 (이번 달)
  → 마케팅팀 AI 온보딩 가이드 배포
  → 재질문 줄이는 프롬프트 템플릿 제공

중기 (3개월)
  → 반복 업무 자동화 에이전트 도입 검토
  → 팀별 AI 활용 가이드라인 수립

장기 (6개월)
  → 사내 AI 챔피언 제도 운영
  → 업무 프로세스 AI 통합 로드맵 수립
```

---

## PA-010-05 — MSP 업셀 신호 (SHOULD)

특정 패턴 감지 시 Gridge 영업팀 내부 대시보드에 플래그:

| 신호 | 조건 |
|---|---|
| **AI 에이전트 도입 필요** | Level 3+ & 재질문 낮음 & 반복 업무 패턴 감지 |
| **통합 로드맵 필요** | Level 2+ & 3+ 팀이 AI 활용 격차 큼 |
| **엔터프라이즈 전환** | 100인 이상 & PII 감지 많음 & Mode B 미사용 |
| **교육 외주** | Level 1 & 6개월 지나도 Level 2 미도달 |

### 신호 → 영업 연동

- `msp_signals` 테이블에 일간 배치로 적재
- 영업팀 내부 대시보드에서 우선순위 정렬
- 고객에게 직접 알림은 **금지** (영업 맥락 먼저 파악)

### 외부 공유 제한 (MUST)

- 성숙도 점수 / 레벨 / 추천은 해당 **조직 내에서만** 공유
- 타 고객사 비교 / 익명 통계는 **super_admin 명시 opt-in** 필요
- Gridge 내부 영업이 "귀사는 Level 2" 라고 영업 멘트 쓰지 말 것 (신뢰 훼손)

---

## PA-010-06 — 보고서 자동 생성 (SHOULD)

월간 PDF/HTML 보고서:

```
Gridge AiOPS 월간 리포트 — [조직명]

이번 달 현황:
  레벨: Level 3 (정착기) ↑ (전월 Level 2에서 상승)
  총점: 67/100

항목별:
  활용 범위:   72점 ████████
  활용 깊이:   65점 ███████
  활용 효율:   58점 ██████
  활용 확산:   70점 ████████
  활용 안전성: 75점 █████████

주요 지표:
  - DAU: 18명 (전월 12명, +50%)
  - 주간 PR: 339건 (AI 활용)
  - 평균 재질문율: 29% (권장 25% 이내)

Next Step 추천:
  [단기] 마케팅팀 AI 온보딩
  [중기] 반복 업무 자동화 에이전트
  [장기] 사내 AI 챔피언 제도
```

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] 성숙도 점수가 `admin_teams` 에게 담당 팀 외 노출?
- [ ] Next Step 추천이 타 고객사 회사명 포함?
- [ ] `maturity_scores` 가 Mode B 고객 데이터를 크로스 학습?
- [ ] 성숙도 점수를 고객 동의 없이 외부(영업/파트너)에 노출 (G-089 정합)?
- [ ] 가중치 합계가 100% 아님?

---

## 참조

- 데이터 소스 (logs): `products/aiops/rules/data_model.md § PA-001`
- 이상 감지 (안전성 점수 연동): `products/aiops/rules/alerts.md § PA-009`
- 사용 패턴 분석: `products/aiops/rules/governance.md § PA-008-01`
- Mode B 데이터 격리: `05_infra_mode.md § 7` (G-087)
- 크로스 통계 제외: `06_hitl.md § 4.2` (G-105)
- 고객 데이터 소유: `05_infra_mode.md § 9` (G-089)
- BM / MSP 업셀 구조: `01_product.md § 6` / `products/aiops/CLAUDE.md § 6`
