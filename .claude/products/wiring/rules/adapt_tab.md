# Wiring / Adapt Tab — 규칙 본문

> PW-006, PW-007 본문. Wiring의 ★핵심 화면인 적합화 탭의 구조·카드·분기·상호작용 규칙.
> F-002 기능 요구사항의 구현 근거. **제품의 KPI가 여기서 발생.**

---

## PW-006 — 카드 아이콘 분기 (MUST)

적합화 탭의 카드는 **4유형, 3아이콘.** 아이콘/색상 뒤바뀜 절대 금지:

| 유형 | 아이콘 | 좌측 바 | 담당 | 근거 |
|---|---|---|---|---|
| **비즈니스 결정** | 🔶 | 주황 3px **실선** | L2 PM | G-104 |
| **기술 결정** | 🔷 | 파랑 3px **실선** | L3 기술 리드 | G-103 |
| **코드 패턴 승격** | 🔶 | 주황 3px **실선** | L3 (L4 제출) | G-103 |
| **온톨로지 추천** | 🔗 | 파랑 3px **점선** | L3 | G-105 |

**실선 vs 점선 구분:** 실선 = 처리 요청. 점선 = 추천 (강제 아님, 선택적). 
코드 패턴은 감지된 반복 수정 = 주황(비즈니스와 같은 "선택" 느낌).
기술 결정과 온톨로지는 둘 다 파랑(기술 영역)이지만 강제성 차이로 실선/점선 구분.

---

## PW-007 — 위계별 탭 노출 필터 (MUST)

**같은 화면, 다른 카드.** 로그인 역할에 따라 보이는 카드가 다름.

| 위계 | 보이는 카드 | 처리량 비율 |
|---|---|---|
| **OA** | 없음. 조직 규칙 통계 + 팀 간 충돌 알림만 표시 | 0% |
| **L1** | 없음. 대시보드 집계만 | 0% |
| **L2 PM** | 🔶 비즈니스만 | ~10% |
| **L3 기술 리드** | 🔷 기술 + 🔶 코드 패턴 + 🔗 온톨로지 | ~70% |
| **L4 개발자** | 본인이 제출한 🔶 코드 패턴만 | ~20% |

**구현 원칙 (G-052):**
- 서버 API가 `user.level` 확인 후 허용된 카드만 응답
- 클라이언트 조건 분기로 숨기지 않음
- 위계 강등 즉시 반영 (WebSocket 권한 이벤트 구독)

**L3 → L2 전환 데모 시 시각적 효과:**
- L3 로그인: 5개 카드 표시 (기술 2 + 패턴 1 + 온톨로지 2)
- L2로 전환: 3개 카드 사라지고 비즈니스 2개만 남음
- 이 전환이 제품 데모의 핵심 증명 포인트

---

## PW-006-01 — 적합화 탭 상단 KPI

```
┌─────────────────────────────────────────────────────────┐
│ 우리 팀의 AI가 학습한 것: 76개 규칙                      │
│ ████████████████████░░░ 82%                            │
│                                                          │
│ AI 코드 수정률: 38% → 12% (적합화 후 3주)               │
└─────────────────────────────────────────────────────────┘
```

**두 숫자가 제품 KPI:**
- **적합화 점수** = AI가 스스로 판단 가능한 비율 (올라갈수록 좋음)
- **AI 코드 수정률** = AI 코드 중 사람이 손댄 비율 (내려갈수록 좋음)

**설명 텍스트 필수 병기** (데모 전환 포인트):
- "AI가 스스로 판단 가능한 비율"
- "AI 코드 중 사람이 손댄 비율"

---

## PW-006-02 — "결정 필요" 리스트 구조

