# LucaPus / Screens / dashboard — `/app/dashboard`

> 로그인 후 첫 화면. 프로젝트 선택 + 최근 실행 + 빠른 액션. 개발자가 "오늘 뭘 할까" 5초 내 결정.

---

## 목적

개발자의 워크스페이스 진입점. 프로젝트 전환 + 최근 실행 상태 + 새 스펙 시작 버튼.

## 레이아웃

```
┌─────────────────────────────────────────────────────┐
│ [🔵 Mode A · Claude Opus 4 · 🟢 5]  [project_x ▾] [👤] │
├─────────────┬───────────────────────────────────────┤
│ 네비         │ 메인 영역                                │
│             │                                          │
│ project_x    │ ┌────────────────────────────────────┐ │
│ ├ Workbench │ │ 👋 안녕하세요, Alice                │ │
│ ├ Orchest.  │ │ 이번 주 파이프라인 실행 23회        │ │
│ ├ Pipelines │ │ 성공률 91% · 평균 완료 4분 12초     │ │
│ └ Settings  │ └────────────────────────────────────┘ │
│             │                                          │
│ project_y    │ ┌────────────────────────────────────┐ │
│ project_z    │ │ 🚀 빠른 시작                         │ │
│             │ │                                       │ │
│ [+ 프로젝트]│ │ [+ 새 스펙 작성]   [기존 스펙에서]   │ │
│             │ │ [+ 빈 파이프라인]                    │ │
│             │ └────────────────────────────────────┘ │
│             │                                          │
│             │ ┌────────────────────────────────────┐ │
│             │ │ 📊 최근 실행 (5)                      │ │
│             │ │                                       │ │
│             │ │ ✅ spec-042-auth-refactor · 3분 전   │ │
│             │ │    4-Plane 통과 · PR #234 생성      │ │
│             │ │    [상세]                            │ │
│             │ │                                       │ │
│             │ │ 🟡 spec-041-payment-flow · 진행 중   │ │
│             │ │    Code Orchestrator 실행 중 (2/3)   │ │
│             │ │    [상세]  [일시 중지]                │ │
│             │ │                                       │ │
│             │ │ 🔴 spec-040-search-api · 30분 전     │ │
│             │ │    Verify Orchestrator 실패          │ │
│             │ │    [상세]  [재시도]                   │ │
│             │ │                                       │ │
│             │ │ ...                                   │ │
│             │ └────────────────────────────────────┘ │
│             │                                          │
│             │ ┌────────────────────────────────────┐ │
│             │ │ 💡 추천 작업                           │ │
│             │ │                                       │ │
│             │ │ 실패한 spec-040 재시도 가능           │ │
│             │ │ (이유: API 키 rate limit)            │ │
│             │ │ [진단]  [재시도]                     │ │
│             │ └────────────────────────────────────┘ │
└─────────────┴───────────────────────────────────────┘
```

## 상단 헤더 세션 배지

세션 배지 클릭 시 Mode 전환 패널 (Admin 만):

```
┌────────────────────────────────────┐
│ Mode 전환                             │
│                                      │
│ ● 🔵 Mode A (Gridge 호스팅)          │
│   Claude Opus 4 · OpenAI GPT-4o     │
│   월 예상 비용: ~₩3.2M               │
│                                      │
│ ○ 🟣 Mode B (온프레미스)              │
│   vLLM Llama-3 70B                  │
│   Endpoint: llm.internal             │
│                                      │
│ ○ 🟠 Mode C (고객 API 키)             │
│   [API 키 설정]                      │
│                                      │
│ [취소]  [적용]                       │
└────────────────────────────────────┘
```

## 프로젝트 드롭다운

우상단 드롭다운 클릭:

```
┌────────────────────────────┐
│ 🔍 프로젝트 검색              │
├────────────────────────────┤
│ ⭐ project_x (현재)          │
│   project_y                 │
│   project_z                 │
│                              │
│ [+ 새 프로젝트]              │
└────────────────────────────┘
```

## StatCard 3개 (상단 요약)

