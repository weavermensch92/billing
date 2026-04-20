# 00_Index — 규칙 ID 카탈로그 + 자동 로드 트리거

> 규칙 ID가 **어디에 정의되어 있는지**(§1~9) + **어떤 키워드로 자동 로드되는지**(§10) 매핑.
> 본문은 담지 않는다. ALWAYS_LOAD 대상. 규칙 ID 찾을 때 가장 먼저 조회.

---

## 0. ID 네임스페이스 규약

| 접두어 | 범주 | 소속 디렉토리 |
|---|---|---|
| `G-xxx` | 그릿지 공통 규칙 | `rules/` |
| `D-001~D-105` | LucaPus spec-common | `products/lucapus/rules/` |
| `PA-xxx` | AiOPS 제품 전용 | `products/aiops/rules/` |
| `PL-xxx` | LucaPus 전용 (spec-common 외) | `products/lucapus/rules/` |
| `PW-xxx` | Wiring AI 전용 | `products/wiring/rules/` |
| `PB-xxx` | Billing MSP 전용 (Mode D) | `products/billing/rules/` |
| `I-xxx` | 제품 간 연동 | `integrations/` |
| `L-xxx` | LucaPus ↔ 외부 | `integrations/lucapus-external.md` |
| `H-xxx` | 하네스 AI 연동 | `integrations/harness.md` |
| `F-xxx` | Wiring PRD 기능 (참조용) | `products/wiring/screens/` |

**강제 수준:** MUST (하위 해제 불가) / SHOULD (프로젝트 예외 가능) / MAY (권장)

---

## 1. G-xxx : 그릿지 공통

### G-001~G-019 제품/도메인
| ID | 제목 | 강제 | 파일 |
|---|---|---|---|
| G-001 | 3제품 정체성 (AiOPS/LucaPus/Wiring) | MUST | `01_product.md` |
| G-002 | 제품 간 경계와 연동 포인트 (직접 연동 금지, integrations/ 경유) | MUST | `01_product.md` |
| G-003 | AiOPS = Wiring 내장 vs 단독 판매 분기 | MUST | `01_product.md` |
| G-004 | 외부 노출 용어 분기 (금지어 + 대안) | MUST | `01_product.md` |
| G-005 | 제품 전략 3원칙 (적합화=개발자/CTO→PM/"돕는다") | MUST | `01_product.md` |
| G-006 | BM 요약 (라이선스 + 모드별 AI 비용) | SHOULD | `01_product.md` |

### G-020~G-039 아키텍처
| ID | 제목 | 강제 | 파일 |
|---|---|---|---|
| G-020 | 4-Plane 구조 (Policy/Spec/Dev/Ops) 보존 | MUST | `02_architecture.md` |
| G-021 | 3 Orchestrators 추론 격리 (SSOT/Scrum/Tech Leader만) | MUST | `02_architecture.md` |
| G-022 | Executor 추가 규칙 (신규 Orchestrator 금지) | MUST | `02_architecture.md` |
| G-023 | 하네스 AI 권한 (모델 배정 / 재설계 흐름) | MUST | `02_architecture.md` |
| G-025 | LucaPus 정합성 7원칙 (절대 불허) | MUST | `02_architecture.md` |
| G-026 | SSOT Verifier (스펙↔구현 일관성 검증) | MUST | `02_architecture.md` |
| G-027 | 4-Tier Gate (T1 정적분석 / T2 테스트 / T3 규칙 / T4 보안) | MUST | `02_architecture.md` |
| G-028 | R1~R7 스펙 분석 순서 고정 | MUST | `02_architecture.md` |
| G-029 | E0~E5 개발 파이프라인 순서 고정 | MUST | `02_architecture.md` |
| G-030 | Plane 간 데이터 흐름 경로 | MUST | `02_architecture.md` |
| G-031 | Paperclip 오케스트레이션 엔진 (외부 노출 금지) | MUST | `02_architecture.md` |
| G-032 | 멀티 LLM 라우팅 (Claude/GPT/Solar/Gemini, 우선순위 비공개) | SHOULD | `02_architecture.md` |

### G-040~G-059 위계/권한
| ID | 제목 | 강제 | 파일 |
|---|---|---|---|
| G-040 | 위계 6단 정의 (super/OA/L1/L2/L3/L4) | MUST | `03_hierarchy.md` |
| G-041 | 조직 3계층 (Org/Team/Project) | MUST | `03_hierarchy.md` |
| G-042 | 조직 MUST 하위 해제 금지 | MUST | `03_hierarchy.md` |
| G-043 | 상속 UI 표시 (🔒조직/팀/프로젝트) | SHOULD | `03_hierarchy.md` |
| G-044 | 적합화 큐 자동 라우팅 (🔷=L3, 🔶비즈=L2) | MUST | `03_hierarchy.md` |
| G-045 | 위계 × 기능 매트릭스 | MUST | `03_hierarchy.md` |
| G-046 | SSO 역할 매핑 (SAML/OIDC/SCIM) | SHOULD | `03_hierarchy.md` |
| G-047 | AiOPS 별도 권한 체계 (super_admin/admin/member) | MUST | `03_hierarchy.md` |
| G-048 | Wiring ↔ AiOPS 권한 매핑 | MUST | `03_hierarchy.md` |
| G-049 | 특수 행위 권한 (하네스 재설계/공동 승인/금지 행위) | MUST | `03_hierarchy.md` |
| G-050 | 오케스트레이션 뷰 스코프 (위계별 노출) | MUST | `03_hierarchy.md` |
| G-051 | 위계 전환 규칙 (승급/강등/재라우팅) | MUST | `03_hierarchy.md` |
| G-052 | UI 노출 분기 원칙 (서버 필터링 우선) | MUST | `03_hierarchy.md` |
| G-053 | 위계 관련 감사 대상 행위 | MUST | `03_hierarchy.md` |

### G-060~G-079 Stage
| ID | 제목 | 강제 | 파일 |
|---|---|---|---|
| G-060 | Stage 0~3 정의 + 건너뛰기 금지 | MUST | `04_stage.md` |
| G-061 | 네비게이션 탭 Stage별 노출 | MUST | `04_stage.md` |
| G-062 | Stage 변경 시 칸반 분기 (0미표시/1 3컬럼/2 6컬럼 agent만/3 전체) | MUST | `04_stage.md` |
| G-063 | Stage별 파이프라인 노출 범위 | MUST | `04_stage.md` |
| G-064 | Stage별 로그 내용 (0 적합화만/1+ AI 활동 포함) | MUST | `04_stage.md` |
| G-065 | Stage 0에서도 HITL 작동 (적합화 규칙 확인/수정) | MUST | `04_stage.md` |
| G-066 | Stage별 보고서 범위 | SHOULD | `04_stage.md` |
| G-067 | 운영 탭은 Stage 3 전용 | MUST | `04_stage.md` |
| G-068 | Stage 전환 주체 및 절차 | MUST | `04_stage.md` |
| G-070 | Stage별 AI 실행 권한 | MUST | `04_stage.md` |
| G-071 | Stage별 비용 구조 + Mode 교차 | SHOULD | `04_stage.md` |
| G-072 | Org 내 여러 프로젝트의 Stage 혼재 허용 | SHOULD | `04_stage.md` |
| G-073 | Stage × 위계 교차 매트릭스 | SHOULD | `04_stage.md` |

