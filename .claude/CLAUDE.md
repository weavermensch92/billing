# Gridge AIMSP — Claude Code Harness v0.2

> 이 파일은 **실행 하네스**다. 규칙이 아니라 **실행 엔진**.
> 사용자의 자연어 요청 → 작업 유형 감지 → 실행 체인 자동 분기 → 자동 기록/검증 → 산출물.
> 매 세션 진입 시 자동 로드. 본문 규칙은 `rules/`, `products/`, `integrations/` 에.

---

## 0. 프로젝트 정체성

**그릿지 AIMSP** = 3제품 연동 단일 플랫폼:

| 제품 | 정체 | 배포 |
|---|---|---|
| **AiOPS** | 기업 AI 사용 로그 + 거버넌스 + 코칭 | SaaS (프록시/익스텐션) |
| **LucaPus** | CLI 설치 AI 개발 엔진 (4-Plane + 3 Orchestrators) | 고객 환경 설치 |
| **Wiring AI** | AI 개발팀 가시화 웹 UI (HITL + 파이프라인 + 적합화) | SaaS |

AiOPS는 Wiring 내장 모듈이자 단독 제품. LucaPus는 Wiring의 백엔드 엔진. 상세는 `rules/01_product.md`.

---

## 1. ALWAYS_LOAD (매 세션 자동 로드)

작업 유형과 무관하게 항상 먼저 읽는다:

**메타 규칙 (프로세스/전환)**
- `rules/98_governance.md` — 룰북 거버넌스
- `rules/93_workflow.md` — 개발 프로세스 (브랜치/커밋/PR/리뷰/배포)
- `rules/92_transition.md` — 전환·핸드오프·에스컬레이션
- `rules/99_protocol.md` — 자동 기록 (conflict/knowledge/feedback)
- `rules/90_execution_chain.md` — 실행 체인 7종 (F/R/S/D/V/M/I)

**서비스 규칙**
- `rules/00_index.md` — 규칙 ID 카탈로그 + 자동 로드 트리거
- `rules/01_product.md` — 3제품 정의 + 연동 경계
- `rules/03_hierarchy.md` — OA/L1/L2/L3/L4 권한
- `rules/06_hitl.md` — HITL 설계 원칙

---

## 2. 작업 수신 → 자동 분기 (핵심 엔진)

사용자 요청이 들어오면 Claude Code는 **아래 순서를 절대 건너뛰지 않는다.**

### 2.1 4축 확정 (30초 이내)

| 축 | 값 | 감지 | 불확실 시 |
|---|---|---|---|
| 제품 | AiOPS / LucaPus / Wiring / 연동 | 파일 경로, 키워드 | `/gz-scope product` |
| 모드 | A 매니지드 / B 온프레 / C 고객키 | `.context/config.yml` | `/gz-scope mode` |
| **위계 actor** | OA / L1 / L2 / L3 / L4 (작업 수행자) | 세션 토큰 / `.context/session.yml` | `/gz-scope actor` |
| **위계 target** | OA / L1 / L2 / L3 / L4 (기능 대상자, 복수 가능) | 요청 키워드 ("L2와 L3가 볼 수 있게") | `/gz-scope target` |
| Stage | 0 모니터링 / 1 보조 / 2 협업 / 3 주도 | 작업 범위 + `.context/session.yml` | `/gz-scope stage` |

**actor vs target 구분 중요:**
- **actor** = 권한 체크 대상 (93 § G-211 리뷰어 지정, 92 § G-180 핸드오프 대상)
- **target** = UI 분기 대상 (G-052 서버 필터링 응답 스코프, 03 § 4 매트릭스)
- L3가 작업하면서 L2용 기능을 만들 수 있음 (actor=L3, target=L2)

**4축이 확정 안 되면 코드를 쓰지 않는다.** 추측 금지.

### 2.2 작업 유형 감지 → 실행 체인 분기

사용자 문장에서 아래 키워드/패턴을 감지하여 실행 체인을 선택한다:

| 키워드 / 패턴 | 체인 | 상세 |
|---|---|---|
| "구현", "만들어", "추가", "~화면 개발", "페이지 만들기" | **F** (Feature) | `90_execution_chain.md § F` |
| "리팩토링", "개선", "정리", "분리", "추출" | **R** (Refactoring) | `90_execution_chain.md § R` |
| "스키마", "테이블 추가", "컬럼 변경", "엔티티" | **S** (Schema) | `90_execution_chain.md § S` |
| "버그", "에러", "안 돼", "고장", "수정해줘" | **D** (Debug) | `90_execution_chain.md § D` |
| "검증", "맞는지 확인", "대조", "레퍼런스와 비교" | **V** (Verify) | `90_execution_chain.md § V` |
| "마이그레이션", "이전", "전환", "대량 변경" | **M** (Migration) | `90_execution_chain.md § M` |
| "연동", "~에 연결", "~와 통신", "AiOPS↔Wiring" | **I** (Integration) | `90_execution_chain.md § I` |

**감지 실패 → 사용자에게 체인 직접 선택 요청.** 여러 체인에 해당하면 주 체인 + 부 체인 조합 (예: F+V).

### 2.3 실행 체인에 따른 자동 로드

각 체인이 요구하는 파일을 `90_execution_chain.md` 가 정의한다. Claude Code는 그 지시에 따라 추가 로드.

---

## 3. LOAD_ON_DEMAND (체인 외 선택적 로드)

| 작업이 이것에 관련되면 | 추가 로드 |
|---|---|
| AiOPS (프록시/로그/익스텐션/거버넌스) | `products/aiops/CLAUDE.md` |
| LucaPus (4-Plane/Orchestrator/spec-common) | `products/lucapus/CLAUDE.md` |
| Wiring (칸반/파이프라인/적합화 UI) | `products/wiring/CLAUDE.md` |
| 제품 간 연동 | `integrations/{src}-{dst}.md` |
| 권한/SSO/위계 분기 UI | `rules/03_hierarchy.md` |
| Stage 분기 로직 | `rules/04_stage.md` |
| 모드 분기 (비용/세션 배지) | `rules/05_infra_mode.md` |
| 코딩 표준 | `rules/07_coding_standard.md` |
| 보안/감사/PII | `rules/08_security.md` |
| 프레임워크 문법 | `skills/{tech}/` |

**규칙 ID 참조 시** (`D-025` 등) → `00_index.md` 에서 파일 위치 찾고 **해당 파일만 로드.** 카테고리 전체 금지.

---

## 4. 자동 중단 훅 (`99_protocol.md § Conflict`)

아래 조건 중 하나라도 감지 시 **작업 즉시 중단** + Conflict 파일 생성 + 사용자 고지:

1. **반복 버그** — 같은 트러블슈팅 3회 이상
2. **규칙 충돌** — 사용자 지시가 MUST 규칙 위반 또는 하네스 규칙과 상충
3. **합의 미달** — 방향 합의 없이 3회 이상 번복·조정
4. **정합성 위반** — LucaPus 7원칙 중 하나라도 위반 시도

기록 위치: `.claude/issue/conflicts-YYYY-MM-DD_HH-MM_<요약>.md`
후속: 사용자 결정 → `/gz-send-issue` 로 GitHub Issue 전송.

---

## 4.5 전환·핸드오프 훅 (`92_transition.md`)

Claude Code는 작업 중 아래 판단을 **자동으로** 수행한다. 각 조건 해당 시 명시된 행동 실행.

### 판단 주체 자동 결정
| 결정 유형 감지 | 자동 핸드오프 대상 |
|---|---|
| 비즈니스 정책 (환불/쿠폰/가격) | L2 PM |
| 아키텍처 선택 (패턴/락/분리) | L3 기술 리드 |
| 보안/컴플라이언스 | L3 + OA 공동 |
| DB 마이그레이션 실행 | L4 개발자 |
| 프로덕션 배포 결정 | L3 + OA 공동 |
| 조직 규칙 추가 (MUST) | OA |

상세 매트릭스: `92_transition.md § G-180`.

### 체인 자동 전환
| 현재 체인 | 전환 신호 | 다음 체인 |
|---|---|---|
| F | 기존 코드 중복 3회 | R |
| F | 타 제품 인터페이스 변경 필요 | I |
| F | 스키마 변경 필요 | S → 복귀 F |
| D | 수정 완료 + 재발 방지 요청 | V |
| S | DDL 적용 완료 | F |
| I | 한쪽 스키마 변경 필요 | S |

상세: `92_transition.md § G-183`.

### 에스컬레이션 계단
- 1회 실패 → AI 단독 재시도
- 2회 실패 → 접근법 재고 + 사용자 고지
- 3회 실패 → **Conflict 자동 발동** (§4 참조)
- Conflict 미해결 → L3 호출 → 48h 대기 → OA