```
결정 필요 (5건)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│ 🔶 환불 시 사용된 포인트를 복원할까요?         L2
│   근거: 기획서 p.42 MUST. cafe24=복원, sixshop=미복원
│   [복원한다] [복원 안 한다] [조건부]
├──────────────────────────────────────────────
│ 🔷 PointUsage.consume() 낙관적 vs 비관적 락?   L3
│   참조: spec-common D-025
│   AI 권장: 낙관적 락 (신뢰도 74%)
│   [낙관적 락] [비관적 락] [다른 방법 제안]
├──────────────────────────────────────────────
│ 🔶 @Builder 패턴 승격  ⚠ 패턴 감지 4회       L3
│   참조: PT-001, PT-002, PT-003, CP-001
│   AI 초안: "모든 JPA 엔티티에 @Builder" (MUST)
│   [규칙 승격] [초안 수정] [기각] [보류]
├──────────────────────────────────────────────
│ 🔗 Facade 확정 관련 규칙 2건                   L3
│   (점선 파랑) "92% 네트워크 채택"
│   ☑ @Transactional 필수
│   ☑ DomainEvent 발행
│   [함께 확정] [개별 검토] [지금은 안 함]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

각 카드 필수 요소는 `06_hitl.md § 2.2~2.5` 참조.

---

## PW-006-03 — 승인 시 6단계 자동 처리 (G-101)

카드 옵션 버튼 클릭 시 **반드시** 6단계 전부 수행:

```
1. 적합화 큐에서 카드 제거
2. 관련 아이템 진행 (HITL 해제)
3. spec-common.yaml 또는 rules.md 업데이트
4. 확정 규칙 타임라인에 기록
5. 감사 로그 immutable 기록 (G-141)
6. 토스트 알림 + 연관 카드 자동 갱신 (온톨로지 연쇄 추천 등)
```

**6단계 중 하나라도 누락된 UI는 HITL이 아니다.** 단순 버튼이다.

TypeScript 구현 예:
```typescript
async function resolveDecision(
  cardId: string,
  choice: string,
  session: Session,
) {
  await removeFromQueue(cardId);              // 1
  await advanceItem(cardId);                  // 2
  await updateRuleFile(cardId, choice);       // 3
  await appendRuleTimeline(cardId, choice);   // 4
  await logAudit(session, cardId, choice);    // 5
  await notifyAndRefresh(cardId);             // 6
}
```

---

## PW-006-04 — 확정 규칙 타임라인

탭 하단에 시간순 그룹:

```
오늘 (2026-04-18)
  ✅ "적립률 1~5%" (MUST) 김PM 10:02
  ✅ "Facade 이벤트 발행" (MUST) 이시니어 10:33

어제
  ✅ "CompensationChain" (MUST) 큐 승격 16:20
  ❌ "JSON→XML" (기각) 특수 케이스 11:00

이번 주
  +8건 확정 | 1건 기각
```

각 항목 클릭 → 감사 로그 상세 표시 (변경 불가 immutable).

---

## PW-006-05 — 적합화 현황 (최하단)

카테고리별 규칙 수 바 차트 + MUST/SHOULD/MAY 분포.

```
카테고리         MUST SHOULD MAY
━━━━━━━━━━━━━━━━━━━━━━━━━━
설계 패턴         8    5     2
DB/영속성         6    4     3
API 규약          3    3     2
보안              11   0     0   ← 보안은 전부 MUST
HITL              2    0     0
테스트            2    6     0
```

---

## PW-006-06 — "조건부 (직접 입력)" 처리

비즈니스 카드의 세 번째 옵션. 자연어 입력 → AI 구조화 → 확인 모달:

```
[조건부] 클릭
  ↓
┌─────────────────────────────────────────┐
│ 조건을 자연어로 설명해 주세요           │
│ ┌─────────────────────────────────────┐ │
│ │ 주문 취소 시에만 포인트 복원하고,   │ │
│ │ 환불 시에는 복원하지 않음            │ │
│ └─────────────────────────────────────┘ │
│ [취소]  [AI 구조화]                     │
└─────────────────────────────────────────┘
  ↓ AI 구조화
