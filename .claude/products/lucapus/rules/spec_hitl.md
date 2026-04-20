# LucaPus / Rules / Spec — HITL 연동 (D-051~D-052)

> spec-common 의 HITL 연동 정의. Executor 가 HITL 상황 감지 시 어떻게 Orchestrator 에게 에스컬레이션하는가.
> 2건뿐이지만 엔진 - HITL 시스템 - 적합화 탭을 잇는 **핵심 브릿지**.

---

## 개요

| 범위 | 항목 수 | 스코프 |
|---|---|---|
| D-051 ~ D-052 | 2건 | mixed (core + Wiring) |

### 연관 규칙

- `06_hitl.md § 1~8` (G-100~G-111): HITL 공통 원칙
- `products/wiring/rules/adapt_tab.md`: UI 구현
- `products/lucapus/orchestrators/roles.md § PL-003`: Executor 추론 금지

---

## D-051 — HITL 노드 자동 생성 규칙

### 본문

Executor 가 작업 중 **모호성 감지 → Orchestrator 에 에스컬레이션 → HITL 카드 생성**.

### 감지 조건 (자동 HITL 트리거)

| 상황 | 생성되는 HITL 타입 |
|---|---|
| 기획서에 명시되지 않은 정책 (환불 포인트 복원 등) | 🔶 비즈니스 (→ L2) |
| 여러 기술 옵션 중 선택 필요 (낙관/비관 락 등) | 🔷 기술 (→ L3) |
| 같은 패턴 3회+ 반복 감지 | 🔶 코드 패턴 (→ L3) |
| 관련 규칙 N% 선택 (네트워크 통계) | 🔗 온톨로지 (→ L3, 점선) |

### 생성 플로우

```
SSOT Master 기획서 분석 (R4 시나리오) → 미명시 정책 감지
  ↓
HITL 카드 데이터 생성:
  - type: 'business'
  - title: "환불 시 포인트 복원 여부"
  - rule_ref: "기획서 p.42: 환불 시 포인트 복원 여부 (MUST)"
  - options: ["복원한다", "복원 안 한다", "조건부"]
  - tradeoff / aiRecommendation (기술 결정일 경우)
  ↓
Scrum Master 가 위계 라우팅 (G-103, G-104)
  ↓
hitl_cards 테이블 insert (Wiring DB)
  ↓
적합화 탭 / 파이프라인 (사람 노드) 양쪽에 반영
```

### 강제 수준

**MUST**.

---

## D-052 — HITL 결과 → LucaPus 반영

### 본문

사용자가 적합화 탭에서 카드 결정 → LucaPus 데이터에 반영.

### 반영 경로

```
사용자 [옵션 A 선택] (Wiring 적합화 탭)
  ↓
PATCH /api/hitl/:id { resolved_option_id: 'A' }
  ↓
Wiring 서버가 rule_timeline 에 규칙 추가 (PW-012 참조)
  ↓
LucaPus 에 이벤트 전송:
  - spec-common 업데이트 (D-025 = 'optimistic_lock')
  - architecture.md 재생성 트리거 (SSOT Master)
  ↓
다음 SSOT Master 실행 시 반영된 값 사용
```

### spec-common 업데이트 원칙 (MUST)

- 조직 MUST 규칙은 **spec-common 전역** 업데이트
- 프로젝트 규칙은 **프로젝트별 override 파일** (`spec-common.yaml` 에 branch)

```yaml
# spec-common.yaml (전역)
D-025:
  concurrency_strategy: pessimistic_lock  # 조직 기본값

# my-project/.gridge/policy/overrides.yaml
D-025:
  concurrency_strategy: optimistic_lock   # 프로젝트 override
```

### 강제 수준

**MUST**.

---

## D-051-01 — HITL 생성 빈도 제한 (SHOULD)

같은 세션에서 동일 사용자에게 **3건 이상 동시 생성 금지** (인지 부하):

```typescript
// Orchestrator 내부 체크
if (pendingCardsForUser(user_id).length >= 3) {
  queueForLater(newCard);  // 기존 카드 해소 후 순차 발송
  return;
}
```

긴급 카드는 예외 (우선순위 `high`).

---

## D-051-02 — HITL 카드 중복 방지 (MUST)

같은 사안에 대한 중복 카드 생성 금지:

