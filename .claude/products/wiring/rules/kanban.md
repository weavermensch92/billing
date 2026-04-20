# Wiring / Kanban — 규칙 본문

> PW-008 본문. Wiring 칸반 화면의 구조·카드·분기·상호작용 규칙.
> F-003 기능 요구사항의 구현 근거.

---

## PW-008 — 6컬럼 구조 (Stage 3 기준)

```
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ BACKLOG  │   SPEC   │   DEV    │   HITL   │  REVIEW  │   DONE   │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│  대기    │ 스펙분석 │  개발중  │ 결정대기 │ 검증중   │   완료   │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

**컬럼 명칭 고정.** 별칭 사용 금지 (내부 용어 "SPEC" = SSOT 작업 단계 노출 X).

**컬럼 순서 고정.** 변경 시 LucaPus 정합성 원칙 위반 (E0→E5 순서 변경 금지, G-022).

---

## PW-008-01 — Stage 분기 (MUST)

**G-062 연동.** Stage 변경 시 칸반이 다음과 같이 분기:

| Stage | 칸반 노출 | 컬럼 |
|---|---|---|
| 0 모니터링 | ❌ 미표시. 네비에서도 빠짐 | — |
| 1 AI 보조 | ✅ 3컬럼 | `[제안] [검토] [반영]` |
| 2 AI 협업 | ✅ 6컬럼 (AI 모듈만 표시) | 표준 6컬럼, `agent` 필드 있는 것만 |
| 3 AI 주도 | ✅ 6컬럼 (전체) | 표준 6컬럼 |

**구현 전제:** `useAuthStore.stage` 값으로 컴포넌트 자체를 분기. Stage 0에서는 라우터 `/kanban` 접근 시 적합화 탭으로 리다이렉트.

---

## PW-008-02 — 카드 구조

```tsx
<KanbanCard>
  <StatusDot status={item.status} />              {/* 상태 점 */}
  <Title>{item.title}</Title>                     {/* 제목 */}
  <EpicBadge>{item.epic}</EpicBadge>              {/* Epic */}
  <ProgressBar value={item.progress} />           {/* 진행률 (검정 4px) */}
  <AgentBadge agent={item.agent} />               {/* 담당 에이전트 */}
  <SessionBadge mode={mode} session={...} />      {/* 세션 배지 (모드별) */}
  {item.hitl && <HitlBadge type={item.hitl.type} />}  {/* ⚡ HITL */}
  <PriorityBadge level={item.priority} />         {/* 우선순위 */}
  {jiraConnected && <JiraLink id={item.jiraId} />}    {/* Jira 번호 */}
