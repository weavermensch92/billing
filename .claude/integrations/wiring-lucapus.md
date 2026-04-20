# Integrations / Wiring ↔ LucaPus — 규칙 본문

> I-002 본문. Wiring (UI) 과 LucaPus (엔진) 간 적합화 데이터 양방향 동기화.
> **가장 중요한 연동** — 두 제품은 사실상 단일 시스템처럼 작동해야 함.

---

## I-002 — Wiring ↔ LucaPus 양방향 동기 (MUST)

### 핵심 원칙

**"어디서 수정하든 양쪽에 즉시 반영."**

- Wiring 적합화 탭에서 결정 → LucaPus spec-common 업데이트
- LucaPus 가 생성한 HITL → Wiring 적합화 탭에 카드 표시
- CLI (`gridge adapt resolve`) 에서 결정 → 웹 UI 에도 즉시 반영

---

## I-002-01 — 데이터 동기 대상 (MUST)

| 데이터 | 출처 | 대상 | 방향 |
|---|---|---|---|
| HITL 카드 생성 | LucaPus (SSOT/Tech Leader) | Wiring `hitl_cards` | LucaPus → Wiring |
| HITL 결정 | Wiring UI / CLI | LucaPus spec-common | Wiring → LucaPus |
| 확정 규칙 | Wiring `rule_timeline` | LucaPus spec-common.yaml | Wiring → LucaPus |
| 코드 패턴 감지 | LucaPus (PL-009) | Wiring `hitl_cards` | LucaPus → Wiring |
| 온톨로지 추천 | LucaPus (PL-007) | Wiring `hitl_cards` (점선) | LucaPus → Wiring |
| 재설계 요청 | Wiring UI (L3) | LucaPus 하네스 | Wiring → LucaPus |
| 배정 결과 | LucaPus 하네스 | Wiring 파이프라인 노드 | LucaPus → Wiring |
| R1~R7 진행 상태 | LucaPus SSOT Master | Wiring 기획서 분석 화면 | LucaPus → Wiring |
| Gate 결과 | LucaPus (PL-005) | Wiring 실시간 로그 | LucaPus → Wiring |
| 적합화 점수 | LucaPus (PL-008) | Wiring 적합화 탭 상단 | LucaPus → Wiring |

---

## I-002-02 — 이벤트 버스 (MUST)

### 구조

```
LucaPus ── Event Bus (Redis Streams / NATS) ── Wiring
```

### 이벤트 타입 (LucaPus → Wiring)

```typescript
type LucaPusToWiringEvent =
  | { type: 'hitl.created'; card: HitlCard }
  | { type: 'hitl.updated'; card_id: string; patch: Partial<HitlCard> }
  | { type: 'rule.added'; rule: RuleTimelineEntry }
  | { type: 'pattern.detected'; pattern: PatternDetection }
  | { type: 'ontology.recommendation'; recommendations: Recommendation[] }
  | { type: 'r_stage.progress'; project_id: string; stage: 'R1'|'R2'|'R3'|'R4'|'R5'|'R6'|'R7'; status: 'pending'|'processing'|'done' }
  | { type: 'gate.result'; pr_id: string; tier: 1|2|3|4; verdict: string }
  | { type: 'harness.assignment'; agent_id: string; model: string; reason: string }
  | { type: 'adapt_score.updated'; project_id: string; score: AdaptScore };
```

### 이벤트 타입 (Wiring → LucaPus)

```typescript
type WiringToLucaPusEvent =
  | { type: 'hitl.resolved'; card_id: string; option_id: string; resolved_by: string; aligned_with_ai: boolean }
  | { type: 'rule.retired'; rule_id: string; retired_by: string; reason: string }
  | { type: 'harness.redesign_request'; agent_id: string; request: string; requester: string }
  | { type: 'org_must.added'; rule: RuleTimelineEntry }
  | { type: 'project.stage_changed'; project_id: string; new_stage: 0|1|2|3 }
  | { type: 'spec_analysis.trigger'; project_id: string; document: string };
```

---

## I-002-03 — HITL 결정 반영 흐름 (MUST)

```
사용자 Wiring 적합화 탭에서 [옵션 A 선택]
  ↓
Wiring 서버: hitl_cards.status = 'resolved', resolved_option_id = 'A'
  ↓
LucaPus 에 이벤트 전달: { type: 'hitl.resolved', ... }
  ↓
LucaPus 처리:
  1. spec-common 업데이트:
     - 조직 MUST 규칙 → 전역 spec-common.yaml
     - 프로젝트 규칙 → .gridge/policy/overrides.yaml
  2. 영향 범위 재계산:
     - architecture.md 재생성 큐
     - 관련 아이템 상태 변경
  3. 온톨로지 연쇄 추천:
     - PL-007 triggers 관계 조회
     - 추가 추천 카드 생성
  ↓
Wiring 에 피드백 이벤트:
  - rule.added (확정 규칙)
  - ontology.recommendation (연쇄 추천)
  ↓
사용자 UI:
  - 확정 규칙 타임라인 업데이트
  - 🔗 점선 카드 "관련 규칙 2건 함께 확정?" 표시
```

---

## I-002-04 — 정합성 추적 (G-109 정합)

HITL 결정 이벤트에는 정합성 필드 필수:

```typescript
{
  type: 'hitl.resolved',
  card_id: '...',
  option_id: 'A',
  ai_recommendation: 'A',       // AI 가 추천한 옵션
  aligned_with_ai: true,         // 일치 여부
  ai_confidence: 87,             // AI 신뢰도
  resolution_duration_sec: 142,  // 카드 생성~결정 시간
  resolved_by: { user_id, level, source: 'web_ui' | 'cli' | 'slack' }
}
```

