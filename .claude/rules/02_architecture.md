# 02_Architecture — 아키텍처 규칙

> LucaPus 엔진의 4-Plane 구조, 3 Orchestrators, 하네스 AI, 정합성 7원칙.
> Wiring AI의 웹 UI가 침범할 수 없는 엔진 영역의 경계.
> 규칙 ID: G-020~G-039.

---

## 1. LucaPus 4-Plane 구조 (G-020)

LucaPus 엔진은 **4개의 수직 레이어(Plane)**로 분리된다. 각 Plane은 서로 다른 Orchestrator의 관할.

```
┌─────────────────────────────────────────────────┐
│  Ops Plane          — 운영/배포/모니터링          │  Executor
├─────────────────────────────────────────────────┤
│  Dev Plane          — 코드 생성/검증/리뷰         │  Executor
├─────────────────────────────────────────────────┤
│  Spec Plane         — 스펙 분석/문서화/다이어그램  │  Orchestrator (SSOT Master)
├─────────────────────────────────────────────────┤
│  Policy Plane       — 정책/규칙/우선순위/스프린트  │  Orchestrator (Scrum / Tech Leader)
└─────────────────────────────────────────────────┘
```

### G-020-01 — Plane 경계 절대 원칙

- Plane 순서 변경 **금지**
- 신규 Plane 추가 **금지** (LucaPus 정합성 원칙 1)
- Plane 간 직접 호출 금지 — 반드시 Orchestrator를 거침
- 하위 Plane이 상위 Plane의 **결정**을 뒤집지 못함 (Executor는 Orchestrator 결정에 따름)

### G-020-02 — Plane별 허용 작업

| Plane | 허용 | 금지 |
|---|---|---|
| Policy | 규칙 추가/수정/폐기, 우선순위 결정, 스프린트 배정 | 코드 수정, 배포 |
| Spec | 기획서 분석, 엔티티 설계, API 설계, 다이어그램 | 구현 코드 작성 |
| Dev | 코드 생성, 테스트, 검증, 리뷰 | 정책 결정, 배포 트리거 |
| Ops | 배포, 모니터링, 롤백 | 코드 수정 |

---

## 2. 3 Orchestrators — 추론 격리 (G-021)

| Orchestrator | 담당 Plane | 역할 | 모드 A/B/C 모델 |
|---|---|---|---|
| **SSOT Master** | Spec | 기획서 → 스펙 구조화, 엔티티/API 설계, 정책 감지, HITL 발생 | Claude Max / vLLM Llama-3 / Claude Sonnet 4 |
| **Scrum Master** | Policy | 스프린트 관리, 진행률 추적, 병목 감지, Kanban 상태 전이 | Claude Max / vLLM Llama-3 / Claude Sonnet 4 |
| **Tech Leader** | Policy (기술) | 기술 결정 HITL 발생, 아키텍처 판단, 코드 패턴 승격 검토 | Claude Max / vLLM Llama-3 / Claude Opus 4 |

### G-021-01 — 추론 격리 절대 원칙

**"추론(reasoning) 능력은 3 Orchestrator만 가진다."**

- SSOT Master / Scrum Master / Tech Leader = **추론 가능**
- BE Developer / FE Developer / QA Verifier / 기타 Executor = **추론 금지**
- Executor는 명시된 작업만 수행 (코드 생성, 파일 작성, 실행)
- Executor가 "판단"해야 할 상황 오면 → 관할 Orchestrator에게 에스컬레이션

### G-021-02 — 위반 감지

코드 리뷰 중 아래 감지 시 Conflict 자동 발동:

- Executor에 "판단하라", "선택하라", "결정하라" 프롬프트
- Executor가 여러 경로 중 하나 선택하는 분기 로직
- Executor가 HITL 카드를 **생성** (Orchestrator만 생성 가능)

---

## 3. Executors — 실행 전담 (G-022)

Executor는 3 Orchestrator 외 모든 에이전트.

| Executor | 역할 | 모드 A/B/C 모델 |
|---|---|---|
| **BE Developer** | 백엔드 코드 생성 | ChatGPT Pro / Ollama CodeLlama / GPT-4o |
| **FE Developer** | 프론트엔드 코드 생성 | ChatGPT Pro / Ollama CodeLlama / GPT-4o |
| **QA Verifier** | 테스트 생성, 검증, 결함 재현 | Claude Max / vLLM Llama-3 / Claude Sonnet 4 |
| **Doc Writer** | 문서 생성, API 레퍼런스 | Claude Max / vLLM Llama-3 / Claude Sonnet 4 |

### G-022-01 — Executor 추가 규칙

- 신규 Executor 추가 가능 (4-Plane 구조 내에서)
- 신규 Orchestrator 추가 **금지**
- Executor 모델 변경은 **하네스 AI**가 결정 (고객 직접 변경 불가)

---

