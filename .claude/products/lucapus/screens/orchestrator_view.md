# LucaPus / Screens / orchestrator_view — `/app/pipelines/[runId]`

> 3 Orchestrator (Spec / Code / Verify) 실행 상황 실시간 시각화. React Flow 기반. 단계별 로그 + HITL 일시 중지.

---

## 목적

개발자가 "내 스펙이 지금 어디까지 갔는지" 투명하게 확인. 오류 즉시 진단 + 재시도 + 중단.

## 레이아웃

```
┌──────────────────────────────────────────────────────┐
│ Pipeline #run_abc · spec-042                          │
│ 상태: 🟡 실행 중 · Code Orchestrator (2/3)            │
│ 시작: 4분 전 · 예상 완료: ~3분                        │
├──────────────────────────────────────────────────────┤
│ [🎬 시각화]  [📜 로그]  [🔍 산출물]  [⚙️ 설정]        │
├──────────────────────────────────────────────────────┤
│ [선택된 탭]                                             │
└──────────────────────────────────────────────────────┘
```

## 탭 1: 시각화 (기본)

React Flow 3 Orchestrator 흐름도:

```
  ┌──────────────┐
  │ Spec         │
  │ Orchestrator │  ✅ 완료 (2분 14초)
  │              │  • 모호성 해결 3건
  │ ─ SSOT       │  • Ontology 매핑 완료
  │ ─ Ontology   │  • 의존성 분석 완료
  │ ─ Dependency │
  └──────┬───────┘
         ↓
  ┌──────────────┐
  │ Code         │
  │ Orchestrator │  🟡 실행 중 (2/3)
  │              │
  │ ─ Arch ✅    │  아키텍처: Next.js App Router + tRPC
  │ ─ Impl 🟡   │  구현: be-developer 작업 중 (78%)
  │ ─ Review ⏳ │  리뷰: 대기
  └──────┬───────┘
         ↓
  ┌──────────────┐
  │ Verify       │
  │ Orchestrator │  ⏳ 대기
  │              │
  │ ─ Static     │
  │ ─ Unit       │
  │ ─ Integration│
  └──────────────┘
```

각 노드 클릭 → 상세 드로어.

## 노드 상세 드로어 (예: Spec Orchestrator)

```
┌───────────────────────────────────────────┐
│ Spec Orchestrator · ✅ 완료          [×]   │
├───────────────────────────────────────────┤
│ 소요 시간: 2분 14초                         │
│ 토큰 사용: 45k in / 12k out · ₩18,500      │
│                                             │
│ 단계별 결과:                                │
│                                             │
│ ✅ SSOT 확정 (32초)                         │
│    - 모호성 3건 자동 해결                    │
│    - "자동 로그아웃" → "30분 이내 평균 1회"  │
│    [자세히]                                 │
│                                             │
│ ✅ Ontology 매핑 (45초)                     │
│    - 관련 도메인: auth, session, mobile     │
│    - 기존 용어 사전과 병합                   │
│    [자세히]                                 │
│                                             │
│ ✅ 의존성 분석 (57초)                       │
│    - 영향 파일: 8개                         │
│    - 충돌 스펙: 없음                        │
│    - 관련 스펙: spec-023, spec-019          │
│    [자세히]                                 │
│                                             │
│ 산출물:                                     │
│ 📄 refined-spec.md                          │
│ 📄 ontology-map.json                        │
│ 📄 dependency-graph.json                    │
│                                             │
│ [산출물 다운로드]  [로그 복사]               │
└───────────────────────────────────────────┘
```

## 탭 2: 로그 (스트리밍)

실시간 로그 스트리밍 (Supabase Realtime):

```
[2026-05-15 14:23:01] 🎬 Pipeline 시작 (run_abc)
[2026-05-15 14:23:02] 📋 Spec Orchestrator 시작
[2026-05-15 14:23:02] 🤖 ssot-master 세션 시작 (Claude Opus 4)
[2026-05-15 14:23:04] 💬 "스펙 분석 중..."
[2026-05-15 14:23:15] ⚠️ 모호성 감지: "자동 로그아웃이 너무 잦음"
[2026-05-15 14:23:16] 🔧 자동 해결 시도: 정량 기준 생성
[2026-05-15 14:23:23] ✅ SSOT 확정 완료
[2026-05-15 14:23:24] 📋 Ontology 매핑 시작
...
```