### G-080~G-099 인프라 모드
| ID | 제목 | 강제 | 파일 |
|---|---|---|---|
| G-080 | Mode A/B/C 정의 + 슈퍼 어드민 할당 | MUST | `05_infra_mode.md` |
| G-082 | 비용 표시 분기 (A=토큰/B=미표시/C=USD) | MUST | `05_infra_mode.md` |
| G-083 | 세션 배지 분기 (A=상품명/B=모델+인프라/C=모델명) | MUST | `05_infra_mode.md` |
| G-084 | 서브노드 📊 분기 (모드별) | MUST | `05_infra_mode.md` |
| G-085 | 설정 > 인프라 상태 분기 (A=전용컴퓨터/B=고객서버/C=미표시) | MUST | `05_infra_mode.md` |
| G-086 | 온보딩 첫 화면 모드별 분기 | MUST | `05_infra_mode.md` |
| G-087 | Mode B 데이터 반출 금지 + 크로스 통계 제외 + opt-in 단방향 | MUST | `05_infra_mode.md` |
| G-088 | Mode C API 키 관리 (AES-256, rate limit, fallback 금지) | MUST | `05_infra_mode.md` |
| G-089 | 적합화 데이터 소유 = 고객 (모드 무관 내보내기) | MUST | `05_infra_mode.md` |
| G-090 | UI 분기 원칙 (서버 응답 레벨, 클라이언트 if 금지) | MUST | `05_infra_mode.md` |
| G-092 | Mode × Stage 교차 | SHOULD | `05_infra_mode.md` |

### G-100~G-119 HITL
| ID | 제목 | 강제 | 파일 |
|---|---|---|---|
| G-100 | 사람=결정자, AI=실행자 | MUST | `06_hitl.md` |
| G-101 | 승인 = 적합화 (6단계 자동 처리) | MUST | `06_hitl.md` |
| G-102 | HITL 노드 4종 (🔶비즈/🔷기술/🔶패턴/🔗온톨) | MUST | `06_hitl.md` |
| G-103 | 기술 결정 🔷 = L3 라우팅 (L4 제출 가능) | MUST | `06_hitl.md` |
| G-104 | 비즈니스 결정 🔶 = L2 라우팅 | MUST | `06_hitl.md` |
| G-105 | 온톨로지 추천 자동 적용 금지 + Mode B 제외 | MUST | `06_hitl.md` |
| G-106 | HITL 병목 감지 + 에스컬레이션 (4h/24h) | SHOULD | `06_hitl.md` |
| G-107 | Stage별 HITL 동작 범위 | MUST | `06_hitl.md` |
| G-108 | CLI에서 HITL 처리 + 웹 이관 규칙 | SHOULD | `06_hitl.md` |
| G-109 | HITL 감사 로그 필드 (alignedWithAi 등) | MUST | `06_hitl.md` |
| G-110 | 패턴 감지 → 승격 경로 (자동 승격 금지) | MUST | `06_hitl.md` |
| G-111 | HITL 자동 검증 체크리스트 | MUST | `06_hitl.md` |

### G-120~G-139 코딩 표준
| ID | 제목 | 강제 | 파일 |
|---|---|---|---|
| G-120 | TypeScript strict (any 금지) | MUST | `07_coding_standard.md` |
| G-121 | 파일 500줄 이하 (R 체인 자동 제안) | MUST | `07_coding_standard.md` |
| G-122 | 네이밍 (kebab-case 파일, camelCase 변수, PascalCase 컴포넌트) | MUST | `07_coding_standard.md` |
| G-123 | 무음 실패 금지 (빈 catch / console.error 단독 금지) | MUST | `07_coding_standard.md` |
| G-124 | 비동기 병렬화 (Promise.all) 권장 | SHOULD | `07_coding_standard.md` |
| G-125 | Import 경로 (@/ 절대, ../../ 금지, 순환 참조 금지) | MUST | `07_coding_standard.md` |
| G-126 | null/undefined 일관성 (혼용 금지) | SHOULD | `07_coding_standard.md` |
| G-127 | 서버/클라이언트 경계 + 환경 변수 (NEXT_PUBLIC_) | MUST | `07_coding_standard.md` |
| G-128 | 로깅 수준 + 민감 정보 금지 | SHOULD | `07_coding_standard.md` |
| G-129 | 테스트 파일 co-location | SHOULD | `07_coding_standard.md` |
| G-130 | 주석: Why 중심 + TODO 날짜/담당자 | SHOULD | `07_coding_standard.md` |
| G-131 | 상수 관리 (매직 넘버 금지) | SHOULD | `07_coding_standard.md` |
| G-132 | React 컴포넌트 구조 + 상태 관리 매트릭스 | MUST | `07_coding_standard.md` |
| G-133 | 성능 최적화 (useMemo/useCallback 측정 후) | SHOULD | `07_coding_standard.md` |
| G-134 | 금지 API (alert, eval, innerHTML, enum 등) | MUST | `07_coding_standard.md` |
| G-135 | 접근성 (alt, label, 키보드, aria) | SHOULD | `07_coding_standard.md` |

### G-140~G-179 보안
| ID | 제목 | 강제 | 파일 |
|---|---|---|---|
| G-140 | PII 최소 수집 (이메일/이름/조직/위계만) | MUST | `08_security.md` |
| G-141 | 감사 로그 immutable (UPDATE/DELETE 금지) + 20개 행위 기록 | MUST | `08_security.md` |
| G-142 | JWT (15분/7일) + SSO (SAML/OIDC/SCIM) + 2FA (TOTP/WebAuthn, SMS X) | MUST | `08_security.md` |
| G-143 | TLS 1.3 + BCrypt 12+ + AES-256-GCM + KMS 키 관리 | MUST | `08_security.md` |
| G-144 | 고객 간 격리 (org_id RLS) + Mode B 격리 + 에이전트 컨텍스트 격리 | MUST | `08_security.md` |
| G-145 | 데이터 보유 기간 (1년 기본) + 서비스 종료 30일 유예 | SHOULD | `08_security.md` |
| G-146 | 프롬프트 저장 옵션 (전체/요약/미저장, 기본 요약) | SHOULD | `08_security.md` |
| G-147 | IP 화이트리스트 (엔터프라이즈) | MAY | `08_security.md` |
| G-150 | 비밀 정보 로그/에러 노출 금지 + gitleaks 스캔 | MUST | `08_security.md` |
| G-151 | CVE 대응 시간 (Critical 24h / High 7d / Medium 30d) | MUST | `08_security.md` |
| G-152 | 컴플라이언스 지원 (ISO 27001 / SOC 2 / GDPR / PIPA) | SHOULD | `08_security.md` |
| G-160 | 보안 사건 대응 프로세스 (GDPR 72h 통보) | MUST | `08_security.md` |

