# LucaPus / Rules / Adapt Score — 규칙 본문

> PL-008 본문. 적합화 점수 계산 알고리즘.
> Wiring 적합화 탭 상단 프로그레스 바의 계산 로직.

---

## PL-008 — 적합화 점수 (SHOULD)

### 목적

**"이 프로젝트가 얼마나 AI-ready 한가?"** 를 0~100 단일 숫자로 표현.

- 사용자 동기 부여 (프로그레스 감각)
- 영업 / 컨설팅 지표 (MSP 업셀 신호)
- AI 성숙도 평가와 연계 (PA-010)

---

## PL-008-01 — 5개 차원 (MUST)

| 차원 | 가중치 | 측정 |
|---|---|---|
| **규칙 범위** (Coverage) | 30% | 필요한 규칙 카테고리 중 결정된 비율 |
| **규칙 깊이** (Depth) | 20% | 핵심 규칙에 구체 조건이 명시된 비율 |
| **일관성** (Consistency) | 20% | 조직 MUST 위반 없는 비율 |
| **활용도** (Usage) | 15% | 최근 HITL 결정 빈도 |
| **안정성** (Stability) | 15% | 재질문 / 번복 비율 (낮을수록 좋음) |

합 100%.

---

## PL-008-02 — 계산 공식 (MUST)

```typescript
interface AdaptScore {
  total: number;              // 0~100
  coverage: number;           // 0~100
  depth: number;              // 0~100
  consistency: number;        // 0~100
  usage: number;              // 0~100
  stability: number;          // 0~100

  computed_at: Date;
  project_id: string;
}

async function computeAdaptScore(project_id: string): Promise<AdaptScore> {
  const coverage = await computeCoverage(project_id);
  const depth = await computeDepth(project_id);
  const consistency = await computeConsistency(project_id);
  const usage = await computeUsage(project_id);
  const stability = await computeStability(project_id);

  const total =
    coverage * 0.30 +
    depth * 0.20 +
    consistency * 0.20 +
    usage * 0.15 +
    stability * 0.15;

  return {
    total: Math.round(total),
    coverage, depth, consistency, usage, stability,
    computed_at: new Date(),
    project_id,
  };
}
```

---

## PL-008-03 — 각 차원 상세 (MUST)

### 1. 규칙 범위 (Coverage, 30%)

프로젝트 기술 스택 / 도메인에 필요한 규칙 카테고리 **N개** 중 결정된 **M개** 비율:

```typescript
async function computeCoverage(project_id: string): Promise<number> {
  const requiredCategories = await getRequiredCategories(project_id);
  // 예: ['auth', 'db', 'cache', 'event', 'security', 'api', ...]

  const decidedCategories = await db.rpc('decided_categories', { project_id });
  // 규칙이 1개 이상 등록된 카테고리

  return (decidedCategories.length / requiredCategories.length) * 100;
}
```

필요 카테고리 목록은 온톨로지 (PL-007) 에서 제공.

### 2. 규칙 깊이 (Depth, 20%)

각 카테고리의 **핵심 규칙**이 구체 조건을 가진 비율:

```typescript
async function computeDepth(project_id: string): Promise<number> {
  const keyRules = await getKeyRules(project_id);
  // 각 카테고리의 '핵심 규칙' (온톨로지 제공)

  let specificCount = 0;
  for (const rule of keyRules) {
    const decided = await getDecidedRule(project_id, rule.id);
    if (decided && decided.details?.conditions?.length > 0) {
      specificCount++;
    }
  }

  return (specificCount / keyRules.length) * 100;
}
```

예: `rule-jwt` 가 단순 "MUST" 가 아니라 "만료 15분 + RTR 전략 + blacklist" 처럼 상세 명시.

### 3. 일관성 (Consistency, 20%)

조직 MUST 규칙 **위반 없음** 비율:

```typescript
async function computeConsistency(project_id: string): Promise<number> {
  const orgMustRules = await getOrgMustRules(project_id);
  const violations = await detectViolations(project_id, orgMustRules);

  if (orgMustRules.length === 0) return 100;
  return ((orgMustRules.length - violations.length) / orgMustRules.length) * 100;
}
```

위반 감지는 SSOT Verifier T3 (PL-005-03) 결과 활용.

### 4. 활용도 (Usage, 15%)

최근 **30일 HITL 결정 수**를 기준선과 비교:

```typescript
async function computeUsage(project_id: string): Promise<number> {
  const recentResolutions = await db.rpc('hitl_resolutions_last_30_days', { project_id });
  const baseline = 20;  // 월 20건이 기준선 (점수 100)

  return Math.min((recentResolutions / baseline) * 100, 100);
}
```

활용도 낮음 = 프로젝트 정체 / 사용자 이탈.

### 5. 안정성 (Stability, 15%)

**번복 / 재질문 비율** (낮을수록 좋음):