### 컨텍스트 포화 자동 대응
| 지표 | 경고 | 강제 분할 |
|---|---|---|
| 로드 파일 수 | 50개 | 70개 |
| 대화 토큰 | 75% | 90% |
| 동일 파일 재read | 5회 | 7회 |

경고 단계에서 사용자에게 세션 분할 제안, 강제 단계에서는 자동 분할 (`92 § G-190~191`).

### 세션 종료 신호 감지
"오늘은 여기까지", "내일 이어서", "저장해줘", "마무리", "끝", "쉬자" 등 감지 시 → `92 § G-195` 종료 절차 실행.

---

## 5. 세션 종료 훅 (자동 학습)

작업이 성공적으로 완료되면 Claude Code가 **사용자 종료 의사를 감지했을 때** 아래를 자동 실행:

1. `/gz-self-improve` — 세션 내 재사용 가능한 결정/패턴을 Knowledge로 추출
2. `.claude/issue/knowledge-YYYY-MM-DD_HH-MM_<주제>.md` 파일(들) 생성
3. 승격 후보 감지 시 `/gz-pattern` 자동 제안
4. 사용자 승인 시 `/gz-send-issue` 로 전송 → 하네스 반영 → npm publish (관리자 권한)

**자동 기록 ≠ 자동 승격.** 파일은 자동 생성되지만 규칙으로의 승격은 항상 사용자 확인.

---

## 6. 절대 규칙 (LucaPus 정합성 7원칙)

모드/Stage/위계 무관 항상 적용. 위반 시도 감지 → 자동 중단 (§4):

1. LucaPus에 없는 에이전트 생성 금지
2. R1→R7 / E0→E5 순서 변경 금지
3. 추론 격리 훼손 금지 (3 Orchestrators만 추론, Executor는 실행만)
4. SSOT Verifier / 4-Tier Gate 우회 금지
5. 사람을 실행자로 표현 금지 (사람=결정자, AI=실행자)
6. 고객이 모델 직접 변경 금지 (하네스 AI가 배정)
7. 온톨로지 추천 자동 적용 금지 (고객 수락/거부)

추가 절대 규칙:
- 규칙 본문 중복 작성 금지 — ID로만 참조
- 파일 500줄 초과 시 분할
- 외부 문서에 내부 용어(LucaPus/하네스/IR/Paperclip) 노출 금지 — `rules/01_product.md § G-004`

---

## 7. 모름 → 질문 우선

훈련 데이터 / 추측으로 채우지 않는다. 순서:

1. 스키마 없음 → `products/*/schemas/INDEX.md` 확인 → 없으면 질문
2. 위계 모호 → `03_hierarchy.md` 원문 인용 + 차이점 질문
3. 기존 결정 불확실 → `.context/rules/` + `.context/issue/knowledge-*.md` 검색
4. 규칙 ID 미등록 → 제안 + 사용자 확인
5. 명령 의도 불명확 → 체인 선택지 제시

**금지:** "아마 이게 맞을 것 같습니다"로 코드 작성.

---

## 8. 커맨드 레퍼런스

| 커맨드 | 용도 | 상세 |
|---|---|---|
| `/gz` | 작업 시작. 4축 확정 → 체인 분기 | `commands/gz.md` |
| `/gz-scope <product\|mode\|level\|stage>` | 단일 축 대화형 확정 | `commands/gz-scope.md` |
| `/gz-spec <ID>` | spec-common / 그릿지 규칙 단건 조회 | `commands/gz-spec.md` |
| `/gz-verify <대상>` | 3중 검증 (공식문서 vs 레퍼런스 vs 구현) | `commands/gz-verify.md` |
| `/gz-impact <변경대상>` | 제품 간 임팩트 분석 (AiOPS↔Wiring↔LucaPus) | `commands/gz-impact.md` |
| `/gz-pattern` | 반복 패턴 → 규칙 승격 후보 등록 | `commands/gz-pattern.md` |
| `/gz-conflict` | Conflict 수동 기록 (자동 감지 외 케이스) | `commands/gz-conflict.md` |
| `/gz-feedback` | 대화형 Feedback 입력 (3단계: 대상/내용/발생상황) | `commands/gz-feedback.md` |
| `/gz-self-improve` | 세션 Knowledge 추출 | `commands/gz-self-improve.md` |
| `/gz-send-issue` | 기록 파일 → GitHub Issue 전송 | `commands/gz-send-issue.md` |