### 저장 위치

- Wiring: `audit_logs` + `hitl_cards.aligned_with_ai` 필드
- LucaPus: 온톨로지 학습 데이터로 축적

---

## I-002-05 — CLI 와 웹 UI 실시간 동기 (MUST)

두 경로 중 하나에서 적합화 결정 → 상대 쪽도 즉시 반영:

### 시나리오: CLI 에서 결정

```bash
$ gridge adapt resolve TK-003 --option A
✅ TK-003 결정 완료
```

↓ LucaPus CLI → Wiring API 경유 → 동일 `hitl_cards.id` 업데이트

↓ WebSocket push → Wiring 웹 UI 에서 해당 카드 사라짐

### 시나리오: 웹 UI 에서 결정

웹 [결정] 클릭 → Wiring API → LucaPus 이벤트 → CLI 가 polling / watch 모드면 갱신.

---

## I-002-06 — 규칙 상속 동기화 (MUST, G-042 정합)

### 조직 MUST 추가 흐름

```
OA 가 /org/rules 에서 조직 MUST 추가
  ↓
Wiring: rule_timeline (scope=org) insert
  ↓ (트리거)
하위 프로젝트의 rule_timeline 에 상속 row 자동 insert
  ↓
LucaPus 에 이벤트: { type: 'org_must.added', rule: ... }
  ↓
LucaPus spec-common.yaml 전역 업데이트
  ↓
다음 SSOT Master 실행 시 모든 프로젝트가 해당 MUST 반영
```

### 하위에서 해제 금지

- Wiring DB 레벨 RLS 로 차단 (PW-012-04)
- LucaPus 엔진 측도 spec-common 변경 시 org_must 제외 확인

---

## I-002-07 — 실패 대응 (MUST)

### Wiring → LucaPus 전달 실패

- 이벤트 큐 보관 (24h)
- 3회 재시도
- 지속 실패 → Wiring 측에 "엔진 연동 장애" 배너

### LucaPus 크래시 시

- Wiring 은 **정상 작동 계속** (적합화 탭 조회는 가능)
- HITL 결정은 보류 큐에 (LucaPus 복구 후 일괄 재전달)
- 사용자에게 "결정 적용 지연 중" 표시

### 트랜잭션 보장

- Wiring DB + LucaPus 파일 업데이트는 **Eventually Consistent**
- 결정은 Wiring 에서 즉시 확정 (UI 응답성)
- LucaPus 반영은 비동기 (최대 10초)

---

## I-002-08 — Paperclip 오케스트레이션 연동 (SHOULD)

LucaPus 는 Paperclip 엔진 (Node.js + PostgreSQL) 기반 (01_product § 5 정합).

### 이벤트 포맷

Paperclip 의 event 구조와 호환:
```typescript
interface PaperclipEvent {
  id: string;
  type: string;
  payload: any;
  emitted_at: Date;
  // Gridge 확장 필드
  org_id: string;
  project_id: string;
}
```

### 예약어 금지 (G-004)

Wiring UI 에 `Paperclip` / `voyage` / `IR` 등 내부 용어 절대 노출 금지:
- ✅ "오케스트레이션 엔진" / "AI 엔진"
- ❌ "Paperclip 이벤트"

---

## I-002-09 — 모드별 배포 구성 (MUST)

### Mode A (매니지드)

- Wiring + LucaPus 동일 Gridge 인프라
- 이벤트 버스: 내부 Redis Streams
- 성능 목표: 결정 → 엔진 반영 p50 < 1s

### Mode B (온프레미스)

- Wiring + LucaPus 고객 인프라 (같은 클러스터 권장)
- 이벤트 버스: 고객 내부 (NATS / Kafka / Redis)
- 외부 네트워크 경유 절대 금지

### Mode C (고객 API)

- Wiring (Gridge) + LucaPus (Gridge) + 고객 LLM API
- 이벤트 흐름은 Mode A 와 동일
- LLM 호출 부분만 고객 API 키 사용 (G-088)

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] HITL 결정이 LucaPus 에 반영 안 됨 (이벤트 누락)?
- [ ] 정합성 추적 필드 (aligned_with_ai 등) 누락 (G-109 위반)?
- [ ] 조직 MUST 가 프로젝트에서 해제 가능 (G-042 위반)?
- [ ] Mode B 에서 Gridge 서버 경유 이벤트?
- [ ] LucaPus 장애 시 Wiring 적합화 탭도 다운?
- [ ] CLI 결정이 웹 UI 에 5초+ 지연?
- [ ] Paperclip / voyage / IR 같은 내부 용어 UI 노출?
- [ ] 온톨로지 추천이 HITL 카드 없이 자동 적용 (G-105 위반)?

---

## 참조

- LucaPus 엔진 구조: `02_architecture.md § 1~4`
- HITL 4종 노드: `06_hitl.md § 2` (G-102)
- 정합성 추적: `06_hitl.md § 8` (G-109)
- 온톨로지 추천 강제 금지: `06_hitl.md § 4` (G-105)
- 조직 MUST 상속: `03_hierarchy.md § 2` (G-042)
- Wiring HITL 테이블: `products/wiring/schemas/tables/hitl_cards.md`
- Wiring 규칙 타임라인: `products/wiring/schemas/tables/rule_timeline.md`
- LucaPus spec-common HITL 브릿지: `products/lucapus/rules/spec_hitl.md` (D-051~052)
- LucaPus 온톨로지: `products/lucapus/rules/ontology.md` (PL-007)
- LucaPus CLI: `products/lucapus/rules/cli.md` (PL-006)
- Mode B 격리: `05_infra_mode.md § 7` (G-087)
- 외부 노출 금지: `01_product.md § 4` (G-004)