필터:
- 레벨: `[DEBUG] [INFO] [WARN] [ERROR]`
- Orchestrator: 전체 / Spec / Code / Verify
- 에이전트: 전체 / ssot-master / tech-leader / ...

## 탭 3: 산출물

파이프라인이 생성한 모든 파일:

```
📁 산출물 (12개)

📁 spec/
  📄 refined-spec.md         [보기]  [다운로드]
  📄 ontology-map.json       [보기]  [다운로드]
  📄 dependency-graph.json    [보기]

📁 code/
  📄 src/auth/jwt.ts          [보기] ← Monaco Editor
  📄 src/auth/refresh.ts
  📄 src/middleware/auth.ts
  📄 tests/auth.test.ts

📁 review/
  📄 review-report.md         [보기]
  📄 static-analysis.json

📁 verify/
  📄 test-results.xml
  📄 coverage-report.html     [보기]
  📄 integration-test.log
```

각 파일 Monaco Editor 로 뷰어 내장.

## 탭 4: 설정

```
┌──────────────────────────────────────┐
│ Pipeline 설정                          │
├──────────────────────────────────────┤
│ Mode: A (Gridge 호스팅)                │
│                                        │
│ Orchestrator 구성:                     │
│ ├ Spec:     ssot-master (Claude Opus) │
│ ├ Code:     be-developer (GPT-4o)     │
│ └ Verify:   qa-verifier (Claude Sonnet)│
│                                        │
│ HITL 설정:                             │
│ ☐ Spec 단계 후 사용자 확인 대기        │
│ ☑ Code 생성 후 리뷰 대기               │
│ ☐ Verify 실패 시 자동 재시도           │
│                                        │
│ 타임아웃:                              │
│ ├ 전체: 30분                          │
│ └ 각 단계: 10분                       │
│                                        │
│ 취소 정책:                              │
│ ☑ 실패 시 자동 롤백                    │
│ ☐ 중간 산출물 즉시 삭제                │
└──────────────────────────────────────┘
```

## 실행 제어 액션

```
┌──────────────────────────────────────────┐
│ [⏸️ 일시 중지]  [⏹️ 중단]  [🔄 재시도]       │
└──────────────────────────────────────────┘
```

### 일시 중지
- 현재 실행 중 단계 완료 후 중단
- `pipeline_runs.status = 'paused'`
- 재개 가능 상태 유지

### 중단
- 즉시 종료 + 중간 산출물 보관 (설정 따라)
- `pipeline_runs.status = 'cancelled'`
- 완료된 단계의 결과는 유지

### 재시도 (실패 시만)
- 실패한 단계부터 재실행
- 또는 처음부터 (옵션)
- Mode 변경 후 재시도 가능

## HITL 일시 중지 (설정 시)

```
┌──────────────────────────────────────────┐
│ 🛑 Spec Orchestrator 완료, 확인 대기     │
│                                            │
│ 생성된 스펙을 검토해주세요:                │
│ [refined-spec.md 보기]                    │
│                                            │
│ 주요 변경:                                 │
│ - 모호성 3건 자동 해결                     │
│ - 의존성 8개 파일 식별                     │
│ - 관련 기존 스펙 2개 참고                  │
│                                            │
│                                            │
│ [계속 진행 →]  [수정 필요 → 재시작]       │
└──────────────────────────────────────────┘
```

## 실시간 갱신

```typescript
supabase.channel(`pipeline_${runId}`)
  .on('postgres_changes', 
    { event: 'UPDATE', schema: 'lucapus', table: 'pipeline_runs', filter: `id=eq.${runId}` },
    (payload) => { updatePipelineView(payload.new); })
  .on('postgres_changes',
    { event: 'INSERT', schema: 'lucapus', table: 'pipeline_logs', filter: `run_id=eq.${runId}` },
    (payload) => { appendLog(payload.new); })
  .subscribe();
```

## 권한

- **Admin/Developer**: 모든 제어
- **Viewer**: 시각화 + 로그 조회만 (제어 버튼 비활성화)

## 참조

- 3 Orchestrator: `orchestrators/CLAUDE.md`
- 4-Plane: `planes/CLAUDE.md`
- 이력 리스트: `screens/pipeline_runs.md`
- 스펙 편집: `screens/spec_workbench.md`
- React Flow 사용: `skills/react-flow/CLAUDE.md`
- Monaco Editor: `skills/claude-api/CLAUDE.md`
- 규칙 D-050~099: `rules/00_index.md`