### G-180~G-199 전환·핸드오프·에스컬레이션 (메타 규칙)
| ID | 제목 | 강제 | 파일 |
|---|---|---|---|
| G-180 | 판단 주체 결정 트리 (AI↔사람 핸드오프 매트릭스) | MUST | `92_transition.md` |
| G-181 | AI 단독 결정 가능 범위 | MUST | `92_transition.md` |
| G-182 | 핸드오프 전달 형식 | MUST | `92_transition.md` |
| G-183 | 체인 전환 트리거 (F↔R↔S↔D↔V↔M↔I) | MUST | `92_transition.md` |
| G-184 | 체인 복귀 규칙 (자동 복귀 시 4축 유지) | MUST | `92_transition.md` |
| G-185 | 체인 중단 불가 상황 | MUST | `92_transition.md` |
| G-186 | 실패 단계별 에스컬레이션 (1→2→3회) | MUST | `92_transition.md` |
| G-187 | MUST 규칙 위반 시도 감지 + 예외 신청 경로 | MUST | `92_transition.md` |
| G-188 | LucaPus 7원칙 위반 감지 (예외 없음) | MUST | `92_transition.md` |
| G-190 | 세션 한계 감지 지표 | SHOULD | `92_transition.md` |
| G-191 | 세션 분할 절차 | MUST | `92_transition.md` |
| G-192 | 세션 재개 절차 | MUST | `92_transition.md` |
| G-193 | 동시 작업 요청 대응 | SHOULD | `92_transition.md` |
| G-194 | 긴급 요청 끼어들기 | MUST | `92_transition.md` |
| G-195 | 세션 종료 의사 감지 | MUST | `92_transition.md` |
| G-196 | 작업 완료 판정 조건 | MUST | `92_transition.md` |
| G-197 | 7일 이상 미접속 재개 | SHOULD | `92_transition.md` |
| G-198 | 30일 이상 미접속 재개 | MUST | `92_transition.md` |

### G-200~G-224 개발 프로세스
| ID | 제목 | 강제 | 파일 |
|---|---|---|---|
| G-200 | 브랜치 네이밍 (체인별 접두사) | MUST | `93_workflow.md` |
| G-201 | main 브랜치 보호 (직접 커밋 금지) | MUST | `93_workflow.md` |
| G-202 | 브랜치 수명 (7일/30일 규칙) | SHOULD | `93_workflow.md` |
| G-203 | 커밋 단위 (하나의 논리 = 하나의 커밋) | MUST | `93_workflow.md` |
| G-204 | 커밋 메시지 포맷 (Refs + Chain + Decisions) | MUST | `93_workflow.md` |
| G-205 | 커밋 메시지 예시 | SHOULD | `93_workflow.md` |
| G-206 | 커밋 금지 항목 (시크릿/대용량/개인설정) | MUST | `93_workflow.md` |
| G-207 | PR 생성 시점 (체인 완료 시 자동) | MUST | `93_workflow.md` |
| G-208 | PR 제목 포맷 (`[<체인>] <요약>`) | MUST | `93_workflow.md` |
| G-209 | PR 본문 자동 생성 (체크리스트 포함) | MUST | `93_workflow.md` |
| G-210 | WIP / Draft 관리 | SHOULD | `93_workflow.md` |
| G-211 | 리뷰어 자동 지정 (변경 영역별) | MUST | `93_workflow.md` |
| G-212 | AI 자가 리뷰 코멘트 (규칙 기반) | SHOULD | `93_workflow.md` |
| G-213 | 규칙 위반 의심 시 리뷰 절차 | MUST | `93_workflow.md` |
| G-214 | 리뷰 완료 기준 (필수 리뷰어 전원 승인) | MUST | `93_workflow.md` |
| G-215 | 체인별 테스트 의무 | MUST | `93_workflow.md` |
| G-216 | 커버리지 목표 (제품별) | SHOULD | `93_workflow.md` |
| G-217 | 테스트 데이터 (실 고객 데이터 금지) | MUST | `93_workflow.md` |
| G-218 | 배포 환경 계층 (local→dev→staging→prod) | MUST | `93_workflow.md` |
| G-219 | Mode별 배포 차이 (A/B/C) | MUST | `93_workflow.md` |
| G-220 | 배포 승인 (L3 / L3+OA / 롤백 계획 필수) | MUST | `93_workflow.md` |
| G-221 | 자동 문서 갱신 (API/규칙/명령어/체인) | MUST | `93_workflow.md` |
| G-222 | 자동 문서화 트리거 (3회 감지) | SHOULD | `93_workflow.md` |
| G-223 | 시맨틱 버전 (patch/minor/major) | MUST | `93_workflow.md` |
| G-224 | 릴리즈 노트 필수 항목 | MUST | `93_workflow.md` |

---

## 2. D-001~D-105 : LucaPus spec-common

| ID 범위 | 카테고리 | 건수 | 파일 | 스코프 |
|---|---|---|---|---|
| D-001~D-010 | 모듈/빌드 구조 | 10 | `spec_module_build.md` | core |
| D-011~D-018 | 설계 패턴 | 8 | `spec_design_pattern.md` | core 대부분 |
| D-019~D-031 | DB/영속성 | 13 | `spec_db_persistence.md` | core + domain |
| D-032~D-039 | API 규약 | 8 | `spec_api.md` | core + domain |
| D-040~D-050 | 보안 | 11 | `spec_security.md` | core |
| D-051~D-052 | HITL 연동 | 2 | `spec_hitl.md` | mixed |
| D-053~D-060 | 테스트 | 8 | `spec_test.md` | core + domain |
| D-061~D-071 | 인프라 | 11 | `spec_infra.md` | mixed |
| D-072~D-076 | 이벤트 | 5 | `spec_event.md` | core + domain |
| D-077~D-090 | 코딩 표준 | 14 | `spec_coding.md` | core + domain |
| D-091~D-105 | 기타 | 15 | `spec_misc.md` | mixed |

**핵심 참조 ID:** D-011(Facade) / D-019(Repository) / D-025(동시성) / D-047(감사 대상) / D-091~092(소셜로그인) / D-095(vendor 격리)

---

## 3. PA-xxx : AiOPS 전용

| ID | 제목 | 강제 | 파일 |
|---|---|---|---|
| PA-001 | 로그 DB 스키마 (logs/users/orgs) | MUST | `products/aiops/rules/data_model.md` |
| PA-002 | 프록시 벤더 호환 (OpenAI/Anthropic/Gemini) | MUST | `products/aiops/rules/proxy.md` |
| PA-003 | 비동기 로깅 (latency 영향 최소화) | MUST | `products/aiops/rules/proxy.md` |
| PA-004 | org_id 식별 토큰 | MUST | `products/aiops/rules/auth.md` |
| PA-005 | 수집 채널 우선순위 | SHOULD | `products/aiops/rules/channels.md` |
| PA-006 | 브라우저 익스텐션 Manifest V3 | MUST | `products/aiops/rules/extension.md` |
| PA-007 | 민감정보 감지 옵션 (관리자 ON/OFF) | SHOULD | `products/aiops/rules/governance.md` |
| PA-008 | 직원 고지 템플릿 | MUST | `products/aiops/rules/governance.md` |
| PA-009 | 비용 이상 감지 룰 | SHOULD | `products/aiops/rules/alerts.md` |
| PA-010 | AI 성숙도 5레벨 분류 | SHOULD | `products/aiops/rules/maturity.md` |
| PA-011 | 온프레미스 패키징 (데이터 미반출) | MUST | `products/aiops/rules/onprem.md` |

---

## 4. PL-xxx : LucaPus 전용

