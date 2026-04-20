# Wiring / Rule Graph — 규칙 본문

> PW-012 본문. 적합화 규칙 간 관계(requires/depends-on/triggers/serves) 시각화.
> L3 기술 리드 전용. 오케스트레이션 뷰와 설정 > 개발 규칙에 노출.

---

## PW-012 — 규칙 관계 그래프 (SHOULD)

### 목적

적합화 규칙이 **플랫 리스트가 아닌 지식 그래프**임을 시각화.

3계층 온톨로지 (기술 / 도메인 / 패턴) 관계를 L3 가 파악:
- 어떤 규칙이 다른 규칙의 전제인가 (requires)
- 어떤 규칙이 확정되면 자동 추천이 나오는가 (triggers)
- 인프라 규칙이 어떤 기능 규칙을 지원하는가 (serves)

### 접근 범위

- **L3 기술 리드 전용** (PW-005-03 정합)
- L4 는 할당 작업 관련 규칙만
- L2 / L1 / OA 는 규칙 요약만 (관계 그래프 X)

---

## PW-012-01 — 노드 타입 (MUST)

```tsx
type RuleNode = {
  id: string;                            // 'rule-jwt', 'rule-facade', ...
  name: string;                          // "JWT 인증 필수"
  scope: 'org' | 'team' | 'project';
  severity: 'MUST' | 'SHOULD' | 'MAY';
  locked: boolean;                       // 조직 MUST는 true
  layer: string;                         // "core.auth.jwt-basic"
  source: '조직' | '팀' | '프로젝트';
  confidence: 'definite' | 'probable';   // 온톨로지 추천은 probable
  infraServes?: string[];                // 인프라 규칙이 지원하는 레이어
};
```

### 시각 스타일

| 속성 | 스타일 |
|---|---|
| Scope `org` | 🔒 아이콘 + 금색 테두리 |
| Scope `team` | 파란 테두리 |
| Scope `project` | 회색 테두리 |
| Severity `MUST` | 굵은 테두리 2px |
| Severity `SHOULD` | 보통 1.5px |
| Severity `MAY` | 얇은 1px, 점선 |
| Confidence `probable` | 노드 전체 dashed |

---

## PW-012-02 — 엣지 타입 (MUST)

4종 관계:

| 관계 | 방향 | 색상 | 스타일 |
|---|---|---|---|
| `requires` | A → B (A가 B를 필요) | 빨강 | solid 2px |
| `depends-on` | A → B (A가 B에 의존) | 주황 | solid 1.5px |
| `triggers` | A → B (A 확정 시 B 추천) | 초록 | dashed 1.5px |
| `serves` | A → B (A 인프라가 B 기능 지원) | 파랑 | solid 1.5px |

### 라벨

엣지 중간에 관계 이름 작은 텍스트:
```
rule-rtr ──requires──> rule-jwt
rule-rtr ──depends-on──> rule-redis-cache
rule-facade ──triggers──> rule-event-infra
```

### 양방향 관계

- A requires B AND B depends-on A → 겹침 방지로 curved edge

---

## PW-012-03 — 인터랙션 (MUST)

### 노드 클릭

선택된 노드 + 직접 연결된 노드만 강조:
- 나머지 노드/엣지 `opacity: 0.2`
- 강조 노드는 `outline: 2px var(--brand-primary)`
- 하단 패널에 선택 노드의 상세 본문 표시

### 더블 클릭

해당 규칙의 본문 파일로 이동:
- `D-025` 클릭 → `products/lucapus/rules/spec_db_persistence.md § D-025` 내용 모달
- 조직 규칙이면 `/org/rules` 페이지 이동

### 드래그

노드 위치 변경 가능. 저장은 **개인 preference** (브라우저 로컬).

### 우클릭 컨텍스트 메뉴

- `관련 규칙 추가하기` → 온톨로지 추천 카드 생성 (L3 → 적합화 탭으로 이동)
- `이 규칙 폐기` → 확인 모달 + 감사 로그

---

## PW-012-04 — 상속 출처 라벨 (MUST)

G-043 / 03_hierarchy § 2 정합:

| 출처 | 라벨 | 시각 |
|---|---|---|
| 🔒 조직 | "ORG" | 금색 배지 좌측 |
| 팀 | "TEAM: Platform팀" | 파란 배지 |
| 프로젝트 | "PROJ" | 회색 배지 |

조직 MUST는 **🔒 자물쇠 아이콘** + 호버 툴팁:
```
조직 규칙 (MUST — 해제 불가)
추가: OA 김영희 (2026-02-15)
영향 범위: 전 팀 8개 프로젝트
```

---

## PW-012-05 — 네트워크 통계 오버레이 (SHOULD)

그릿지 네트워크(크로스 고객사 익명 통계) 기반:

### 노드에 표시

