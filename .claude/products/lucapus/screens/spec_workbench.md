# LucaPus / Screens / spec_workbench — `/app/workbench/[specId]`

> 4-Plane 스펙 작성 공간. Problem / Solution / Contract / Context 4개 섹션 동시 편집. AI 실시간 검증 + 모호성 감지.

---

## 목적

개발자가 자연어로 스펙을 작성하면 AI 가 구조화된 4-Plane 모델로 변환 + 실시간 검증. 스펙 완성도 점수 + 실행 준비 상태 표시.

## 레이아웃 (4-Plane 탭 + 통합 뷰)

```
┌──────────────────────────────────────────────────────┐
│ Spec #042 · 사용자 인증 리팩토링        [💾 저장됨]   │
│ 준비도: 🟢 87% · 모호성 2건 · [파이프라인 실행 →]    │
├──────────────────────────────────────────────────────┤
│ [📋 Problem]  [💡 Solution]  [📐 Contract]  [🧩 Context] │
│ [🌐 통합 뷰]                                           │
├──────────────────────────────────────────────────────┤
│ [선택된 탭]                                            │
│                                                        │
│ (예: Problem)                                          │
│                                                        │
│ 무엇을 해결하려고 하나요?                              │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 현재 인증 시스템이 세션 기반인데,                   │ │
│ │ 모바일 앱에서 자동 로그아웃이 너무 잦음.           │ │
│ │ 사용자 70% 가 30분 이내에 재로그인 요구 경험.     │ │
│ │                                                    │ │
│ │ ⚠️ 모호성 감지: "자동 로그아웃이 너무 잦음"        │ │
│ │   → 정량적 기준이 무엇인가요?                      │ │
│ │   [해결 제안]                                      │ │
│ └──────────────────────────────────────────────────┘ │
│                                                        │
│ 영향 받는 사용자: [모바일 앱 ☑] [웹 ☐] [데스크톱 ☐] │
│ 우선순위:         ● High  ○ Medium  ○ Low             │
│ 성공 지표:                                             │
│ ┌──────────────────────────────────────────────────┐ │
│ │ - 자동 로그아웃 간격 4시간 → 24시간                │ │
│ │ - 재로그인 요청률 70% → 20% 이하                   │ │
│ └──────────────────────────────────────────────────┘ │
│                                                        │
│ [◀ 이전]   [다음: Solution ▶]                         │
└──────────────────────────────────────────────────────┘
```

## 4-Plane 구조 (D-001~D-099 정의)

### Plane 1: Problem (문제 정의)
- 무엇을 해결하려는가
- 영향받는 사용자
- 우선순위
- 성공 지표 (정량)

### Plane 2: Solution (해결 방안)
- 제안하는 접근 방식
- 대안 탐색 (왜 이 방안인가)
- 기술 선택 근거
- 예상 제약

### Plane 3: Contract (계약)
- API / 인터페이스 정의
- 입출력 스키마 (Zod/TypeScript)
- 에러 케이스
- 하위 호환성

### Plane 4: Context (컨텍스트)
- 현재 시스템 관련 부분
- 의존성 (외부 서비스, 내부 모듈)
- 제약 (법무 / 보안 / 성능)
- 연관 스펙 (이전, 이후)

## 실시간 모호성 감지

AI 가 입력 텍스트 분석 → 모호성 표시 + 해결 제안:

```typescript
async function detectAmbiguity(text: string): Promise<Ambiguity[]> {
  // Ontology mapper (D-020)
  const ambiguities = await claudeApi({
    system: SSOT_MASTER_PROMPT,  // D-015
    user: text,
    return: 'structured_ambiguities'
  });
  
  return ambiguities.map(a => ({
    phrase: a.phrase,         // "자동 로그아웃이 너무 잦음"
    reason: a.reason,         // "정량적 기준 누락"
    suggestions: a.suggestions, // ["30분 이내", "하루 N회 이상" 등]
    severity: a.severity,     // 'high' | 'medium' | 'low'
    auto_fix_available: a.auto_fix_available
  }));
}
```

## 통합 뷰 (5번째 탭)