| ID | 제목 | 강제 | 파일 |
|---|---|---|---|
| PL-001 | 4-Plane 경계 | MUST | `products/lucapus/planes/boundary.md` |
| PL-002 | 3 Orchestrators 정의 | MUST | `products/lucapus/orchestrators/roles.md` |
| PL-003 | Executor 에이전트 추론 금지 | MUST | `products/lucapus/orchestrators/roles.md` |
| PL-004 | 하네스 AI 모델 배정 | MUST | `products/lucapus/orchestrators/harness.md` |
| PL-005 | SSOT Verifier 4-Tier Gate | MUST | `products/lucapus/rules/gate.md` |
| PL-006 | CLI 진입점 (`gridge adapt`, `gridge review`) | SHOULD | `products/lucapus/rules/cli.md` |
| PL-007 | 3계층 온톨로지 (기술/도메인/패턴) | MUST | `products/lucapus/rules/ontology.md` |
| PL-008 | 적합화 점수 계산 공식 | SHOULD | `products/lucapus/rules/adapt_score.md` |
| PL-009 | 코드베이스 자동 감지 + 재적합화 | SHOULD | `products/lucapus/rules/codebase.md` |
| PL-010 | 적합화 데이터 YAML/JSON/ZIP 내보내기 | MUST | `products/lucapus/rules/export.md` |

---

## 5. PW-xxx : Wiring AI 전용

| ID | 제목 | 강제 | 파일 |
|---|---|---|---|
| PW-001 | 글래스모피즘 다크 모드 + 디자인 토큰 | MUST | `products/wiring/rules/design.md` |
| PW-002 | React Flow + n8n 듀얼 뷰 | MUST | `products/wiring/rules/pipeline_view.md` |
| PW-003 | 3종 노드 (사람 둥근 / AI 각진 / 하네스 ★) | MUST | `products/wiring/rules/pipeline_view.md` |
| PW-004 | 엣지 4종 (AI→사람 주황/사람→AI 초록/AI↔AI 회색/하네스 검정점선) | MUST | `products/wiring/rules/pipeline_view.md` |
| PW-005 | 서브노드 (📊 모드별 / 🧠 메모리) + 오케스트레이션 뷰 스코프 | MUST | `products/wiring/rules/pipeline_view.md` |
| PW-006 | 적합화 탭 통합 리스트 (4종 HITL) | MUST | `products/wiring/rules/adapt_tab.md` |
| PW-007 | 위계별 탭 노출 필터 | MUST | `products/wiring/rules/adapt_tab.md` |
| PW-008 | 칸반 6컬럼 + Stage 분기 | MUST | `products/wiring/rules/kanban.md` |
| PW-009 | 기획서 분석 R1~R7 노드 시각화 | MUST | `products/wiring/screens/spec_analysis.md` |
| PW-010 | 세션 배지 모드별 분기 (A상품명/B모델+인프라/C모델명) | MUST | `products/wiring/rules/session_badge.md` |
| PW-011 | 비용 표시 모드별 분기 (A토큰/B미표시/C USD) | MUST | `products/wiring/rules/cost_display.md` |
| PW-012 | 규칙 관계 그래프 L3 전용 (requires/depends-on/triggers/serves) | SHOULD | `products/wiring/rules/rule_graph.md` |
| PW-013 | Org Admin 전용 페이지 (대시보드/팀/규칙/SSO/감사) | MUST | `products/wiring/screens/org_admin.md` |
| PW-014 | SSO 연동 (SAML / OIDC / SCIM + 로컬 백업) | MUST | `products/wiring/rules/sso.md` |

---

## 5.5 PB-xxx : Billing MSP 전용 (Mode D)

| ID | 제목 | 강제 | 파일 |
|---|---|---|---|
| PB-001 | 리셀러 구조 원칙 (PG 아님 / "결제 대행" 용어 금지) | MUST | `products/billing/rules/reseller.md` |
| PB-002 | VCN 라이프사이클 (발급·한도·MCC·해외결제·폐기) | MUST | `products/billing/rules/vcn.md` |
| PB-003 | 3단 결제 티어 (월간·주간+월세계서·선불) | MUST | `products/billing/rules/billing_tier.md` |
| PB-004 | 크레딧백 10% (6개월, 다음 달 공제 매출 할인) | MUST | `products/billing/rules/creditback.md` |
| PB-005 | Immutable Ledger (7 테이블 역기록만) | MUST | `products/billing/rules/immutable_ledger.md` |
| PB-006 | 벤더 약관 실사 화이트리스트 (분기별 재실사) | MUST | `products/billing/rules/vendor_compliance.md` |
| PB-007 | Anthropic 파트너십 10% 패스스루 회계 분리 | MUST | `products/billing/rules/anthropic_passthrough.md` |
| PB-008 | Service-First UX 경계 (고객 조회·요청 / AM 실행) | MUST | `products/billing/rules/service_first.md` |
| PB-009 | 회계 분리 엔진 (gridge_cost/customer_charge/margin 트리거) | MUST | `products/billing/rules/accounting_split_engine.md` |
| PB-010 | 감사 로그 가시성 3분할 (customer_only/internal_only/both) | MUST | `products/billing/rules/audit_visibility.md` |
| PB-011 | 멤버 오프보딩 일괄 처리 (parent/child bulk_terminate) | MUST | `products/billing/rules/offboarding.md` |
| PB-012 | 이상 감지 룰 (거절 급증·교차 검증·운영 이상 9종) | MUST | `products/billing/rules/anomaly_detection.md` |
| PB-013 | Phase 0→1→2 전환 체크포인트 (기술·운영·재무 3축) | MUST | `products/billing/rules/phase_transition.md` |

**공통 규칙 연계**: G-091 Mode D (결제 레일, `05_infra_mode.md § 12`) / G-004 외부 노출 금지어 확장 (결제 대행 등, `01_product.md § 4.2`).

**확장 완료**: PB-001~013 전체 13개 작성 완료 (v0.21).

---

## 6. I-xxx : 제품 간 연동

| ID | 제목 | 방향 | 파일 |
|---|---|---|---|
| I-001 | AiOPS → Wiring 로그 파이프라인 | AiOPS→Wiring | `integrations/aiops-wiring.md` |
| I-002 | Wiring ↔ LucaPus 적합화 데이터 동기화 | 양방향 | `integrations/wiring-lucapus.md` |
| I-003 | LucaPus → AiOPS 에이전트 호출 로깅 | LucaPus→AiOPS | `integrations/lucapus-aiops.md` |
| I-004 | Billing ↔ AiOPS 실결제·사용량 교차 검증 | 양방향 | `integrations/billing-aiops.md` |
| I-005 | Billing → Wiring CSM 업셀 시그널 | Billing→Wiring | `integrations/billing-wiring.md` |

카탈로그 + 공통 원칙: `integrations/INDEX.md`

---

## 7. L-xxx, H-xxx, F-xxx

- **L-001~L-015** LucaPus ↔ 외부 도구 연동 (Jira/Slack/GitHub/SSO/Jenkins 등) → `integrations/lucapus-external.md`
- **H-001~H-005** 하네스 AI ↔ 웹/인프라 내부 API → `integrations/harness-api.md`
- **F-001~F-103** Wiring PRD 기능 ID (참조용, 규칙 아님) → `products/wiring/screens/`

---

## 10. 자동 로드 트리거 (핵심 기능)

