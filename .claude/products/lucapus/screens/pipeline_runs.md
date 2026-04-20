# LucaPus / Screens / pipeline_runs — `/app/pipelines`

> 파이프라인 실행 이력. 필터 + 검색 + 재시도 + 비용 집계. 실패 원인 분석 진입점.

---

## 목적

개발자가 "지난 주 실행 중 뭐가 실패했지?" 한눈에 확인 + 유사 케이스 재시도.

## 레이아웃

```
┌──────────────────────────────────────────────────┐
│ 파이프라인 실행 이력                                │
│ 이번 달: 127회 · 성공 112 · 실패 15 · 평균 4분    │
├──────────────────────────────────────────────────┤
│ 필터: [기간▾] [상태▾] [프로젝트▾] [Mode▾]        │
│ 검색: 🔍 스펙명 / run ID / 오류 메시지             │
├──────────────────────────────────────────────────┤
│ 상태  스펙              Mode  소요   비용    실행 │
│                                                    │
│ ✅  spec-042-auth-refactor   A  4:12  ₩18.5k  3분 전│
│ 🟡  spec-041-payment-flow    A  진행 중  -    5분 전│
│ 🔴  spec-040-search-api      A  2:45  ₩8.2k  30분 전│
│      └ Verify 실패 (rate limit) [재시도]          │
│ ✅  spec-039-analytics       B  8:21  ₩0     2시간전│
│ 🔴  spec-038-modal-refactor  A  1:34  ₩4.1k  어제 │
│      └ Spec 실패 (모호성 미해결) [진단]           │
│ ✅  spec-037-dashboard       A  5:12  ₩22k   어제 │
│ ...                                                │
│                                                    │
│ [더 보기 (50건 더)]                               │
└──────────────────────────────────────────────────┘
```

## 필터 옵션

- **기간**: 오늘 / 7일 / 30일 / 전체
- **상태**: 전체 / 🟡 실행 중 / ✅ 성공 / 🔴 실패 / ⚫ 취소
- **프로젝트**: 본인 프로젝트만 / 팀 공유 / 전체
- **Mode**: A / B / C
- **검색**: 스펙 제목 / run ID / 오류 키워드

## 요약 StatCard (상단)

```
┌──────────┬──────────┬──────────┬──────────┐
│ 실행 횟수 │ 성공률   │ 평균 소요 │ 총 비용   │
│ 127      │ 88%      │ 4분 12초  │ ₩1.2M    │
│ ▲ +15    │ ↔️        │ ▼ -18초   │ ▲ +22%   │
└──────────┴──────────┴──────────┴──────────┘
```

## 실패 패턴 분석 (대시보드)

```
┌────────────────────────────────────────────┐
│ 🔍 실패 원인 분석 (이번 달 15건)              │
│                                              │
│ Rate Limit (5건) ████████░░                  │
│ 모호성 미해결 (4건) ██████░░░░                │
│ 의존성 충돌 (3건) ████░░░░░░                  │
│ 타임아웃 (2건) ███░░░░░░░                     │
│ 기타 (1건) ██░░░░░░░░                         │
│                                              │
│ [원인별 상세]  [개선 제안]                    │
└────────────────────────────────────────────┘
```

클릭 → 원인별 필터링 + 개선 방법 제시:
- Rate Limit → "실행 간격 늘리기 / Mode C 로 전환"
- 모호성 미해결 → "스펙 템플릿 활용 / SSOT 강화 설정"

## 재시도 로직

`[재시도]` 버튼 클릭 시 모달:

```
┌──────────────────────────────────────┐
│ spec-040-search-api 재시도             │
│                                        │
│ 이전 실행: 2026-05-15 13:53            │
│ 실패 단계: Verify Orchestrator         │
│ 실패 원인: API rate limit               │
│                                        │
│ 재시도 옵션:                            │
│ ● 실패 단계부터 (Verify)                │
│ ○ 처음부터 전체                         │
│                                        │
│ Mode 변경:                              │
│ ○ 그대로 (A)  ● C (고객 API)           │
│                                        │
│ 지연 (rate limit 회피):                 │
│ ● 즉시  ○ 5분 후  ○ 1시간 후            │
│                                        │
│     [취소]     [재시도 시작]           │
└──────────────────────────────────────┘
```

## 비용 집계 (월말)

```
┌────────────────────────────────────────────┐
│ 💰 2026년 5월 비용 내역                       │
│                                              │
│ Mode A (Gridge):   ₩920,000   (76%)          │
│ Mode B (On-prem):  ₩0          (0%, 18 runs)│
│ Mode C (고객 API): ₩280,000   (24%)          │
│ ─────────────────────────────────           │
│ 총계:              ₩1,200,000                │
│                                              │
│ 에이전트별:                                   │
│ ├ ssot-master: ₩230k (19%)                  │
│ ├ be-developer: ₩450k (38%)                 │
│ ├ fe-developer: ₩180k (15%)                 │
│ ├ tech-leader: ₩220k (18%)                  │
│ └ qa-verifier: ₩120k (10%)                  │
│                                              │
│ [CSV 내보내기]  [지출 그래프]                │
└────────────────────────────────────────────┘
```

## 데이터 소스

```sql
-- 리스트
SELECT pr.*, s.title AS spec_title, p.name AS project_name,
  EXTRACT(EPOCH FROM (pr.completed_at - pr.started_at)) AS duration_sec,
  pr.total_cost_krw,
  pr.mode,
  CASE WHEN pr.status = 'failed' 
    THEN jsonb_build_object(
      'stage', pr.failed_at_orchestrator,
      'reason', pr.error_category
    )
    ELSE NULL
  END AS failure_info
FROM pipeline_runs pr
JOIN specs s ON s.id = pr.spec_id
JOIN projects p ON p.id = pr.project_id
WHERE p.org_id = $1
  AND pr.created_at >= $from
ORDER BY pr.created_at DESC
LIMIT 50;

-- 요약 StatCard
SELECT 
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'completed') AS successes,
  COUNT(*) FILTER (WHERE status = 'failed') AS failures,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) AS avg_seconds,
  SUM(total_cost_krw) AS total_cost
FROM pipeline_runs
WHERE project_id IN (...)
  AND created_at >= date_trunc('month', now());

-- 실패 패턴
SELECT error_category, COUNT(*) 
FROM pipeline_runs
WHERE status = 'failed'
  AND created_at >= date_trunc('month', now())
GROUP BY error_category
ORDER BY COUNT(*) DESC;
```

## CSV 내보내기

월말 팀 리포트 or 비용 감사:
```csv
run_id,spec_title,project,mode,status,duration_sec,cost_krw,started_at,completed_at
run_abc,auth-refactor,project_x,A,completed,252,18500,2026-05-15T14:23:00Z,2026-05-15T14:27:12Z
...
```

## 실시간 갱신

```typescript
supabase.channel('pipeline_runs_list')
  .on('postgres_changes', 
    { event: '*', schema: 'lucapus', table: 'pipeline_runs' },
    (payload) => {
      if (payload.eventType === 'INSERT') prependRun(payload.new);
      else updateRun(payload.new);
    })
  .subscribe();
```

## 권한

- **Admin**: 조직 전체 실행 이력
- **Developer**: 본인 프로젝트 + 참여 팀 프로젝트
- **Viewer**: 조회만

## Sprint 우선순위

**Sprint 2**. 디버깅 + 재시도 시 핵심. Sprint 1 에서는 대시보드 최근 5건으로 대체.

## 참조

- Orchestrator 실행 뷰: `screens/orchestrator_view.md`
- 비용 규칙 (D-093 Cost Plane): `planes/CLAUDE.md`
- 규칙 D-090~099: `rules/00_index.md`