4 Plane 을 한 화면에 병렬 표시 → 일관성 체크:
```
┌─────────────────────────────────────────────────┐
│ 📋 Problem (우측 스크롤)                          │
│ 현재 인증이 세션 기반...                           │
├─────────────────────────────────────────────────┤
│ 💡 Solution                                       │
│ JWT + Refresh Token 기반으로 전환...              │
├─────────────────────────────────────────────────┤
│ 📐 Contract                                       │
│ POST /auth/refresh → { accessToken, refreshToken}│
├─────────────────────────────────────────────────┤
│ 🧩 Context                                         │
│ 현재 express-session + connect-redis 사용 중      │
└─────────────────────────────────────────────────┘

교차 검증:
✅ Problem "자동 로그아웃" ↔ Solution "Refresh Token"
🟡 Contract 에 refresh 실패 케이스 미정의
❌ Context "connect-redis" 제거 계획 누락
```

## 준비도 점수 계산

```typescript
function calculateReadiness(spec: Spec): ReadinessScore {
  let total = 100;
  const issues = [];
  
  // 각 Plane 필수 필드 체크
  for (const plane of ['problem', 'solution', 'contract', 'context']) {
    const completeness = checkPlaneCompleteness(spec[plane]);
    if (completeness < 0.7) {
      total -= (1 - completeness) * 15;
      issues.push(`${plane}: ${Math.round(completeness*100)}% 완성`);
    }
  }
  
  // 모호성 페널티
  total -= spec.ambiguities.filter(a => a.severity === 'high').length * 10;
  total -= spec.ambiguities.filter(a => a.severity === 'medium').length * 5;
  
  // 교차 검증
  const crossCheck = runCrossValidation(spec);
  if (!crossCheck.passed) {
    total -= crossCheck.issues.length * 5;
  }
  
  return {
    score: Math.max(0, total),
    level: total >= 80 ? 'ready' : total >= 60 ? 'draft' : 'incomplete',
    issues,
    blockers: issues.filter(i => i.startsWith('!'))
  };
}
```

## 파이프라인 실행 버튼

준비도 ≥ 80 시 활성화:
```
[파이프라인 실행 →]
    클릭 시:
      1. spec version 잠금 (immutable)
      2. pipeline_runs INSERT
      3. Spec Orchestrator 시작 (D-050)
      4. orchestrator_view.md 이동
```

준비도 < 80 시 버튼 비활성화 + 부족 항목 toast:
```
⚠️ 준비도 67% · 파이프라인 실행 불가
  - Problem: 성공 지표 정량화 필요
  - Contract: refresh 실패 케이스 누락
  - 모호성 2건 해결 필요
[자동 보완 시도]
```

## 자동 저장

Monaco Editor onChange debounce 1초 후 자동 저장:
```typescript
const debouncedSave = useMemo(
  () => debounce(async (content) => {
    await db.update('specs', specId, {
      [currentPlane]: content,
      updated_at: new Date()
    });
    // 실시간 검증
    const ambiguities = await detectAmbiguity(content);
    setAmbiguities(ambiguities);
  }, 1000),
  [specId, currentPlane]
);
```

## AI 제안 패널 (우측)

```
┌─────────────────────────┐
│ 🤖 AI 제안                │
├─────────────────────────┤
│ 현재 작업: Problem 섹션   │
│                           │
│ 모호성 해결 제안:          │
│                           │
│ 1. "너무 잦음" →          │
│    "30분 이내 평균 1회"   │
│    [적용]  [무시]         │
│                           │
│ 2. "사용자" →             │
│    "월간 활성 사용자 (MAU)"│
│    [적용]  [무시]         │
│                           │
│ ────────────              │
│                           │
│ 유사 스펙 참고:            │
│ • spec-023: OAuth 전환    │
│ • spec-019: 세션 관리     │
└─────────────────────────┘
```

## 실시간 협업 (Phase 1+)

여러 개발자가 동시 편집 시 Supabase Realtime + Operational Transform:
```
Alice 편집 중: Problem 섹션 (3초 전)
Bob 편집 중: Context 섹션 (지금)
```

## 권한

- **Admin/Developer**: 편집 + 실행
- **Viewer**: 읽기 전용

## 참조

- 4-Plane 정의: `planes/CLAUDE.md`
- SSOT master 규칙: `rules/ssot.md` (D-015)
- Ontology mapper: `rules/ontology.md` (D-020)
- 실행 이동: `screens/orchestrator_view.md`
- 규칙 D-001~099: `rules/00_index.md`