사용자 요청에서 **아래 키워드 감지 시 해당 파일 자동 로드.** Claude Code는 `CLAUDE.md § 2.2` 작업 유형 감지와 병행하여 이 표를 참고.

### 10.1 도메인 키워드 → 규칙 ID

| 키워드 (한/영) | 자동 로드 규칙 ID | 파일 |
|---|---|---|
| 포인트, 적립, 사용, point | D-025, D-072 | `spec_db_persistence.md`, `spec_event.md` |
| 쿠폰, 할인, coupon | PW-006 | `products/wiring/rules/adapt_tab.md` |
| 주문, 결제, order, payment | D-025, D-072, G-141 | 동시성 + 이벤트 + 감사 |
| 환불, 취소, refund | D-072, G-141 | 이벤트 + 감사 |
| 락, 동시성, 트랜잭션, concurrency | D-025 | `spec_db_persistence.md` |
| 감사, audit, 로그 | G-141, D-047 | `08_security.md`, `spec_misc.md` |
| 권한, 역할, role, RBAC | G-040~G-046, D-040~D-050 | `03_hierarchy.md`, `spec_security.md` |
| 소셜로그인, OAuth, SSO | D-091, D-092, G-046 | `spec_misc.md`, `03_hierarchy.md` |
| vendor, 벤더, 셀러 | D-095 | `spec_misc.md` |
| JWT, 토큰, 인증 | G-142, D-040~D-050 | `08_security.md`, `spec_security.md` |
| API, REST, 엔드포인트 | D-032~D-039 | `spec_api.md` |
| 스키마, 엔티티, 테이블 | D-019~D-031 | `spec_db_persistence.md` |
| 테스트, 테스팅 | D-053~D-060 | `spec_test.md` |
| 이벤트, pub/sub, 이벤트 발행 | D-072~D-076 | `spec_event.md` |
| Facade, 파사드 | D-011 | `spec_design_pattern.md` |
| Repository, 레포지토리 | D-019 | `spec_db_persistence.md` |

### 10.2 제품 키워드 → 제품 라우터

| 키워드 | 자동 로드 |
|---|---|
| AiOPS, 옵저버, observer, 프록시, 로깅, 익스텐션, 크롤러 | `products/aiops/CLAUDE.md` |
| LucaPus, 루카퍼스, CLI, `gridge adapt`, 4-Plane, 오케스트레이터 | `products/lucapus/CLAUDE.md` |
| Wiring, 와이어링, 불혹, 칸반, 파이프라인, 적합화 탭 | `products/wiring/CLAUDE.md` |

### 10.3 기능 키워드 → 공통 규칙

