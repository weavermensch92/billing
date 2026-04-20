# LucaPus / Rules / Ontology — 규칙 본문

> PL-007 본문. 3계층 온톨로지 (기술 / 도메인 / 패턴) 의 구조와 추천 엔진.
> 01_product § 2 / 02_architecture § 5 (정합성 원칙 7번) 의 구현.

---

## PL-007 — 3계층 온톨로지 (MUST)

### 핵심 원칙

**"온톨로지는 LucaPus 데이터 위에 올라가는 추천 레이어. 구조를 변경하지 않는다."**

- 읽기 전용: LucaPus 원본(spec-common.yaml 등) 수정 X
- 추천은 **제안**일 뿐, 자동 적용 절대 금지 (G-025 정합성 7번)
- 적합화 탭의 HITL 카드로만 노출 (점선 🔗 표시)

### 3계층 구조

```
┌─────────────────────────────────────────┐
│ 패턴 온톨로지 (Pattern Ontology)           │  ← 크로스 고객사 통계
│   "이 기술+도메인에서 N%가 이 규칙 선택"   │
├─────────────────────────────────────────┤
│ 도메인 온톨로지 (Domain Ontology)          │  ← R1~R3 Evidence Pack
│   "쇼핑몰 도메인의 개념 간 관계"           │
├─────────────────────────────────────────┤
│ 기술 온톨로지 (Technical Ontology)         │  ← spec-common 105건
│   "JWT requires BCrypt, RTR depends-on…"   │
└─────────────────────────────────────────┘
```

---

## PL-007-01 — 기술 온톨로지 (MUST)

### 데이터 소스

LucaPus 의 **spec-common 105건** 기술 결정.

### 노드 / 엣지

```typescript
type TechOntologyNode = {
  id: string;                        // 'rule-jwt', 'rule-bcrypt', ...
  spec_common_ref: string;           // 'D-025', 'D-091', ...
  category: string;                  // 'auth', 'db', 'event', 'security', ...
  layer: string;                     // 'core.auth.jwt-basic'
  description: string;
};

type TechOntologyEdge =
  | { type: 'requires';    from: string; to: string }
  | { type: 'depends-on';  from: string; to: string; strength: number }  // 0~1
  | { type: 'triggers';    from: string; to: string }
  | { type: 'serves';      from: string; to: string }
  | { type: 'conflicts';   from: string; to: string };
```

### 구축 방법

1. spec-common D-001~105 각 항목의 카테고리 / 레이어 태깅
2. 그릿지 네트워크 7,000명 개발자가 수동 관계 매핑 (requires/depends-on 등)
3. 주기 업데이트 (분기별)

### 예시

```
rule-rtr  ──requires──>  rule-jwt
rule-rtr  ──depends-on──> rule-redis-cache  (strength: 0.7)
rule-jwt  ──triggers───> rule-token-blacklist
rule-bcrypt ──conflicts──> rule-md5-legacy   (레거시 허용 조직에서만)
```

---

## PL-007-02 — 도메인 온톨로지 (SHOULD)

### 데이터 소스

R1~R3 (기획서 분석) 의 **Evidence Pack + 도메인 개념 추출**.

### 노드 / 엣지

```typescript
type DomainOntologyNode = {
  id: string;                        // '포인트', '쿠폰', '주문', ...
  domain: string;                    // 'ecommerce', 'fintech', 'healthcare', ...
  extracted_from: string[];          // 기획서 페이지 참조
};

type DomainOntologyEdge =
  | { type: 'uses';         from: string; to: string }
  | { type: 'affects';      from: string; to: string }
  | { type: 'mutually-exclusive'; from: string; to: string };
```

### 예시 (이커머스 도메인)

```
포인트 ──affects──> 주문 (결제 금액)
포인트 ──affects──> 환불 (복원 여부)
쿠폰 ──mutually-exclusive──> 포인트 (중복 사용 규칙)
주문 ──uses──> 상품
주문 ──uses──> 배송
```

### 구축 방법

- R3 비교 분석 결과 + LLM 자동 추출 + 개발자 네트워크 검증
- 도메인별 템플릿 (이커머스 / 금융 / 의료 / 교육 등)

---

## PL-007-03 — 패턴 온톨로지 (SHOULD)

### 데이터 소스