## 4. 하네스 AI (G-023)

모든 에이전트 위에 존재하는 **총괄 레이어.** Plane이 아닌 직교 개념.

### G-023-01 — 하네스 AI의 권한

| 결정 | 하네스가 결정 | 사람이 결정 |
|---|---|---|
| 어떤 에이전트에게 어떤 모델 배정 | ✅ | ❌ |
| 에이전트 간 작업 라우팅 | ✅ | ❌ |
| 컨텍스트 윈도우 분할 | ✅ | ❌ |
| 신규 모델 추가 (org 전체) | ❌ | L3 + OA |
| 하네스 재설계 요청 | 응답 (수락/거부) | L3 요청 |

### G-023-02 — 하네스 재설계

- L3 기술 리드만 요청 가능
- 자연어 입력 → 하네스가 이유 검토 → 수락/거부
- 수락 시 배정 히스토리에 기록 (감사 대상, G-141)
- 거부 시 이유 명시 + 대안 제안

### G-023-03 — 모델 배정 이유 공개

하네스가 각 에이전트에 특정 모델을 배정한 **이유**는 고객에게 공개:

```
BE Developer → ChatGPT Pro
이유: "코드 생성 속도, 추론 불필요"

Tech Leader → Claude Max
이유: "기술 결정, 깊은 추론 필요"
```

이유 공개는 "블랙박스 AI"가 아니라는 신뢰 구축용.

---

## 5. 정합성 7원칙 (G-025) — 절대 불허

LucaPus 정합성을 유지하기 위해 **어떤 모드에서도** 위반할 수 없는 7가지:

| # | 원칙 | 위반 예시 |
|---|---|---|
| 1 | LucaPus에 없는 에이전트 생성 | 신규 "PM Assistant" 에이전트 추가 |
| 2 | R1→R7 / E0→E5 순서 변경 | 스펙 분석을 R3 → R2 순서로 |
| 3 | 추론 격리 훼손 | BE Developer가 기술 결정 직접 수행 |
| 4 | SSOT Verifier / 4-Tier Gate 우회 | 검증 없이 바로 배포 |
| 5 | 사람을 실행자로 표현 | "PM이 쿠폰 로직 구현" UI 문구 |
| 6 | 고객이 모델 직접 변경 | 드롭다운에서 에이전트 모델 선택 가능 |
| 7 | 온톨로지 추천 자동 적용 | "92% 채택률이니 자동 수락" |

**감지 시 즉시 Conflict 발동** (`99_protocol.md § 1 조건 4`).

---

## 6. SSOT Verifier (G-026)

Single Source of Truth Verifier — 스펙과 구현의 일관성 검증.

### G-026-01 — 검증 대상

- 스펙 문서 ↔ 생성 코드 (API 시그니처 일치)
- 엔티티 정의 ↔ DB 스키마
- 기획서 정책 ↔ 비즈니스 로직
- 적합화 규칙 ↔ 코드 준수

### G-026-02 — 검증 단계

```
생성 직후 → SSOT Verifier 자동 실행
  ↓ 불일치 감지
  → Conflict 발동 + 생성 코드 반환 + 재생성 요청
  ↓ 3회 반복
  → 에스컬레이션 (L3)
```

---

## 7. 4-Tier Gate (G-027)

배포 전 4단계 게이트. **모든 게이트 통과**해야 프로덕션 진입.

| Tier | 게이트 | 검증 주체 | 실패 시 |
|---|---|---|---|
| T1 | 정적 분석 (lint, tsc, 타입) | Executor (자동) | 즉시 실패 반환 |
| T2 | 테스트 통과 (단위 + 통합) | QA Verifier | 결함 재현 후 D 체인 |
| T3 | 적합화 규칙 준수 | SSOT Verifier | 규칙 위반 감지 → 수정 |
| T4 | 보안 + 컴플라이언스 (G-140~147) | SSOT Verifier | OA 에스컬레이션 |

### G-027-01 — Gate 우회 금지

- `--skip-gate` 같은 플래그 **존재 금지**
- 긴급 배포라도 4-Tier 전부 통과 필수 (단, 긴급용 단축 모드는 T1/T2만 + T3/T4는 사후 검증)

---

## 8. R1~R7 스펙 분석 순서 (G-028)

SSOT Master가 기획서를 처리하는 고정 순서. **변경 금지**.

| # | 단계 | 내용 | HITL 발생 가능 |
|---|---|---|---|
| R1 | 근거 수집 | 참고 플랫폼(cafe24/sixshop 등) 조사 | ❌ |
| R2 | 관리 범위 | Feature → Sub-feature 트리 | ❌ |
| R3 | 비교 분석 | 플랫폼 간 정책 비교 | ❌ |
| R4 | 시나리오 | BDD 시나리오 도출 | ✅ PM |
| R5 | 데이터 설계 | 엔티티 + 관계도 | ✅ L3 |
| R6 | 규칙 정리 | MUST/SHOULD/MAY 분류 | ❌ |
| R7 | 문서 생성 | 최종 산출물 6~8개 | ❌ |