| 키워드 | 자동 로드 |
|---|---|
| OA, L1, L2, L3, L4, 위계, 권한, 역할, 매트릭스 | `03_hierarchy.md` |
| 적합화 큐, 큐 라우팅, 기술 결정 카드, 비즈니스 결정 카드, 🔶🔷🔗 | `03_hierarchy.md § 3` + `06_hitl.md` |
| 조직 규칙, MUST 상속, 팀 규칙, 프로젝트 규칙 | `03_hierarchy.md § 2` |
| SSO, SAML, OIDC, SCIM, Okta, Azure AD | `03_hierarchy.md § 7` |
| 슈퍼 어드민, 고객사 생성, 인프라 할당 | `03_hierarchy.md § 5.1` |
| Org Admin, 조직 관리 페이지, 팀 생성 | `03_hierarchy.md § 4.1` |
| 하네스 재설계, 모델 배정 변경 | `03_hierarchy.md § 5.3` + `02_architecture § 4` + `PL-004` |
| 위계 승급, 강등, 권한 변경, 재라우팅 | `03_hierarchy.md § 8` |
| AiOPS 권한, super_admin, member, admin_teams | `03_hierarchy.md § 4.2` + `PA-004` |
| 4-Plane, Policy Plane, Spec Plane, Dev Plane, Ops Plane | `02_architecture.md § 1` |
| 3 Orchestrators, SSOT Master, Scrum Master, Tech Leader | `02_architecture.md § 2` |
| Executor, BE Developer, QA Verifier, 추론 격리 | `02_architecture.md § 2~3` |
| 정합성 7원칙, 정합성 체크 | `02_architecture.md § 5` (G-025) |
| SSOT Verifier, 4-Tier Gate, T1~T4 | `02_architecture.md § 6~7` |
| R1, R2, R3, R4, R5, R6, R7, 기획서 분석 단계 | `02_architecture.md § 8` |
| E0, E1, E2, E3, E4, E5, 개발 파이프라인 단계 | `02_architecture.md § 9` |
| Paperclip, 오케스트레이션 엔진 | `02_architecture.md § 11` |
| 멀티 LLM 라우팅, 모델 배정 기준 | `02_architecture.md § 12` |
| Stage 0, Stage 1, Stage 2, Stage 3, 도입 단계 | `04_stage.md` |
| Stage 전환, 상승 기준, 적합화 점수 | `04_stage.md § 9` |
| 운영 탭, Stage 3 전용 | `04_stage.md § 8` (G-067) |
| 네비게이션 분기, 탭 노출 | `04_stage.md § 2` (G-061) |
| Mode A, Mode B, Mode C, 온프레미스, 매니지드, 고객 API | `05_infra_mode.md` |
| 비용 표시, 토큰 잔액, USD breakdown | `05_infra_mode.md § 2` (G-082) |
| 세션 배지, Claude Max, GPT Pro, vLLM | `05_infra_mode.md § 3` (G-083) |
| 전용 컴퓨터, machine-id, 고객 서버 엔드포인트 | `05_infra_mode.md § 5` (G-085) |
| API 키, AES-256, rate limit, 벤더별 비용 | `05_infra_mode.md § 8` (G-088) |
| 크로스 통계 제외, opt-in, Mode B 격리 | `05_infra_mode.md § 7` (G-087) |
| HITL, 적합화, 결정 필요, 승인, 카드, 노드 타입 | `06_hitl.md` |
| 비즈니스 결정, 정책 확인, policy_confirm | `06_hitl.md § 2.2` |
| 기술 결정, 락 전략, tech_decision | `06_hitl.md § 2.3` |
| 코드 패턴, 패턴 감지, 패턴 승격, code_pattern | `06_hitl.md § 2.4` |
| 온톨로지, 네트워크 추천, ontology_recommend | `06_hitl.md § 2.5` + `PL-007` |
| 병목, 대기, HITL 쌓임 | `06_hitl.md § 5` |
| 감사, immutable, audit_logs, UPDATE 금지 | `08_security.md § 2` (G-141) |
| 데이터 보유, 보유 기간, 서비스 종료 | `08_security.md § 6` (G-145) |
| PII, 최소 수집, 이름, 이메일 | `08_security.md § 1` (G-140) |
| 암호화, TLS, BCrypt, AES-256, KMS | `08_security.md § 4` (G-143) |
| 2FA, TOTP, WebAuthn, SSO 로그인 | `08_security.md § 3` (G-142) |
| 격리, RLS, org_id, 고객 간 분리 | `08_security.md § 5` (G-144) |
| 프롬프트 저장, 전체/요약/미저장 | `08_security.md § 7` (G-146) |
| 비밀 정보, 시크릿, gitleaks, 토큰 노출 | `08_security.md § 9` (G-150) |
| CVE, 취약점 대응, 보안 스캔 | `08_security.md § 10` (G-151) |
| 컴플라이언스, ISO 27001, SOC 2, GDPR, PIPA | `08_security.md § 11` (G-152) |
| 보안 사건, 데이터 유출, 72시간 통보 | `08_security.md § 13` (G-160) |
| 디자인 토큰, 글래스모피즘, Pretendard, Geist Mono | `products/wiring/rules/design.md` (PW-001) |
| 파이프라인, React Flow, n8n, 노드, 엣지 | `products/wiring/rules/pipeline_view.md` (PW-002~005) |
| 오케스트레이션 뷰, 토폴로지 뷰, 듀얼 뷰 | `products/wiring/rules/pipeline_view.md § PW-002` |
| 사람 노드, AI 노드, 하네스 노드 | `products/wiring/rules/pipeline_view.md § PW-003` |
| 서브노드, 📊, 🧠, 메모리 블록 | `products/wiring/rules/pipeline_view.md § PW-005` |
| 기획서 분석, R1, R2, R3, R4, R5, R6, R7 | `products/wiring/screens/spec_analysis.md` (PW-009) |
| 세션 배지, Claude Max, ChatGPT Pro, vLLM | `products/wiring/rules/session_badge.md` (PW-010) |
| 비용 표시, 토큰 잔액, USD breakdown, ROI | `products/wiring/rules/cost_display.md` (PW-011) |
| 규칙 관계 그래프, requires, depends-on, triggers, serves | `products/wiring/rules/rule_graph.md` (PW-012) |
| 규칙 충돌 감지, 상속 출처, 네트워크 통계 | `products/wiring/rules/rule_graph.md § PW-012-05` |
| Org Admin 페이지, 조직 관리, 팀 관리, 조직 규칙 | `products/wiring/screens/org_admin.md` (PW-013) |
| SSO 설정, SAML, OIDC, SCIM, Okta, Azure AD | `products/wiring/rules/sso.md` (PW-014) |
| 4-Plane 경계, Plane 간 호출, import 경계 | `products/lucapus/planes/boundary.md` (PL-001) |
| 오케스트레이터 역할, SSOT Master, Scrum Master, Tech Leader | `products/lucapus/orchestrators/roles.md` (PL-002~003) |
| Executor 추론 금지, 에스컬레이션 라우팅 | `products/lucapus/orchestrators/roles.md § PL-003` |
| 하네스 AI, 모델 배정, 배정 이유, 재설계 요청 | `products/lucapus/orchestrators/harness.md` (PL-004) |
| SSOT Verifier, 4-Tier Gate, T1 T2 T3 T4 | `products/lucapus/rules/gate.md` (PL-005) |
| gridge CLI, adapt list, adapt resolve, harness redesign | `products/lucapus/rules/cli.md` (PL-006) |
| 3계층 온톨로지, 기술/도메인/패턴, 네트워크 통계 | `products/lucapus/rules/ontology.md` (PL-007) |
| 적합화 점수, 5차원, coverage/depth/consistency | `products/lucapus/rules/adapt_score.md` (PL-008) |
| 코드베이스 감지, 기술 스택, 패턴 감지, 드리프트 | `products/lucapus/rules/codebase.md` (PL-009) |
| 데이터 내보내기, ZIP 번들, 복원, rules.yaml | `products/lucapus/rules/export.md` (PL-010) |
| 모듈 분리, 빌드 도구, 모노레포, 패키지 구조, CI 파이프라인 | `products/lucapus/rules/spec_module_build.md` (D-001~010) |
| Facade, Repository, Strategy, Builder, Saga, 디자인 패턴 | `products/lucapus/rules/spec_design_pattern.md` (D-011~018) |
| 낙관적 락, 비관적 락, 동시성, 트랜잭션, 마이그레이션, 인덱스 | `products/lucapus/rules/spec_db_persistence.md` (D-019~031) |
| REST, GraphQL, API 버전, OpenAPI, Pagination, Rate Limit | `products/lucapus/rules/spec_api.md` (D-032~039) |
| JWT, BCrypt, RBAC, MFA, CSRF, SQL Injection, 감사 대상 | `products/lucapus/rules/spec_security.md` (D-040~050) |
| HITL 자동 생성, HITL 결과 반영, spec-common 업데이트 | `products/lucapus/rules/spec_hitl.md` (D-051~052) |
| 테스트 피라미드, Vitest, JUnit, 커버리지, E2E | `products/lucapus/rules/spec_test.md` (D-053~060) |
| 컨테이너, K8s, IaC, Terraform, 배포 전략, 모니터링, 헬스체크 | `products/lucapus/rules/spec_infra.md` (D-061~071) |
| 도메인 이벤트, Pub/Sub, Kafka, 이벤트 버전, idempotency | `products/lucapus/rules/spec_event.md` (D-072~076) |
| 네이밍 컨벤션, 무음 실패, any 금지, Linter, Formatter | `products/lucapus/rules/spec_coding.md` (D-077~090) |
| 소셜 로그인, OAuth2, Vendor 격리, 파일 업로드, 검색, 다국어, GDPR | `products/lucapus/rules/spec_misc.md` (D-091~105) |
| 통합 고객, AiOPS 로그 Wiring 대시보드, 단일 뷰 | `integrations/aiops-wiring.md` (I-001) |
| 적합화 결정 반영, HITL → 엔진, CLI ↔ 웹 동기화, 이벤트 버스 | `integrations/wiring-lucapus.md` (I-002) |
| 에이전트 호출 로깅, LucaPus → AiOPS, 이중 집계 방지 | `integrations/lucapus-aiops.md` (I-003) |
| Jira, Slack, GitHub PR, Jenkins, ArgoCD, SonarQube, Confluence, Teams, 외부 연동 | `integrations/lucapus-external.md` (L-001~015) |
| 하네스 재설계 요청, 배정 이벤트, 세션 상태, 인프라 상태 | `integrations/harness-api.md` (H-001~005) |
| Anthropic API 프록시, x-api-key, anthropic-version | `products/aiops/channels/anthropic.md` |
| OpenAI API 프록시, Azure OpenAI, prompt_tokens | `products/aiops/channels/openai.md` |
| Gemini API 프록시, usageMetadata, Vertex AI | `products/aiops/channels/gemini.md` |
| Claude Code CLI, ANTHROPIC_BASE_URL, tools_used | `products/aiops/channels/claude_code.md` |
| Cursor, Windsurf, Continue, BASE_URL 변경 | `products/aiops/channels/cursor.md` |
| ChatGPT 공유 링크, Playwright 크롤러, 15분 주기 | `products/aiops/channels/chatgpt_crawler.md` |
| 브라우저 익스텐션, Manifest V3, MutationObserver, claude.ai / chatgpt.com / gemini.google.com | `products/aiops/channels/extension_web.md` |
| Next.js 14, App Router, Server Component, Server Action | `skills/nextjs/CLAUDE.md` |
| Supabase, RLS, Realtime, service_role, 마이그레이션 | `skills/supabase/CLAUDE.md` |
| React Flow, Dagre, 커스텀 노드, BaseEdge | `skills/react-flow/CLAUDE.md` |
| Paperclip, 오케스트레이션 엔진 (내부 비공개) | `skills/paperclip/CLAUDE.md` |
| Chrome Extension MV3, Service Worker, 멀티 LLM 라우팅, 글래스모피즘 Tailwind | `skills/CLAUDE.md` (카탈로그) |
| Anthropic SDK, Claude API, Messages, MCP, tool_use | `skills/claude-api/CLAUDE.md` |
| 데모 시나리오, 세일즈 트랙 A~G, 연출 데이터, 페르소나 | `products/wiring/demo/CLAUDE.md` |
| LucaPus 테이블 (harness_assignments/ontology/codebase/pattern/adapt_scores/gate_results/spec_analyses) | `products/lucapus/schemas/INDEX.md` (카탈로그) |
| Billing MSP, AI Account MSP, Mode D, 리셀러, 재판매, 그릿지 대지급 | `products/billing/CLAUDE.md` |
| VCN, Virtual Card, 가상카드, 카드사 발급, 신한 V-Card, MCC, 해외결제 | `products/billing/rules/vcn.md` (PB-002) |
| 결제 대행 ❌, PG, 전자금융거래법, 재판매 구조 | `products/billing/rules/reseller.md` (PB-001) |
| 결제 티어, 월간/주간/선불, interim_statements, 예치금, deposit_remaining | `products/billing/rules/billing_tier.md` (PB-003) |
| 크레딧백, 10%, 6개월, 다음 달 공제, 매출 할인, AI Cost Optimization | `products/billing/rules/creditback.md` (PB-004) |
| Immutable Ledger, 역기록, reversal entry, audit_logs, 결제 원장 | `products/billing/rules/immutable_ledger.md` (PB-005) |
| 벤더 약관 실사, 화이트리스트, ChatGPT Team, Claude Team, Cursor Business | `products/billing/rules/vendor_compliance.md` (PB-006) |
| Anthropic 패스스루, is_anthropic_passthrough, gridge_margin, 파트너십 재협상 | `products/billing/rules/anthropic_passthrough.md` (PB-007) |
| Billing 테이블 (orgs/members/virtual_cards/transactions/invoices/credit_backs 등 18개) | `products/billing/schemas/INDEX.md` |
| Billing 개별 테이블 (orgs, members, admin_users, org_contracts, services, accounts, virtual_cards, transactions, credit_backs, invoices, audit_logs, action_requests) | `products/billing/schemas/tables/*.md` |
| Billing 고객 포털 URL 27개, app.gridge.ai, wizard, 드로어 | `products/billing/screens/customer/INDEX.md` |
| Billing 운영 콘솔 URL 49개, console.gridge.ai, Admin 2FA, 위험 액션 2단계 | `products/billing/screens/console/INDEX.md` |
| Billing playbook, Phase 0 Day-1 런북, Alpha 온보딩 | `products/billing/playbook/phase0-day1-runbook.md` |
| 월말 마감, invoice_generation 배치, 초안 검수, Smart Bill 발행 | `products/billing/playbook/month-end-close.md` |
| 결제 거절, decline, OVERSEAS_BLOCK, 거절 대응 SOP, 5분 10건 | `products/billing/playbook/decline-response.md` |
| 카드사, 신한 V-Card, KB SmartPay, VCN 발급 실무, 1Password 볼트 | `products/billing/playbook/card-issuer-ops.md` |
| 세금계산서, Smart Bill, 세계서, 발행 실패, 수정 발행 | `products/billing/playbook/smartbill.md` |
| 법무 자문, 세무 자문, 리셀러 정합성, 전자금융거래법, 부가세 | `products/billing/playbook/legal-tax-review.md` |
| 이관, 해지, 재계약, D-30, D+30, 완전 삭제, 데이터 ZIP | `products/billing/playbook/termination.md` |
| Billing ↔ AiOPS, 교차 검증, aiops_bridge_enabled, MSP대행 | `integrations/billing-aiops.md` (I-004) |
| Billing → Wiring, CSM 업셀, 크레딧백 종료, 번들 전환 | `integrations/billing-wiring.md` (I-005) |
| Service-First UX, 고객 요청만, AM 실행, Fast Path 30%+ | `products/billing/rules/service_first.md` (PB-008) |
| 회계 분리 엔진, enforce_accounting_fields 트리거, v_transaction_customer 뷰 | `products/billing/rules/accounting_split_engine.md` (PB-009) |
| 감사 가시성, customer_only, internal_only, both, 3분할, 마스킹 | `products/billing/rules/audit_visibility.md` (PB-010) |
| 오프보딩, 일괄 처리, bulk_terminate, offboarding_events, 7일 유예 | `products/billing/rules/offboarding.md` (PB-011) |
| 이상 감지, anomaly_events, anomaly_rules, decline_burst, aiops_billing_gap | `products/billing/rules/anomaly_detection.md` (PB-012) |
| Phase 전환, 체크포인트, Red Flag, Phase 0/1/2 전환 리뷰 | `products/billing/rules/phase_transition.md` (PB-013) |
| Billing 카탈로그 (rules/schemas_tables/screens/playbook INDEX) | `products/billing/*/INDEX.md` |
| AiOPS 테이블 (orgs/users/logs/audit_logs), prompt_storage, infra_mode | `products/aiops/schemas/tables/*.md` |
| Billing customer 홈, StatCard 4개, 최근 활동 타임라인, 도넛 | `products/billing/screens/customer/home.md` |
| Billing 서비스 관리, 4탭 (구독/API/에이전트), 계정 상세 드로어 | `products/billing/screens/customer/services.md` |
| Billing 신규 요청 wizard, 5유형, new_account/terminate/limit_change | `products/billing/screens/customer/services_new.md` |
| Billing 요청 내역, 메시지 스레드, 교체 완료 확인, 타임라인 | `products/billing/screens/customer/requests.md` |
| Billing 월별 청구서, 3단 금액 breakdown, 세계서 다운로드 | `products/billing/screens/customer/billing.md` |
| Billing 크레딧백 진행, 6개월 진행바, D-30 배너, final 공제 | `products/billing/screens/customer/creditback.md` |
| Billing AM 콘솔 홈, 오늘 할 일, 담당 고객사, 업셀 시그널 | `products/billing/screens/console/home.md` |
| Billing 고객사 상세 8탭, overview/accounts/transactions/invoices | `products/billing/screens/console/org_detail.md` |
| Billing 요청 처리 워크플로, Fast Path vs Full Path, 체크리스트 | `products/billing/screens/console/request_detail.md` |
| Billing VCN 상세, 9단계 상태 머신 시각화, 전체 번호 조회 감사 | `products/billing/screens/console/vcn_detail.md` |
| Billing 청구서 검수, Finance 승인, 고액 Super 2차, Smart Bill | `products/billing/screens/console/invoice_detail.md` |
| Billing P2 테이블 (offboarding_events, anomaly_events, anomaly_rules, request_messages, request_events, usage_snapshots) | `products/billing/schemas/tables/*.md` |
| Billing customer audit_log, 감사 로그 UI, 가시성 필터, CSV 내보내기 | `products/billing/screens/customer/audit_log.md` |
| Billing data_export, 전체 ZIP, 부분 CSV, Owner 전용, 해지 자동 트리거 | `products/billing/screens/customer/data_export.md` |
| Billing 멤버 관리, 초대, Owner 양도, 역할 변경 | `products/billing/screens/customer/org_members.md` |
| Billing 오프보딩 3단계 wizard, 영향 미리보기, 절감 계산, 액션 선택 | `products/billing/screens/customer/org_members_offboarding.md` |
| Billing 결제 모니터링, 거절 큐, 이상 이벤트, 매입 미확정 | `products/billing/screens/console/payments.md` |
| AiOPS alerts (PA-009), maturity_scores (PA-010), 주간 스냅샷 | `products/aiops/schemas/tables/alerts.md`, `maturity_scores.md` |
| Billing P2 (teams, am_assignments, payment_receipts, overdue_actions, export_jobs) | `products/billing/schemas/tables/*.md` |
| AiOPS P2 (integrations, usage_patterns), Slack/SSO 연동 설정, 일간 사용 집계 | `products/aiops/schemas/tables/integrations.md`, `usage_patterns.md` |
| phase-check.js, PB-013 자동 스캔, 기술/운영/재무/고객 체크포인트 | `scripts/phase-check.js` |
| GitHub Actions CI, validate + test + install 자동화 | `.github/workflows/validate.yml` |
| Wiring P1 테이블 (orgs, teams, users, user_teams, projects, agents) 본문 | `products/wiring/schemas/tables/*.md` |
| Billing customer settings, 프로필, 비밀번호, 세션, 2FA, 알림 채널별 on/off | `products/billing/screens/customer/settings.md`, `notifications.md`, `integrations.md`, `security.md` |
| Console CSM 월간 리뷰 준비 노트, 업셀 시그널, 액션 아이템 후속, 대화 포인트 | `products/billing/screens/console/csm/reviews.md` |
| Console Super 서비스 카탈로그 관리, 약관 실사 4단계, 가격 정책 변경, 재검토 분기 | `products/billing/screens/console/super/services.md` |
| Wiring P2 테이블 (agent_sessions, harness_assignments, activity_logs, sub_items, item_artifacts) | `products/wiring/schemas/tables/*.md` |
| Billing 잔여 P2 (notification_preferences, csm_notes, monthly_reviews, upsell_signals) | `products/billing/schemas/tables/*.md` |
| Wiring 적합화 탭 상세, 4종 HITL 카드, 규칙 타임라인, 관계 그래프 | `products/wiring/screens/adapt_tab_detail.md` |
| Wiring 세션 배지, 3 변형 컴팩트/표준/전체, Mode 색상 매핑, 실시간 구독 | `products/wiring/screens/session_badges.md` |
| LucaPus 대시보드, 프로젝트 네비, 최근 실행, 추천 작업 AI 진단 | `products/lucapus/screens/dashboard.md` |
| LucaPus 4-Plane 스펙 워크벤치, Problem/Solution/Contract/Context, 모호성 감지, 준비도 점수 | `products/lucapus/screens/spec_workbench.md` |
| LucaPus 3 Orchestrator 시각화, 실시간 로그, 산출물 뷰, HITL 일시 중지 | `products/lucapus/screens/orchestrator_view.md` |
| LucaPus 실행 이력, 실패 패턴 분석, 재시도 모달, 비용 집계 | `products/lucapus/screens/pipeline_runs.md` |
| AiOPS 대시보드, 조직 AI 사용 현황, 채널별, 이상 알림, 비용 분해 | `products/aiops/screens/dashboard.md` |
| AiOPS 로그 탐색, 민감 정보 하이라이트, 세션 그룹화, 역할별 가시성 | `products/aiops/screens/logs_explorer.md` |
| AiOPS 성숙도 대시보드, 4축 레이더, 주간 추이, 회귀 감지, 팀 비교 | `products/aiops/screens/maturity_view.md` |
| AiOPS 코칭 카드 수신함, 개인 맞춤 추천, 챌린지 자동 추적, 북마크 | `products/aiops/screens/coaching_inbox.md` |
| Mode D, 결제 레일, 직교 축, Billing Proxy | `05_infra_mode.md § 12` (G-091) |
| 제품 정체성, AiOPS, LucaPus, Wiring 관계 | `01_product.md` |
| 파트너, 데모, 제안서, 외부 노출, 금지어 | `01_product.md § 4` |
| BM, 라이선스, Starter, Growth, Enterprise | `01_product.md § 6` |