**크로스 고객사 적합화 통계** (익명화).

### 노드 / 엣지

```typescript
type PatternNode = {
  id: string;                        // 'pattern-auth-ecommerce-jwt-rtr'
  tech_stack: string[];              // ['Spring Boot', 'PostgreSQL', 'Redis']
  domain: string;                    // 'ecommerce'
  usage_count: number;               // 전체 프로젝트 340
};

type PatternEdge = {
  type: 'co-selected';               // 이 기술+도메인에서 함께 선택됨
  from: string;                      // rule-jwt
  to: string;                        // rule-bcrypt
  selection_ratio: number;           // 0.94 (94%)
  sample_size: number;               // 340
};
```

### 예시

```
이커머스 + Spring Boot 프로젝트 (340건):
  rule-jwt 와 rule-bcrypt 함께 선택: 94%
  rule-rtr 와 rule-redis-cache 함께 선택: 87%
  rule-facade 와 rule-event-publish 함께 선택: 82%
```

---

## PL-007-04 — 추천 엔진 3시점 (MUST)

### 1. 초기 온보딩

```
프로젝트 init → 기술 스택 감지 → 도메인 감지
  ↓
기술/도메인 온톨로지 조회 → 관련 규칙 세트 추천
  ↓
"Facade 를 쓰시니까 관련 3건 묶음 추천" 카드
```

### 2. 진행 중 (규칙 확정 시 연쇄)

```
사용자가 rule-jwt 확정
  ↓
기술 온톨로지 조회:
  - requires: rule-bcrypt
  - triggers: rule-token-blacklist
  ↓
패턴 온톨로지 조회:
  - co-selected 94%: rule-bcrypt, rule-rtr
  ↓
"방금 확정과 관련된 미설정 2건" 카드 생성 (🔗 점선)
```

### 3. 크로스 고객사 통계

```
사용자가 결정 망설임
  ↓
"이 도메인 87%가 이 선택" 통계 표시
  ↓
사용자가 참고 후 결정
```

---

## PL-007-05 — Mode B 처리 (MUST, G-087 정합)

### 원칙

Mode B (온프레미스) 고객의 데이터는 **기본적으로 크로스 통계 제외**.

### 수혜 / 기여 분리

| 항목 | Mode A | Mode B (기본) | Mode B (opt-in) | Mode C |
|---|---|---|---|---|
| 추천 수신 | ✅ | ✅ | ✅ | ✅ |
| 통계 기여 | ✅ | ❌ | ✅ (제한적) | ✅ |

Mode B opt-in 조건:
- 완전 익명화 검증
- 고객사명 / 프로젝트명 제거
- OA 명시적 승인 (감사 로그)

### 구현

```typescript
async function contributeToOntology(org: Org, rule: Rule) {
  if (org.infra_mode === 'B' && !org.ontology_opt_in) {
    // Mode B 기본: 기여 안 함
    return;
  }

  // 익명화 후 통계에 반영
  await anonymizedStats.record({
    tech_stack: org.tech_stack,      // 익명화 OK
    domain: org.domain_category,     // 익명화 OK
    rule_id: rule.id,
    // org_id / project_id 는 제외
  });
}
```

---

## PL-007-06 — 온톨로지 저장 (MUST)

### Supabase 테이블 (Sprint 2+)

```sql
CREATE TABLE ontology_nodes (
  id          uuid PRIMARY KEY,
  ontology_layer text CHECK (ontology_layer IN ('tech', 'domain', 'pattern')),
  node_key    text UNIQUE NOT NULL,     -- 'rule-jwt', '포인트', 'pattern-...'
  node_data   jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ontology_edges (
  id          uuid PRIMARY KEY,
  ontology_layer text CHECK (ontology_layer IN ('tech', 'domain', 'pattern')),
  from_key    text NOT NULL,
  to_key      text NOT NULL,
  edge_type   text NOT NULL,             -- 'requires', 'depends-on', 'co-selected', ...
  metadata    jsonb,                     -- {strength, selection_ratio, sample_size}
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ontology_layer, from_key, to_key, edge_type)
);

-- 인덱스
CREATE INDEX idx_ontology_from ON ontology_edges(ontology_layer, from_key);
CREATE INDEX idx_ontology_to ON ontology_edges(ontology_layer, to_key);
```