</KanbanCard>
```

**모드별 세션 배지 분기 (G-083 연동):**

| Mode | 세션 배지 표시 |
|---|---|
| A 매니지드 | "Claude Max" / "GPT Pro" (상품명) |
| B 온프레미스 | "vLLM Llama-3" / "Ollama CodeLlama" (모델명) |
| C 고객 API | "Claude Sonnet 4" / "GPT-4o" (모델명) |

---

## PW-008-03 — 상단 요약 바

```
TOTAL 48 | ⚡ HITL 3 | DEV 12 | DONE 20 | [모드별 비용]
```

**모드별 비용 분기 (G-082 연동):**

| Mode | 비용 표시 |
|---|---|
| A | `오늘 485 tk | 잔여 8,420 tk` |
| B | 비용 미표시 (또는 `오늘 2.4 CPU시간`) |
| C | `오늘 $12.40` |

---

## PW-008-04 — HITL 필터 (위계별) ★

위계별 노출 가능 필터 옵션:

| 위계 | 필터 옵션 |
|---|---|
| OA | HITL 필터 **없음** (대시보드 집계만) |
| L1 | HITL 필터 **없음** (대시보드 집계만) |
| L2 PM | 🔶 비즈니스 결정 (`policy_confirm`) 만 |
| L3 기술 리드 | 🔷 기술 결정 + 🔶 코드 패턴 + 🔗 온톨로지 추천 |
| L4 개발자 | 🔶 본인이 제출한 코드 패턴만 |

**구현 원칙 (G-052):**
- 서버 액션이 `user.level` 확인 후 **허용된 `nodeTypes`만** 내려보냄
- 클라이언트는 받은 `allowedTypes`를 그대로 렌더링
- `if (level === "L2") hideTechCard()` 같은 클라이언트 조건 분기 **금지**

**필터 상태 저장:** URL 쿼리스트링 (공유 가능성 우선, G-052 정합)
- 예: `/kanban?hitl=tech_decision,code_pattern`

**필터 적용 범위:**
- 필터가 선택되면 해당 `nodeTypes`의 HITL 카드만 HITL 컬럼에 표시
- 필터 없음 = 전체 표시 (기본값)
- 필터 있어도 HITL 이외 컬럼(BACKLOG/SPEC/DEV/REVIEW/DONE)은 영향 없음

---

## PW-008-05 — 아이템 상세 6섹션

카드 클릭 → 사이드 패널 또는 모달로 상세 6섹션 표시:

1. **헤더**: ID, 제목, 상태/우선순위(L2+ 드롭다운, Jira 싱크), Epic, 일정, 담당, 의존
2. **AI 요약 브리핑**: 자동 생성. 포함 범위(엔티티/API/정책 수) + 현재 진행 단계 체크리스트
3. **산출물**: SSOT/개발/검증 3그룹. `[미리보기]` (PM 언어) / `[diff 보기]` (코드, L3만 원본)
4. **활동 로그**: 이 아이템 필터. 6유형 로그 + 세션 배지. PM 댓글 입력 (AI에 안 감)
5. **하위 작업**: B1~B6 (도메인~검증). 상태 ✅🔄⏳. `[파이프라인에서 보기 →]`
6. **연관**: 선행/후행, Git 브랜치, HITL 이력, 비용 (모드별)

---

## PW-008-06 — HITL 카드 → 적합화 탭 링크 (MUST)

HITL 컬럼의 ⚡ 카드를 클릭하면 **"적합화에서 결정하기 →"** 링크 표시.

```tsx
{item.hitl && (
  <Link href={`/adapt/${item.hitl.cardId}`}>
    적합화에서 결정하기 →
  </Link>
)}
```

**원칙:** 칸반 카드에서 직접 결정 내리지 않음. 적합화 탭에서 6단계 자동 처리(G-101) 경유.

예외: 단순 결정(2지선다)은 칸반 인라인 허용 + "규칙 저장됨" 토스트.

---

## PW-008-07 — 위계별 뷰 (P1 우선순위)

| 위계 | 칸반 뷰 |
|---|---|
| L1 | 대시보드 (완료율, 비용) — 개별 카드 미표시 |
| L2 PM | 표준 6컬럼 |
| L3 기술 리드 | 9컬럼 확장뷰 (SPEC 세분화 + REVIEW 세분화) |
| L4 개발자 | 4컬럼 (내 작업만) `[할당] [작업중] [리뷰대기] [완료]` |

---

## PW-008-08 — Org Admin 크로스 프로젝트 뷰 (P1)

OA는 `/org-admin/kanban` 에서 팀별 + 프로젝트별 집계 대시보드.
개별 카드 접근은 해당 프로젝트 페이지로 이동.

---

## 성능 요구사항 (07_PRD § 5)

- 칸반 로딩: 100 아이템 기준 2초 이내
- 카드 드래그: 60fps 유지
- 실시간 업데이트: WebSocket ≤ 1초 지연

---

## Zustand 스토어 연동

```typescript
// useItemStore.ts
interface ItemStore {
  items: KanbanItem[];
  allowedHitlTypes: HitlNodeType[]; // 서버에서 받음
  filter: HitlFilter;
  // actions
  setFilter: (filter: HitlFilter) => void;
  applyServerResponse: (res: ServerResponse) => void;
}
```

**서버 응답에서 `allowedHitlTypes`를 받고 Zustand에 저장.**
`HitlFilterBar`는 이 값만 읽고 렌더링.

---

## 자동 검증 체크리스트 (F 체인 § 4.3)

체인 실행 중 이 규칙 위반 감지 시 Conflict:

- [ ] 컬럼 순서가 표준 순서와 다른가? → MUST 위반
- [ ] 컬럼 명칭에 내부 용어 (SSOT, SPEC 축약) 노출? → G-004 위반
- [ ] Stage 0에서 칸반 라우터 접근 가능? → G-062 위반
- [ ] HITL 필터가 클라이언트 조건 분기로 구현되고 있는가? → G-052 위반
- [ ] L2에게 `tech_decision` 필터 옵션이 노출되고 있는가? → G-103 위반
- [ ] 모드별 세션 배지 / 비용 분기 누락? → G-082/083 위반
- [ ] 에이전트 모델 직접 변경 드롭다운 추가? → G-025 위반

---

## 참조

- 6컬럼 PRD 근거: `07_PRD.md F-003`
- HITL 카드 유형: `rules/06_hitl.md § 2`
- 위계별 필터 원칙: `rules/03_hierarchy.md § 3.2`
- 서버 필터링 원칙: `rules/03_hierarchy.md § 9`
- 모드별 분기: `rules/05_infra_mode.md` (작성 예정)
- Stage별 분기: `rules/04_stage.md` (작성 예정)
- 데모 시나리오: `screens/demo.md`