```typescript
async function computeStability(project_id: string): Promise<number> {
  const stats = await db.rpc('hitl_stats_last_30_days', { project_id });
  // { total, re_asked, overridden }

  if (stats.total === 0) return 100;

  const reAskRatio = stats.re_asked / stats.total;
  const overrideRatio = stats.overridden / stats.total;

  // 재질문 25% / 번복 10% 이하 → 100점
  const reAskScore = Math.max(0, 100 - reAskRatio * 400);
  const overrideScore = Math.max(0, 100 - overrideRatio * 1000);

  return (reAskScore + overrideScore) / 2;
}
```

---

## PL-008-04 — 점수 갱신 주기 (MUST)

| 트리거 | 동작 |
|---|---|
| HITL 결정 완료 | 해당 프로젝트 재계산 (실시간) |
| 규칙 추가 / 폐기 | 재계산 |
| 정기 배치 | 매일 00:00 전 프로젝트 갱신 |

### 저장 테이블

```sql
CREATE TABLE adapt_scores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  total        smallint NOT NULL CHECK (total BETWEEN 0 AND 100),
  coverage     smallint NOT NULL,
  depth        smallint NOT NULL,
  consistency  smallint NOT NULL,
  usage        smallint NOT NULL,
  stability    smallint NOT NULL,

  computed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_adapt_scores_project_time ON adapt_scores(project_id, computed_at DESC);
```

### 과거 이력

- 최근 1년 보관
- 프로젝트 트렌드 차트 (Wiring 대시보드)

---

## PL-008-05 — UI 표시 (MUST)

### Wiring 적합화 탭 상단

```
적합화 점수:  ████████░░  76 / 100

  규칙 범위:    82  ████████░░
  규칙 깊이:    71  ███████░░░
  일관성:       90  █████████░
  활용도:       65  ██████░░░░
  안정성:       74  ███████░░░

트렌드 (30일): ▁▂▃▄▅▆▇ +12
```

### 위계별 노출

| 위계 | 보이는 것 |
|---|---|
| OA / L1 | 전 프로젝트 점수 + 팀 평균 |
| L2 PM | 담당 프로젝트 점수 + 5차원 |
| L3 | 담당 프로젝트 점수 + 상세 breakdown |
| L4 | 본인 기여도 (참여 결정 수 등) |

---

## PL-008-06 — 영업 / MSP 업셀 신호 (SHOULD, PA-010 연동)

### 신호 임계

| 신호 | 조건 |
|---|---|
| **AI 도입 멈춤** | 점수 < 40 + Usage < 30 (30일) |
| **성숙 도달** | 점수 > 85 + 전 차원 > 75 |
| **기술 부채 경고** | Consistency < 60 (조직 MUST 위반 많음) |
| **PM 가시화 필요** | Stability < 50 (번복 많음) |

### Gridge 내부 영업 대시보드에만 표시

고객에게 직접 영업 멘트 사용 **금지** (G-089 정합).

---

## PL-008-07 — 가중치 조정 (SHOULD)

### 조직 플랜별 기본값

| 플랜 | 가중치 조정 |
|---|---|
| Starter | 기본값 (위 표) |
| Growth | Consistency 25% / Usage 10% |
| Enterprise | Consistency 35% / Stability 25% |

엔터프라이즈는 안정성 / 일관성 더 중시.

### 고객 옵션 (SHOULD)

OA 가 `/org/settings` 에서 가중치 조정 가능 (합 100%):
- 시각 피드백 있음 (가중치 합 != 100 시 경고)
- 감사 로그 필수 (G-141)

---

## PL-008-08 — 프라이버시 (MUST)

- Mode B 고객 점수는 그릿지 글로벌 통계에 **포함 X** (G-087)
- 크로스 고객사 벤치마킹 시 익명화
- "귀사 점수가 업계 평균 이상/이하" 류 멘트는 **고객 동의 시에만** (G-089)

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] 가중치 합계 != 100%?
- [ ] `L4` 에게 전체 breakdown 노출?
- [ ] `admin_teams` 가 담당 외 팀 점수 조회?
- [ ] Mode B 점수가 크로스 벤치마크에 기여?
- [ ] 고객 점수 기반 영업 멘트 자동 발송?
- [ ] 점수 임계 조건이 서버 검증 없이 클라이언트 계산?
- [ ] 과거 점수 이력 삭제 가능 (감사 목적 유지 필요)?

---

## 참조

- 5차원 원리: `products/aiops/rules/maturity.md § PA-010` (AI 성숙도)
- HITL 테이블: `products/wiring/schemas/tables/hitl_cards.md`
- 규칙 테이블: `products/wiring/schemas/tables/rule_timeline.md`
- SSOT Verifier T3: `products/lucapus/rules/gate.md § PL-005-03`
- Mode B 통계 제외: `05_infra_mode.md § 7` (G-087)
- 고객 데이터 소유: `05_infra_mode.md § 9` (G-089)
- 온톨로지 카테고리: `products/lucapus/rules/ontology.md` (PL-007)