```typescript
const existingCard = await findHitlCardByTopic({
  project_id, topic: 'refund-point-restoration', status: 'pending'
});
if (existingCard) {
  // 새 카드 생성 대신 기존 카드의 `context` 업데이트
  await updateHitlCard(existingCard.id, { ... });
  return existingCard;
}
```

---

## D-052-01 — HITL 결정 번복 방지 (MUST, G-042 정합)

이미 resolved 된 카드의 결정을 **번복하려면 새 카드 생성 필요**:

```
❌ 금지: PATCH /hitl/:id { resolved_option_id: 'B' } (이전 'A' 였음)
✅ 올바름: 새 카드 생성 → 이전 결정 "번복" 명시 + 사유 기록
```

### 예외: 편집 모드

결정 직후 1분 이내는 "잘못 눌렀어요" 편집 허용 (idempotent 보정).

---

## D-052-02 — 정합성 추적 (MUST, G-109 연동)

HITL 결과 반영 시 감사 로그에 정합성 필드 포함:

```json
{
  "action": "HITL_resolved",
  "card_id": "...",
  "option_chosen": "A",
  "ai_recommendation": "A",
  "aligned_with_ai": true,
  "resolution_duration_sec": 142,
  "ai_confidence": 87
}
```

- `aligned_with_ai`: 사용자 선택 vs AI 추천 일치 여부
- `resolution_duration_sec`: 카드 생성 ~ 결정까지 시간

이 데이터가 AI 신뢰도 / 사용자 숙련도 학습에 활용.

---

## D-052-03 — LucaPus 재실행 트리거 (SHOULD)

HITL 결정이 architecture / 산출물에 영향 시 자동 재생성:

```
결정: D-025 = 'optimistic_lock'
  ↓
영향 범위 분석:
  - architecture.md 의 동시성 섹션
  - PointService.java 의 락 코드
  - point-domain-diagram.mermaid (락 표시 변경)
  ↓
재생성 큐에 추가 → 다음 Scrum Master 배치에서 실행
```

### 재실행 범위 제한

- 해당 결정의 "영향 범위" 만 (코드베이스 전체 X)
- 사용자 확인 없이 자동 진행 OK (산출물만 영향)
- 코드 수정은 별도 PR (사용자 리뷰 필요)

---

## 카테고리 요약

| ID | 제목 | 강제 |
|---|---|---|
| D-051 | HITL 노드 자동 생성 | MUST |
| D-052 | HITL 결과 → LucaPus 반영 | MUST |

---

## 적합화 프로세스

### 설정 단계

- 조직 정책 설정: "모호성 감지 시 즉시 HITL 생성" vs "1회 재추론 후 HITL"
- 프로젝트별 HITL 우선순위 기준 (high / medium / low)

### 운영 단계

- 대기 중 HITL 카드 4시간 경과 → 우선순위 승격 (G-106)
- 24시간 경과 → admin 에스컬레이션
- 카드 처리율 추적 (Wiring 대시보드)

---

## 자동 검증 체크리스트

- [ ] Executor 가 `createHitlCard()` 직접 호출 (G-022 위반, PL-003-02)?
- [ ] 같은 사안에 중복 카드 생성 (D-051-02 위반)?
- [ ] 사용자당 동시 대기 카드 3개+ (D-051-01 위반)?
- [ ] resolved 카드 번복 허용 (D-052-01 위반)?
- [ ] 정합성 추적 필드 누락 (D-052-02 위반, G-109)?
- [ ] HITL 라우팅이 위계 (L2/L3) 무시?
- [ ] 온톨로지 추천이 직접 rule_timeline 추가 (G-105 위반)?

---

## 참조

- HITL 4종 노드: `06_hitl.md § 2` (G-102)
- 위계 라우팅: `06_hitl.md § 3` (G-103, G-104)
- 온톨로지 추천 강제 금지: `06_hitl.md § 4` (G-105)
- 병목 감지: `06_hitl.md § 5` (G-106)
- 코드 패턴 승격: `06_hitl.md § 6` (G-110)
- 정합성 추적: `06_hitl.md § 8` (G-109)
- HITL 카드 테이블: `products/wiring/schemas/tables/hitl_cards.md`
- 규칙 타임라인 테이블: `products/wiring/schemas/tables/rule_timeline.md`
- Wiring 적합화 탭 UI: `products/wiring/rules/adapt_tab.md`
- Executor 추론 금지: `products/lucapus/orchestrators/roles.md § PL-003`