### 10.4 에이전트 키워드 → LucaPus 오케스트레이터

| 키워드 | 자동 로드 |
|---|---|
| SSOT Master, 스펙 분석, R1~R7 | `products/lucapus/orchestrators/roles.md` + `PL-002` |
| Scrum Master, 스프린트 | 동일 |
| Tech Leader, 기술 결정 | 동일 |
| BE Developer, QA Verifier, Executor | `PL-003` (추론 금지 규칙) |
| 하네스, 모델 배정 | `PL-004` + `H-xxx` |

### 10.5 검증 키워드 → V 체인

"검증", "맞는지 확인", "레퍼런스와 비교", "대조" → `90_execution_chain.md § V` 자동 진입.

### 10.6 프로세스·전환 키워드 → 메타 규칙

| 키워드 | 자동 로드 |
|---|---|
| 브랜치, 커밋, PR, merge, push | `93_workflow.md § 1~3` |
| 리뷰, 승인, reviewer | `93_workflow.md § 4` |
| 테스트, 커버리지, 픽스처 | `93_workflow.md § 5` |
| 배포, 릴리즈, staging, production | `93_workflow.md § 6, 8` |
| 문서화, API 문서 | `93_workflow.md § 7` |

### 10.7 세션·전환 키워드 → 전환 규칙