**`products/wiring/screens/spec_analysis.md` (PW-009)** 에서 UI 매핑.

---

## 9. E0~E5 개발 파이프라인 순서 (G-029)

Tech Leader + Executor 협업 순서. **변경 금지**.

| # | 단계 | 담당 | 산출물 |
|---|---|---|---|
| E0 | 도메인 분석 | Tech Leader | 도메인 경계 정의 |
| E1 | 모듈 설계 | Tech Leader | 모듈 명세 |
| E2 | API 설계 | Tech Leader | 엔드포인트 스펙 |
| E3 | 구현 | Developer Executor | 코드 |
| E4 | 테스트 | QA Verifier | 테스트 코드 + 실행 |
| E5 | 검증 | SSOT Verifier | 4-Tier Gate 통과 기록 |

---

## 10. Plane 간 데이터 흐름 (G-030)

```
 [Policy Plane]
  │  spec-common.yaml (규칙 소스)
  │  rules.md (코딩 하드 게이트)
  ↓
 [Spec Plane]
  │  architecture.md (엔티티/API)
  │  feature-kits/ (기능별 스펙)
  ↓
 [Dev Plane]
  │  src/ (코드)
  │  tests/ (테스트)
  ↓
 [Ops Plane]
     deploy-logs/ (배포 이력)
     incident-logs/ (장애 기록)
```

**역방향 데이터 흐름:**
- 코드 패턴 승격 (Dev → Policy, Tech Leader 경유)
- 배포 실패 → 재설계 트리거 (Ops → Spec)
- 감사 로그 (모든 Plane → immutable store)

---

## 11. Paperclip 오케스트레이션 엔진 (G-031)

LucaPus의 하단 오케스트레이션은 **Paperclip**(MIT, Node.js + PostgreSQL) 기반.

- Paperclip 업스트림 업데이트 주기적 병합 (업스트림이 MIT라 가능)
- Gridge 커스텀: 4-Plane 구조, 3 Orchestrator 패턴, 하네스 AI
- 업스트림 충돌 감지 → `91 § Conflict` 발동 + L3 검토

### G-031-01 — Paperclip 외부 노출 금지

- 파트너 / 고객 / 데모에 **Paperclip 단어 노출 금지** (G-004)
- 대안 표현: "오케스트레이션 엔진" / "그릿지 엔진"

---

## 12. 멀티 LLM 라우팅 (G-032)

하네스 AI가 모델 배정을 결정할 때 **라우팅 우선순위**:

| 기준 | 우선순위 |
|---|---|
| 깊은 추론 필요 | Claude Opus > Claude Max > GPT-4o > Solar Pro > Gemini 2.5 Pro |
| 코드 생성 속도 | GPT-4o > Claude Sonnet 4 > Claude Max > Codestral |
| 검증 / 분석 | Claude Max > Claude Sonnet 4 > GPT-4o |
| 한국어 특화 | Solar Pro > Claude Max > GPT-4o |
| 비용 민감 | Solar Pro / GPT-4o mini / Claude Haiku |

### G-032-01 — 라우팅 우선순위 비공개

라우팅 규칙의 **내부 우선순위는 비공개** (파트너 포함). 노출 범위:
- "멀티 LLM 라우팅 지원" (YES)
- "Claude > GPT > Solar > Gemini 우선순위" (NO)

---

## 13. 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] 4-Plane 외 신규 레이어 추가 시도?
- [ ] Orchestrator 신규 추가 시도?
- [ ] Executor에게 추론 명령?
- [ ] R1~R7 / E0~E5 순서 변경?
- [ ] SSOT Verifier / 4-Tier Gate 우회 시도?
- [ ] 고객 UI에 모델 직접 변경 기능?
- [ ] 정합성 7원칙 중 하나라도 위반?
- [ ] Paperclip / LucaPus / 하네스 같은 내부 용어 외부 노출?

---

## 14. 참조

- LucaPus 제품 상세: `products/lucapus/CLAUDE.md` (작성 예정)
- 4-Plane 경계 상세: `products/lucapus/planes/boundary.md` (PL-001)
- 3 Orchestrators: `products/lucapus/orchestrators/roles.md` (PL-002~003)
- 하네스 AI: `products/lucapus/orchestrators/harness.md` (PL-004)
- SSOT Verifier / 4-Tier Gate: `products/lucapus/rules/gate.md` (PL-005)
- 온톨로지: `products/lucapus/rules/ontology.md` (PL-007)
- 외부 노출 금지어: `01_product.md § 4.2` (G-004)
- HITL과의 관계: `06_hitl.md § 2` (R4/R5 단계 HITL)