┌─────────────────────────────────────────┐
│ AI가 이렇게 해석했습니다:               │
│                                          │
│ 규칙명: 환불 유형별 포인트 복원         │
│ 강제: MUST                              │
│ 조건:                                    │
│   - 주문 취소 → 포인트 복원 O           │
│   - 환불(상품 반품) → 포인트 복원 X     │
│                                          │
│ [수정] [확정]                           │
└─────────────────────────────────────────┘
```

---

## PW-006-07 — 칸반과의 관계

HITL 카드(칸반 HITL 컬럼의 ⚡ 아이템)는 "적합화에서 결정하기 →" 링크로 이 탭으로 이동.

**카드가 칸반과 적합화 탭 양쪽에 동시 표시.**
- 칸반: 아이템 중심 ("쿠폰 발급 기능이 멈춰있음")
- 적합화: 결정 중심 ("쿠폰 중복 사용 여부")
- 같은 결정을 서로 다른 관점으로 보여줌

---

## PW-007 — 구현 원칙 (서버 필터링)

```typescript
// ❌ 금지 — 클라이언트 분기
function AdaptTab() {
  const level = useAuthStore(s => s.level);
  const cards = useAllCards();
  return cards
    .filter(c => {
      if (level === 'L2') return c.type === 'policy_confirm';
      if (level === 'L3') return c.type !== 'policy_confirm';
      return false;
    })
    .map(c => <Card {...c} />);
}

// ✅ 올바름 — 서버 필터링
async function AdaptTabServer() {
  const session = await getSession();
  const cards = await getAllowedAdaptCards(session); // 서버 함수
  return <AdaptTabClient cards={cards} />;
}
```

서버 함수 내부:
```typescript
async function getAllowedAdaptCards(session: Session) {
  const allowedTypes = ALLOWED_NODE_TYPES_BY_LEVEL[session.level];
  return db.query(
    'SELECT * FROM adapt_queue WHERE type = ANY($1) AND project_id = $2',
    [allowedTypes, session.projectId]
  );
}
```

---

## PW-006-08 — Stage별 동작 (G-061)

**Stage 0에서도 적합화 탭은 동작한다.** 이것이 핵심.

| Stage | 적합화 탭 동작 | 결정 소스 |
|---|---|---|
| 0 모니터링 | ✅ 동작 | 코드베이스 분석 결과 (AI 제안) |
| 1 AI 보조 | ✅ 동작 | 0 + AI 코드 제안 검토 |
| 2 AI 협업 | ✅ 동작 | 0~1 + AI 모듈 결과 검증 |
| 3 AI 주도 | ✅ 동작 | 0~2 + 풀 파이프라인 결정 |

Stage 0 고객도 제품 핵심 가치(적합화 = 규칙 누적)를 체감할 수 있는 이유.

---

## PW-006-09 — 온톨로지 점선 카드 특수 규칙 (G-105)

온톨로지 추천 카드(🔗)는:
1. **자동 적용 금지** — 92% 채택도 수동 확정 필요
2. **Mode B 제외** — 온프레 고객은 크로스 통계 참여 안 함 (opt-in 예외)
3. **3 시점 작동** — 초기 온보딩 / 진행 중 연쇄 / 크로스 도메인 진입

좌측 바를 **반드시 점선으로** 렌더링 — 실선과 시각적 구별.

```css
.adapt-card.ontology {
  border-left: 3px dashed var(--color-blue);
}
.adapt-card.business {
  border-left: 3px solid var(--color-orange);
}
.adapt-card.technical {
  border-left: 3px solid var(--color-blue);
}
.adapt-card.code-pattern {
  border-left: 3px solid var(--color-orange);
}
```

---

## 자동 검증 체크리스트

- [ ] 🔶🔷🔗 아이콘이 유형과 정확히 매칭되는가?
- [ ] 점선이 온톨로지(🔗)에만 적용되는가?
- [ ] L2에게 `tech_decision`/`code_pattern`/`ontology_recommend` 카드가 노출되고 있지 않은가?
- [ ] 서버 필터링이 아닌 클라이언트 조건 분기로 구현되고 있지 않은가?
- [ ] G-101 6단계 자동 처리 중 누락된 단계 없는가?
- [ ] 온톨로지 추천이 자동 적용되고 있지 않은가?
- [ ] 확정 규칙 타임라인에 감사 로그 링크가 연결되어 있는가?
- [ ] Stage 0에서도 적합화 탭이 동작하는가?

---

## 참조

- HITL 노드 4종: `rules/06_hitl.md § 2`
- 위계별 라우팅: `rules/03_hierarchy.md § 3`
- 온톨로지 작동: `rules/06_hitl.md § 4`
- 칸반 연동: `products/wiring/rules/kanban.md § PW-008-06`
- 감사 로그 포맷: `rules/08_security.md` (작성 예정)
- 데이터 모델: `products/wiring/schemas/tables/adapt_queue.md`, `rules.md`