| 키워드 / 신호 | 자동 로드 / 발동 |
|---|---|
| "넘겨줄게", "누구한테 물어봐야", "내가 할까" | `92_transition.md § G-180` (핸드오프 매트릭스) |
| "다른 걸로 해볼까", "접근 바꾸자" | `92_transition.md § G-183` (체인 전환) |
| "또 안 되네", "이미 해봤는데" | `92_transition.md § G-186` (에스컬레이션) |
| "너무 길어졌다", "컨텍스트 꽉 찼다" | `92_transition.md § G-190~191` (세션 분할) |
| "오늘은 여기까지", "내일 이어서", "저장해줘", "마무리" | `92_transition.md § G-195` (세션 종료) |
| "오랜만에", "며칠 됐는데", "지난 주에 하던 거" | `92_transition.md § G-197~198` (장기 재개) |
| "긴급", "지금 당장", "프로덕션 다운" | `92_transition.md § G-194` (긴급 끼어들기) |

---

## 11. ID 미등록 규칙 발견 시

- 세션 중 감지 → `/gz-pattern` 으로 승격 후보 등록
- Knowledge 파일 자동 생성 (`99_protocol.md § 2`)
- 사용자 승인 → 새 ID 예약 → 본문 파일 추가 + 이 인덱스 업데이트
- 충돌: 같은 ID 두 곳 발견 → 하나는 삭제 후 참조로 전환 (`98_governance.md § 4`)

---

## 12. INDEX 읽기 순서 (Claude Code)

```
1. § 0 네임스페이스 확인 (ID 접두어로 소속 추론)
2. § 10 자동 로드 트리거로 현재 작업 관련 규칙 식별
3. § 1~9 에서 구체 ID → 파일 매핑 조회
4. 해당 파일만 로드 (전체 스캔 금지)
```