### 크로스 고객사 분리

ontology_nodes / edges 는 **그릿지 글로벌** 테이블 (org_id 없음).
고객별 스냅샷은 `org_ontology_snapshots` 에 따로 (고객 볼 때 그 시점 값).

---

## PL-007-07 — 추천 트리거 API (MUST)

### Wiring 적합화 탭이 호출

```
POST /api/ontology/recommend
{
  "org_id": "...",
  "project_id": "...",
  "trigger_type": "rule_resolved" | "onboarding" | "user_request",
  "context": {
    "recent_rule_id": "rule-jwt",
    "tech_stack": ["Spring Boot", ...],
    "domain": "ecommerce"
  }
}

응답:
{
  "recommendations": [
    {
      "rule_id": "rule-bcrypt",
      "confidence": "definite",   // definite | probable
      "source_layer": "tech",     // tech | domain | pattern
      "reason": "requires from rule-jwt",
      "network_stat": { "ratio": 0.94, "sample_size": 340 }
    },
    ...
  ]
}
```

### 추천 승인 시 적합화 카드 생성

```
POST /api/hitl/create-from-ontology
{
  "recommendations": [...],
  "user_level": "L3"
}
→ hitl_cards 에 type='ontology_recommend' 카드 N건 생성
```

---

## PL-007-08 — 온톨로지 자동 적용 절대 금지 (MUST, G-025 정합)

정합성 7원칙 7번 위반:

```
❌ 온톨로지가 규칙을 자동으로 rule_timeline 에 추가
❌ [함께 확정] 버튼 없이 백그라운드 반영
❌ HITL 카드 우회
❌ 기본 동의 (opt-out 방식)
```

모든 온톨로지 추천은 **HITL 카드 형태로 사용자 명시 수락 필요** (G-105).

---

## PL-007-09 — 온톨로지 품질 관리 (SHOULD)

### 엣지 품질 평가

```typescript
interface EdgeQuality {
  sample_size: number;               // 통계 기반 엣지
  last_updated: Date;
  user_feedback: {
    accepted: number;                // 수락 수
    rejected: number;                // 거부 수
  };
}
```

거부율 > 50% 시:
- 엣지 품질 경고 (`confidence: 'probable'`)
- 다음 업데이트 때 재검토

### 엣지 업데이트 주기

| 레이어 | 주기 |
|---|---|
| 기술 온톨로지 | 분기별 (수동 검증) |
| 도메인 온톨로지 | 새 도메인 추가 시 |
| 패턴 온톨로지 | 주간 (자동 통계) |

---

## PL-007-10 — 외부 노출 금지 (MUST, G-004)

UI / API 문서에서 사용 금지:

- `spec-common D-001~105` (내부 참조)
- 내부 온톨로지 알고리즘 상세
- 크로스 통계 계산 공식

허용:
- "3계층 온톨로지 지원"
- "그릿지 네트워크 340개 프로젝트 중 94%"
- "관련 규칙 추천"

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] 온톨로지 추천이 `rule_timeline` 에 자동 삽입?
- [ ] HITL 카드 경유 없이 규칙 적용?
- [ ] Mode B opt-out 인 고객의 데이터가 통계 기여?
- [ ] 크로스 통계에 `org_id` / `project_id` 포함 (익명화 실패)?
- [ ] 외부 API 에 `spec-common D-XXX` 참조 노출?
- [ ] 엣지 품질 평가 없이 추천 (sample_size < 20)?
- [ ] LucaPus 원본 spec-common 에 온톨로지가 write?

---

## 참조

- 3계층 온톨로지 원칙: `01_맥락.md § 1` (제품 핵심 가치)
- 정합성 7원칙 7번: `02_architecture.md § 5` (G-025)
- 온톨로지 추천 강제 금지: `06_hitl.md § 4` (G-105)
- Mode B 크로스 통계 제외: `05_infra_mode.md § 7` (G-087)
- Wiring 적합화 탭 UI: `products/wiring/rules/adapt_tab.md`
- Wiring 규칙 그래프: `products/wiring/rules/rule_graph.md` (PW-012)
- HITL 카드 테이블: `products/wiring/schemas/tables/hitl_cards.md`
- 규칙 타임라인 테이블: `products/wiring/schemas/tables/rule_timeline.md`