```
┌──────────────┐
│ JWT 인증 필수 │
│ MUST · 🔒    │
│              │
│ 340 프로젝트 │    ← 추가 텍스트
│ 94% 적용     │    ← 네트워크 통계
└──────────────┘
```

### 미설정 감지

연관된 규칙이 아직 내 프로젝트에 없을 때:
```
💡 이 규칙 확정 시 함께 고려되는 규칙 (87%):
  - rule-refresh-token
  - rule-token-blacklist
  → [온톨로지 추천으로 보기]
```

L3 클릭 시 적합화 탭 온톨로지 카드로 이동.

### Mode B 고객은 제외 (G-087-02)

Mode B 고객의 경우:
- **수혜는 받음**: 통계 표시 가능
- **기여는 안 함**: 본인 규칙이 통계 소스 X (opt-in 제외)

UI 구별 표시:
```
Mode B: 네트워크 데이터 수신 중 (opt-out)
```

---

## PW-012-06 — 레이아웃 알고리즘 (SHOULD)

### 초기 레이아웃

- **Dagre** (방향성 그래프) 기본
- 조직 규칙 → 팀 규칙 → 프로젝트 규칙 순 (상속 방향)
- 같은 scope 내에서는 layer 그룹핑

### 대체 옵션

- **Force-directed**: 관계 밀도에 따라 유사 규칙 모음
- **Circular**: 소수 규칙 (< 20개) 일 때 원형

L3 가 상단 툴바에서 전환 가능.

---

## PW-012-07 — 필터 & 검색 (MUST)

### 필터 옵션

- Scope: 조직 / 팀 / 프로젝트
- Severity: MUST / SHOULD / MAY
- Layer: `core.auth.*` / `core.shared.*` / `domain.*`
- Confidence: definite / probable
- 상태: 적용됨 / 미적용 / 충돌 감지

### 검색

- 규칙 이름 부분 일치
- Layer 경로 검색 (`core.auth` → 하위 전부)
- 결과 외 노드 opacity 감소

---

## PW-012-08 — 충돌 감지 (OA 뷰와 교차, SHOULD)

같은 layer 에 여러 severity 가 감지되면 노드에 ⚠ 표시:

```
⚠ rule-retry-policy
  Backend팀: MUST (3회 재시도)
  Platform팀: SHOULD (재시도 안 함 허용)

  [OA 통합 제안]
```

OA / L1 의 조직 대시보드와도 연결 (`/org/dashboard`).

---

## PW-012-09 — 성능 (SHOULD)

### 노드 수 임계치

- ~100개: 기본 Dagre 레이아웃 OK
- 100~500개: Virtualization (보이는 영역만 렌더)
- 500+: 레이어 필터 강제 (자동 `core.*` 만 표시, 사용자가 확장)

### React Flow 최적화

```tsx
<ReactFlow
  nodes={visibleNodes}
  edges={visibleEdges}
  nodesDraggable
  nodesConnectable={false}    // 사용자가 임의로 관계 추가 불가
  edgesUpdatable={false}
  onNodeClick={handleNodeClick}
  fitView
  maxZoom={2}
  minZoom={0.3}
/>
```

---

## PW-012-10 — 접근성 (SHOULD)

G-135 정합:

- 키보드 네비: Tab → 노드 순환, Enter → 선택
- `aria-label`: "JWT 인증 필수 규칙, 조직 MUST, 다른 규칙 3개 연결됨"
- 색상 외 의미 전달: 엣지 화살표에 라벨 텍스트 병기
- 스크린 리더: 노드 선택 시 상세 본문 읽기

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] L2 / L1 / OA 뷰에서 규칙 관계 그래프 접근 가능 (PW-005-02 위반)?
- [ ] 조직 MUST 규칙이 🔒 없이 표시?
- [ ] Mode B 고객 규칙이 네트워크 통계 소스로 사용 (G-087 위반)?
- [ ] 사용자가 엣지 임의로 추가/삭제 가능?
- [ ] 노드 500+ 인데 virtualization / 필터 없음?
- [ ] 외부 노출 금지어 (LucaPus / Paperclip) 포함?
- [ ] aria-label 누락?

---

## 참조

- 위계 × 뷰: `03_hierarchy.md § 5` (G-050)
- 파이프라인 연결: `products/wiring/rules/pipeline_view.md § PW-005-03`
- 조직 규칙 상속: `03_hierarchy.md § 2` (G-042)
- 상속 출처 라벨: `03_hierarchy.md § 2` (G-043)
- 온톨로지 원리: `02_architecture.md § 5` (G-025 정합성 7번)
- 크로스 통계 제외: `05_infra_mode.md § 7` (G-087)
- 충돌 감지 (OA 뷰): `products/wiring/rules/pipeline_view.md § PW-005-04`
- React Flow 스킬: `skills/react-flow.md` (작성 예정)
- Dagre 레이아웃: `skills/dagre.md` (작성 예정)