```
┌──────────┬──────────┬──────────┐
│ 이번 주   │ 성공률   │ 평균 소요│
│ 23회     │ 91%      │ 4분12초  │
│ ▲ +5     │ ↔️ 동일   │ ▼ -22초  │
└──────────┴──────────┴──────────┘
```

각 카드 클릭 → 상세 통계 페이지.

## 빠른 시작 카드

3가지 시작 방식:

### 1. `+ 새 스펙 작성`
→ `/workbench/new` Spec Workbench 로 이동, 빈 스펙 템플릿

### 2. `기존 스펙에서`
→ 과거 스펙 선택 모달 → 복사 + 수정 기반 시작

### 3. `+ 빈 파이프라인`
→ 스펙 없이 orchestrator 직접 실행 (고급 사용자)

## 최근 실행 리스트

```sql
SELECT pr.*, 
  s.title AS spec_title,
  -- 현재 orchestrator 상태
  CASE 
    WHEN pr.status = 'running' THEN 
      format('%s Orchestrator 실행 중 (%s/3)',
        pr.current_orchestrator,
        pr.current_step)
    WHEN pr.status = 'completed' THEN 
      format('4-Plane 통과 · %s', pr.output_summary)
    WHEN pr.status = 'failed' THEN 
      format('%s Orchestrator 실패', pr.failed_at_orchestrator)
  END AS status_text
FROM pipeline_runs pr
LEFT JOIN specs s ON s.id = pr.spec_id
WHERE pr.project_id = $1
ORDER BY pr.created_at DESC
LIMIT 10;
```

## 추천 작업 (AI 기반)

실패 원인 자동 진단 + 추천:

```typescript
async function suggestAction(run: PipelineRun): Promise<Suggestion> {
  if (run.status === 'failed') {
    const errorPattern = await analyzeError(run.error_log);
    
    if (errorPattern === 'rate_limit') {
      return {
        reason: 'API 키 rate limit',
        actions: [
          { label: '진단', action: 'open_diagnostic' },
          { label: '재시도', action: 'retry_with_backoff', delay_sec: 60 }
        ]
      };
    }
    
    if (errorPattern === 'spec_ambiguity') {
      return {
        reason: '스펙 모호성 감지 (SSOT master 실패)',
        actions: [
          { label: '스펙 수정', action: 'edit_spec' },
          { label: 'AI 질문 생성', action: 'gen_clarifying_questions' }
        ]
      };
    }
    // ... 기타 패턴
  }
  
  if (run.status === 'completed' && run.quality_score < 0.7) {
    return {
      reason: '품질 점수 낮음 (< 70%)',
      actions: [
        { label: '리뷰', action: 'open_review' },
        { label: '재생성', action: 'regenerate_with_stricter_rules' }
      ]
    };
  }
  
  return null;
}
```

## 실시간 갱신

```typescript
supabase.channel('pipeline_runs_dashboard')
  .on('postgres_changes', 
    { event: '*', schema: 'lucapus', table: 'pipeline_runs' },
    (payload) => {
      updateRunInList(payload.new);
      updateStatCards();
    })
  .subscribe();
```

## 빈 상태 (첫 로그인)

프로젝트 0개:
```
┌──────────────────────────────────┐
│        🚀                         │
│   첫 프로젝트를 만들어보세요!      │
│                                     │
│   [+ 프로젝트 생성]                │
│                                     │
│   또는 [튜토리얼 보기]              │
└──────────────────────────────────┘
```

프로젝트 있음, 실행 0개:
```
┌──────────────────────────────────┐
│        📝                         │
│   아직 스펙이 없어요.              │
│                                     │
│   [+ 새 스펙 작성]                 │
└──────────────────────────────────┘
```

## 권한

- **Admin/Developer**: 전체 기능
- **Viewer**: 실행 이력 조회만 (빠른 시작 비활성화)

## Sprint 우선순위

**Sprint 1 필수**. 로그인 후 첫 화면. 빈 상태 처리 중요.

## 참조

- 4-Plane 아키텍처: `planes/CLAUDE.md`
- 3 Orchestrator: `orchestrators/CLAUDE.md`
- 실행 이력 상세: `screens/pipeline_runs.md`
- 스펙 작성: `screens/spec_workbench.md`
- 규칙: `rules/00_index.md` (D-xxx)
