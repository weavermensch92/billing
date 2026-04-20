# 99_Governance — 룰북 거버넌스

> 이 문서는 **룰북 자체의 사용·관리 규약**이다. 룰북을 수정할 때 반드시 이 문서를 준수.
> 이 문서는 거의 변하지 않는다. 변경 시 OA + L3 기술 리드 공동 승인 필요.

---

## 1. 이 룰북의 위치

**Gridge AIMSP 하네스** = Claude Code가 그릿지 AIMSP를 개발할 때 배경지식으로 사용하는 자동 실행 프레임워크.

- 주 사용자: **AI** (Claude Code, Claude Cowork, 코덱스 등)
- 부 사용자: **사람** (팀원이 규약 확인할 때)
- 핵심: 규칙의 **본문은 단 한 곳에만** 존재, 다른 곳에서는 ID로만 참조
- 핵심: Claude Code는 한 세션에 전부 못 읽으므로 **라우터 + 인덱스 + 조건부 로딩 + 자동 실행 엔진** 구조

---

## 2. 파일 역할 분리

| 파일 유형 | 역할 | 예 |
|---|---|---|
| **라우터/하네스** | 작업 유형 감지 → 체인 분기 → 자동 로드 | `CLAUDE.md` |
| **실행 체인** | 작업 유형별 자동 실행 순서 | `rules/90_execution_chain.md` |
| **자동 기록** | conflict/knowledge/feedback 기록 | `rules/99_protocol.md` |
| **인덱스** | 규칙 ID 카탈로그 + 자동 로드 트리거 | `rules/00_index.md` |
| **공통 규칙** | 전 제품 적용 원칙 | `rules/01_product.md`~`08_security.md` |
| **제품 규칙** | 한 제품 내부 한정 | `products/{p}/rules/*.md` |
| **연동 규칙** | 제품 경계 | `integrations/*.md` |
| **스킬** | 기술 문법/라이브러리 레퍼런스 | `skills/{tech}/*.md` |
| **스키마** | DB DDL / 타입 정의 원본 | `products/*/schemas/` |
| **커맨드** | 실행 가능한 명령어 스펙 | `commands/*.md` |
| **거버넌스** (이 문서) | 룰북 사용법 | `rules/98_governance.md` |
| **이슈** | 자동 기록 파일 | `.claude/issue/*.md` (gitignore) |
| **컨텍스트** | 프로젝트 로컬 오버라이드 | `.context/rules/`, `.context/issue/` |

### 금지 사항
- 라우터에 규칙 본문 쓰기
- 공통 규칙에 제품 고유 결정 쓰기
- 제품 규칙에 제품 간 연동 쓰기 (→ `integrations/`)
- 같은 규칙 두 곳에 중복 작성

---

## 3. 컨텍스트 예산

### 한 세션 대략 예산

| 구간 | 예산 |
|---|---|
| ALWAYS_LOAD 10개 파일 총합 | ≤ 3,500 줄 |
| 실행 체인 선택 시 추가 로드 | ≤ 800 줄 |
| 코드 생성 출력 | ≤ 3,000 줄 |
| 사용자 대화 + 파일 view | 나머지 |

### 파일 분량 상한

| 파일 유형 | 상한 |
|---|---|
| `CLAUDE.md` (라우터) | 250줄 |
| `00_index.md` | 500줄 |
| `01_product.md` | 400줄 |
| `02_architecture.md` | 500줄 |
| `03_hierarchy.md` | 500줄 |
| `04_stage.md` | 500줄 |
| `05_infra_mode.md` | 500줄 |
| `06_hitl.md` | 500줄 |
| `08_security.md` | 500줄 |
| `90_execution_chain.md` | 500줄 |
| `99_protocol.md` | 450줄 |
| `92_transition.md` | 500줄 |
| `93_workflow.md` | 500줄 |
| `98_governance.md` (이 문서) | 300줄 |
| `07_coding_standard.md` | 600줄 (기술 레퍼런스 — 분할 시 참조성 저하) |
| `rules/*.md` 기타 공통 규칙 | 500줄 |
| `products/*/CLAUDE.md` 제품 라우터 | 200줄 |
| `products/*/rules/*.md` | 500줄 |
| `products/*/screens/*.md` | 500줄 |
| `products/*/schemas/tables/*.md` | 500줄 |
| `skills/*/*.md` | 1,000줄 (기술 레퍼런스 예외) |
| `schemas/*.sql`, `schemas/*/tables/*.md` | 제한 없음 |

상한 도달 → **분할**. 기준: 카테고리 → 주제 → 위계.

---

## 4. 충돌 해결 우선순위

규칙 간 충돌 시 아래 순서:

| 순위 | 기준 |
|---|---|
| 1 | 보안/컴플라이언스 (G-140~179) |
| 2 | LucaPus 정합성 7원칙 (`CLAUDE.md § 6`) |
| 3 | 조직 MUST 규칙 |
| 4 | 팀 SHOULD 규칙 |
| 5 | 프로젝트 로컬 규칙 (`.context/rules/`) |
| 6 | AI 권장 (근거 있는 기본값) |
| 7 | 추측 (금지 — 사용자에게 질문) |

동순위 실제 충돌 → **코드 쓰기 전 사용자 질문.** Conflict 자동 기록(`99_protocol.md § 1`).

---

## 5. 규칙이 없을 때

1. 유사 ID 검색 → `00_index.md`
2. spec-common D-xxx 원문 조회
3. `.context/rules/` + `.context/issue/knowledge-*.md` 검색
4. 없으면 **사용자에게 질문**
5. 결정 후 → `/gz-pattern` 승격 후보 등록

**금지:** "아마 이게 맞을 것 같습니다"로 코드 작성.

---

## 6. ID 네임스페이스 관리

| 접두 | 범주 | 할당 방식 |
|---|---|---|
| `G-xxx` | 그릿지 공통 | 20단위 범위 예약 |
| `D-xxx` | LucaPus spec-common | D-001~D-105 (고정) |
| `PA-xxx` | AiOPS 전용 | 순차 |
| `PL-xxx` | LucaPus 전용 (spec-common 외) | 순차 |
| `PW-xxx` | Wiring 전용 | 순차 |
| `I-xxx` | 제품 간 연동 | 순차 |
| `L-xxx` | LucaPus ↔ 외부 | 순차 |
| `H-xxx` | 하네스 AI 연동 | 순차 |
| `F-xxx` | Wiring PRD 기능 (참조용, 규칙 아님) | 순차 |

**충돌 방지:** `/gz-self-improve` 전역 ID 중복 스캔 실행.

---

## 7. 외부 노출 금지 용어

파트너 제안/데모/외부 문서 작성 시 아래 내부 용어 노출 금지:

`LucaPus`, `하네스`, `IR`, `DevPlane`, `voyage`, `Paperclip`, `SSOT Verifier`, `4-Tier Gate`, `spec-common`

대안: "AI 개발팀", "개발 체계", "적합화 엔진", "그릿지 플랫폼".

→ 상세 분기 표: `rules/01_product.md § G-004`

---

## 8. 룰북 수정 프로토콜

### 수정 가능 범위

| 파일 | 수정 권한 |
|---|---|
| `CLAUDE.md` | OA + L3 기술 리드 공동 승인 |
| `rules/90_execution_chain.md` | L3 기술 리드 승인 |
| `rules/99_protocol.md` | OA + L3 기술 리드 공동 승인 |
| `rules/98_governance.md` | OA 승인 |
| `rules/00_index.md` | L3 기술 리드 승인 |
| `rules/01_product.md` ~ `08_security.md` | L3 기술 리드 승인 |
| `products/*/` | 해당 제품 L3 승인 |
| `.context/rules/` | L3 또는 L4 (프로젝트 내 한정) |

### 수정 절차

```
1. /gz-feedback 으로 개선 요청 기록
2. L3 리뷰 (공동 승인 필요 시 OA까지)
3. 승인 시 해당 파일 수정
4. 00_index.md 업데이트 (필요 시)
5. 버전업 + npm publish (관리자)
6. 다음 install 시 전 프로젝트 전파
```

---

## 9. 버전 관리 + 배포

### 시맨틱 버저닝
- `patch` — 오타/소규모 보강 (0.1.0 → 0.1.1)
- `minor` — 기능 추가, 실행 체인 신규 (0.1.0 → 0.2.0)
- `major` — 호환성 깨짐, 규칙 ID 네임스페이스 변경 (0.1.0 → 1.0.0)

### 배포 절차 (관리자)
```bash
# 최초
export GITHUB_TOKEN=<토큰>
npm publish

# 업데이트
git add -A
git commit -m "<요약>"
npm version {patch|minor|major}
npm publish
```

---

## 10. 변경 이력

| 버전 | 일자 | 변경 |
|---|---|---|
| 0.1 | 2026-04-18 | 초안 (CLAUDE.md + 00_index + 99_protocol) |
| 0.2 | 2026-04-18 | 자동 실행 엔진 도입 (90_execution_chain, 99_protocol 신설, 99_protocol → 98_governance 개명) |
| 0.3 | 2026-04-18 | 메타 규칙 추가 (92_transition 핸드오프/전환/에스컬레이션, 93_workflow 개발 프로세스). G-180~G-224 네임스페이스 신설. ALWAYS_LOAD 예산 2,500→3,500줄 조정. |
| 0.4 | 2026-04-18 | 서비스 규칙 본문 완성 (03_hierarchy, 01_product, 06_hitl). G-005/006 추가, G-040~053/100~111 확장. **ALWAYS_LOAD 10개 완성 — 하네스 완전체 도달.** |
| 0.5 | 2026-04-18 | 드라이런 결과 반영. actor/target 분리(GAP-002), 파일 부재 fallback 규칙(GAP-004/005/008), 분기 필요성 판정 매트릭스(GAP-010/011/012), config.yml·session.yml 포맷 정의(GAP-001/003). |
| 0.6 | 2026-04-18 | F 체인 완전체 도달. 07_coding_standard (G-120~G-135), products/wiring/CLAUDE.md 라우터, products/wiring/rules/kanban.md + adapt_tab.md, products/wiring/schemas/INDEX.md + ★4개 테이블 인라인 DDL. 빈틈 11/13 완전 해소. |
| 0.7 | 2026-04-18 | npm 배포 가능 상태. `package.json`, `README.md`, `.gitignore`, `templates/gitignore.template`, `scripts/{cli,init,validate}.js`. `prepublishOnly` 훅으로 validate 자동 실행. end-to-end 설치 테스트 통과 (153 unique rule IDs / 16 files within limits / ALWAYS_LOAD 3,266 lines). npm의 `.gitignore → .npmignore` 자동 변환 이슈 발견 및 templates 경로로 우회. |
| 0.8 | 2026-04-18 | 공통 규칙 4개 본문 완성. `02_architecture.md` (4-Plane + 3 Orchestrators + 정합성 7원칙 + SSOT Verifier + 4-Tier Gate + R1~R7/E0~E5 + Paperclip + 멀티 LLM 라우팅, G-020~G-032). `04_stage.md` (Stage 0~3 정의 + 네비/칸반/파이프라인/로그/HITL/보고서/운영 분기 + 전환 기준 + Mode×Stage + 위계×Stage, G-060~G-073). `05_infra_mode.md` (Mode A/B/C 정의 + 비용/배지/서브노드/인프라상태 분기 + 온보딩 + Mode B 데이터 반출 금지 + Mode C API키 관리 + UI 서버 분기 원칙, G-080~G-092). `08_security.md` (PII 최소 수집 + 감사 로그 immutable 20개 행위 + JWT/SSO/2FA + TLS1.3/BCrypt/AES-256/KMS + org_id RLS + 데이터 보유 + 프롬프트 저장 옵션 + 비밀 정보 스캔 + CVE 대응 + 컴플라이언스 + 사건 대응 72h, G-140~G-160). 00_index 네임스페이스 확장 (G-020~G-032, G-060~G-073, G-080~G-092, G-140~G-160) + § 10.3 키워드 트리거 대폭 확장. |
| 0.9 | 2026-04-18 | P0 최소 실행 가능 파일 6개 완성. `products/aiops/CLAUDE.md` (AiOPS 라우터 + 11개 PA-xxx 매핑 + 채널별 연동 + BM + 외부 노출 제한 + Sprint 1 범위). `products/lucapus/CLAUDE.md` (LucaPus 라우터 + 10개 PL-xxx + spec-common D-001~D-105 카테고리 + 외부 노출 금지어 상세 + Wiring/AiOPS 연동). `scripts/add.js` (기존 프로젝트에 하네스 추가, --force/--dry-run 플래그). `scripts/upgrade.js` (버전 업그레이드, 로컬 수정 보존 + --preview + breaking change 감지). `scripts/status.js` (4축/세션/규칙 카운트/예산/런타임 이슈 종합 조회). `LICENSE` (UNLICENSED Proprietary 선언). 전체 스켈레톤: 25/104 → **31/104 (30%)**. |
| 0.10 | 2026-04-18 | 운영 편의성 완성. commands/README.md 단일 파일에서 **11개 개별 파일로 분할** (gz / gz-scope / gz-spec / gz-verify / gz-impact / gz-pattern / gz-conflict / gz-feedback / gz-self-improve / gz-self-feedback / gz-send-issue). 각 파일 7섹션 표준 포맷 (목적/트리거/입력/실행/출력/예시/금기/참조). scripts 나머지 3개: `install.js` (init alias, `npm run install-harness`용), `uninstall.js` (--yes/--keep-context/--dry-run, issue 파일 자동 백업), `test.js` (스모크 테스트 — validate + 패키지 구조 + 시뮬레이션 설치). **전체 스켈레톤: 31/104 → 45/104 (43%).** commands/scripts 100% 완료. |
| 0.11 | 2026-04-18 | AiOPS 세부 규칙 9개 + schemas INDEX 완성. `products/aiops/rules/data_model.md` (PA-001: orgs/users/logs 핵심 테이블 + 비용 계산 단가표 + RLS). `proxy.md` (PA-002/003: 3벤더 패스스루 + 비동기 배치 로깅 + 채널 식별 + 에러 처리). `auth.md` (PA-004: 3단 권한 super_admin/admin_teams/member + Wiring 위계 매핑 + SSO/SCIM). `channels.md` (PA-005: 11채널 카탈로그 + Sprint 1/2/3 순차 + 수집 방식 4종). `extension.md` (PA-006: Chrome Manifest V3 + DOM 감지 + 서버 전송 + Mode B 제외). `governance.md` (PA-007/008: PII 감지 패턴 10종 + 직원 고지 템플릿 + 관리자/개인 대시보드 + Next Step). `alerts.md` (PA-009: 10개 이상 감지 룰 + 실시간/배치 파이프라인 + Slack/Email/In-app + Mode B는 Slack 금지). `maturity.md` (PA-010: 5단계 레벨 + 5개 평가 항목 가중치 + MSP 업셀 신호). `onprem.md` (PA-011: Docker Compose / K8s / Air-gapped + Keycloak SSO + 원격 지원 제한 + 라이선스 파일). `schemas/INDEX.md` (AiOPS 10개 테이블 카탈로그). **전체 스켈레톤: 45/104 → 55/104 (53%).** AiOPS 제품 작업 시작 가능 — Sprint 1 로그 수집 인프라 구축 즉시 진입 가능. |
| 0.12 | 2026-04-18 | Wiring 세부 규칙 8개 + schemas tables 4개 완성. **rules/**: `design.md` (PW-001: 다크 글래스모피즘 + 색상/타이포/아이콘/노드/엣지 토큰). `pipeline_view.md` (PW-002~005: React Flow + n8n + 3종 노드 + 4종 엣지 + 서브노드 + 병목 + 위계별 뷰 스코프). `session_badge.md` (PW-010: 모드별 배지 텍스트 + 서버 응답 기반 + 하드코딩 금지). `cost_display.md` (PW-011: 3모드 포맷 + 예산 경고 + ROI + API 키 마스킹). `rule_graph.md` (PW-012: 규칙 관계 4종 + 상속 라벨 + 네트워크 통계 + Dagre). `sso.md` (PW-014: SAML/OIDC/SCIM + Assertion 검증 + 로컬 백업 로그인). **screens/**: `spec_analysis.md` (PW-009: R1~R7 PM 언어 번역 + 순서 변경 금지). `org_admin.md` (PW-013: 조직 대시보드 + 팀/규칙/SSO/감사 + OA 권한 검증). **schemas/tables/**: `items.md` (칸반 아이템 + HITL 트리거), `hitl_cards.md` (4종 노드 통합 + AI 추천 + 정합성 추적), `rule_timeline.md` (확정 규칙 + 관계 배열 + 조직 상속 트리거), `audit_logs.md` (immutable 20종 + 위계별 RLS). **PW 네임스페이스 ID 정합화**: PW-013→PW-010, PW-014→PW-011, PW-015→PW-012, PW-010→PW-013, PW-016→PW-014. 00_index § 10.3 Wiring 세부 키워드 16개 추가. **전체 스켈레톤: 55/104 → 68/104 (65%).** Wiring 제품 완주 — Sprint 1/2 칸반+적합화+파이프라인+조직관리 프론트 개발 진입 가능. |
| 0.13 | 2026-04-18 | LucaPus 엔진 세부 규칙 10개 완성. **planes/**: `boundary.md` (PL-001: 4-Plane 경계 + Plane 간 호출 경로 + import 룰 + 데이터 저장 위치 분리 + 5번째 Plane 금지). **orchestrators/**: `roles.md` (PL-002/003: SSOT Master / Scrum Master / Tech Leader 3역할 상세 + Executor 추론 금지 + 에스컬레이션 라우팅 + 교차 협업 패턴 + 4번째 Orchestrator 금지), `harness.md` (PL-004: 모델 배정 알고리즘 + 에이전트별 모드별 매핑 + 배정 이유 7카테고리 + 재설계 요청 수락/거부 + 감사 + 자동 변경 + 컨텍스트 분할). **rules/**: `gate.md` (PL-005: SSOT Verifier 3패스 + 4-Tier Gate T1~T4 상세 + 우회 절대 금지 + 긴급 배포 예외). `cli.md` (PL-006: gridge CLI 명령어 카탈로그 + 적합화 카드 표시 포맷 + 색상/아이콘 + 위계별 명령어 제약 + IDE 통합 + credentials 보안). `ontology.md` (PL-007: 3계층 온톨로지 tech/domain/pattern + 추천 엔진 3시점 + Mode B 처리 + 자동 적용 금지). `adapt_score.md` (PL-008: 5차원 가중치 공식 + 계산 주기 + MSP 업셀 신호 + 가중치 조정). `codebase.md` (PL-009: 기술 스택 감지 + 온톨로지 매칭 + 코드 패턴 3회+ 감지 + 아키텍처 드리프트 + Never Touch 영역 + Mode B 로컬 분석). `export.md` (PL-010: ZIP 번들 구조 7섹션 + YAML 규칙 포맷 + 서비스 종료 대응 + Mode 별 동작 + 무결성 서명). **schemas/**: `INDEX.md` (10개 LucaPus 테이블 카탈로그 + 핵심 DDL 인라인). 00_index § 10.3 LucaPus 세부 키워드 10개 추가. **전체 스켈레톤: 68/104 → 78/104 (75%).** LucaPus 엔진 핵심 작업 모두 F 체인 자동 로드 대상. 엔진 내부 개발 / 온톨로지 구축 / Gate 구현 / 하네스 구현 전 영역 진입 가능. spec_*.md 11개 + channels/ 7개 + integrations/ 6개 + skills/ 7개 남음. |
| 0.14 | 2026-04-18 | **LucaPus spec-common D-001~D-105 전체 11개 카테고리 파일 완성.** `spec_module_build.md` (D-001~010: 모듈/빌드 구조 10건 — 모노레포/패키지 구조/빌드 도구/CI 기본/Git Flow). `spec_design_pattern.md` (D-011~018: Facade/Repository/Strategy/Factory/Builder/Decorator/Observer/Saga 8건). `spec_db_persistence.md` (D-019~031: DB/영속성 13건 — **D-025 낙관적/비관적 락이 가장 잦은 HITL** + 트랜잭션 경계 + 마이그레이션 + N+1 방지 + Soft Delete). `spec_api.md` (D-032~039: API 규약 8건 — REST/GraphQL/버전/HTTP 상태/Problem Details/OpenAPI/Rate Limit). `spec_security.md` (D-040~050: 보안 11건 core 전체 — JWT/BCrypt/RBAC/MFA/CSRF/SQL Injection/개인정보 암호화/감사 대상/API 키 관리). `spec_hitl.md` (D-051~052: **HITL 자동 생성 규칙 + spec-common 반영** — 엔진-HITL-Wiring 연결 브릿지 + 정합성 추적 G-109). `spec_test.md` (D-053~060: 테스트 피라미드/Vitest/JUnit/커버리지/E2E). `spec_infra.md` (D-061~071: 컨테이너/K8s/IaC/CI-CD/배포 전략/모니터링/헬스체크/백업). `spec_event.md` (D-072~076: 도메인 이벤트/Pub-Sub/Kafka/idempotency/버전 관리). `spec_coding.md` (D-077~090: 네이밍/주석/에러 처리/any 금지/Linter — G-120~135와 중첩). `spec_misc.md` (D-091~105: 소셜 로그인/Vendor 격리/파일 업로드/검색/다국어/시간대/GDPR/접근성 — **D-091 소셜 D-095 Vendor 가 잦은 HITL**). 00_index § 10.3 spec_* 11개 키워드 매핑 추가. **전체 스켈레톤: 78/104 → 89/104 (86%).** 모든 기본 스킬 규칙(D-001~105) 제품 규칙과 연결 완료 — Wiring 적합화 탭 ruleRef 참조 / Tech Leader HITL 생성 / SSOT Verifier T3 규칙 검증 / rules.yaml 내보내기 전부 이 문서들 기반. 총 **280 unique rule IDs**. 남은 것: channels/ 7개 + integrations/ 6개 + skills/ 7개 = 20개 (19%). |
| 0.15 | 2026-04-18 | **integrations/ 6개 완성 — 제품 간 / 외부 도구 / 하네스 API 전부 연결.** `integrations/INDEX.md` (I/L/H 네임스페이스 카탈로그 + 공통 원칙 + 로드 우선순위). `aiops-wiring.md` (I-001: 통합 고객 조건 — 동일 org_id + Mode 일치 + Wiring 대시보드에 AiOPS 로그/비용/PII/성숙도 표시 + SSO 단일 로그인 + Mode B 물리 인프라 분리). `wiring-lucapus.md` (I-002 ★ **가장 중요한 연동** — 양방향 이벤트 버스 + 10종 동기 대상 + HITL 결정 → spec-common 반영 전체 흐름 + 정합성 추적 G-109 + CLI-웹 실시간 동기 + 조직 MUST 상속 자동 전파 + Paperclip 이벤트 포맷 호환). `lucapus-aiops.md` (I-003: opt-in 에이전트 로깅 + 8개 lucapus_* 채널 + 더블 카운팅 방지 + 프롬프트 권한별 접근). `lucapus-external.md` (L-001~015: Jira/Slack 봇/GitHub PR/SSO/Jenkins/SonarQube/Confluence/Teams/Postman/Notion/Datadog/GitLab/Bitbucket/Mattermost/커스텀 Webhook 15종 단일 파일 + 공통 인증/상태표시/실패대응 + 외부 장애 전파 금지). `harness-api.md` (H-001~005: 기획서 트리거/배정 결과/재설계 요청/적합화 결과/세션 상태 + 내부 서비스 토큰 + 모드별 배포 + 공개 문서화 금지). **ID 중복 에러 해소**: INDEX.md 에서 I-001~003 열을 "🔗 I-00X 참조" 형식으로 변경해 rule ID 중복 집계 회피 (rule_id 공식 등록은 00_index.md § 6 에만). 00_index 키워드 트리거 5개 추가. **전체 스켈레톤: 89/104 → 95/104 (91%).** 3제품 간 모든 데이터 흐름 / 권한 경계 / 이벤트 라우팅 명시. 고객 도입 시 외부 도구 15종 연동 패턴 표준화. 엔터프라이즈 SSO / Jenkins / ArgoCD / SonarQube 전부 규칙 기반 구현 가능. 남은 작업: AiOPS channels/ 7개 + skills/ 7개 = 14개 (9%). |
| 0.16 | 2026-04-19 | **⭐ 100% 완주 — AiOPS channels + skills + LucaPus schemas/tables 전체 완성.** **Phase A (channels/ 8개)**: `INDEX.md` (Sprint 1/2/3 순차 개발 카탈로그). `anthropic.md` (API 프록시 + 스트리밍 SSE + Mode C 고객 키 pass-through + 비용 계산). `openai.md` (OpenAI/Azure 호환 + prompt_tokens/completion_tokens 정규화 + DALL-E/Whisper 메타 로깅). `gemini.md` (generativelanguage.googleapis.com + usageMetadata camelCase + Vertex AI 분리). `claude_code.md` (ANTHROPIC_BASE_URL + tools_used 수집 + 개발자 프라이버시). `cursor.md` (BASE_URL 변경 + Anysphere Composer 불가 한계 + Windsurf/Continue 확장). `chatgpt_crawler.md` (Playwright + 공유 링크 + 15분 주기 + last_message_count 증분 + 모바일 앱 간접 커버). `extension_web.md` (Manifest V3 + MutationObserver + claude.ai/chatgpt.com/gemini.google.com DOM 셀렉터 카탈로그 + 오프라인 큐). **Phase B (skills/ 8개)**: `INDEX.md` + `nextjs.md` (App Router + Server Action + 위계 검증 G-052 서버 강제). `supabase.md` (RLS 위계별 + immutable 규칙 + Realtime 구독 + Mode B self-host). `react_flow.md` (3종 노드 + 4종 엣지 + Dagre 자동 레이아웃 + 애니메이션). `paperclip.md` (**내부 비공개** G-004 + 이벤트 포맷 호환). `chrome_extension.md` (MV3 Service Worker 생명주기 + chrome.alarms + Enterprise MDM 배포). `multi_llm.md` (Anthropic/OpenAI/Google/Upstage/Local 벤더별 카탈로그 2026 Q1 기준 + 라우팅 로직 + fallback 전략). `frontend_design.md` (Wiring 다크 글래스모피즘 vs AiOPS 밝은 네이비 + Tailwind + shadcn + Framer Motion + Lucide). **Phase C (lucapus/schemas/tables/ 7개)**: `harness_assignments.md` (에이전트×모델×모드 배정 이력 + assigned_by 4종 + retired_at 교체 체인). `ontology_nodes.md` (글로벌 테이블 3계층 + spec_common_ref + Mode B opt-in 원칙). `ontology_edges.md` (9종 edge_type + sample_size 20 임계 + user_feedback 품질 추적). `codebase_snapshots.md` (tech_stack + drift_report + scan_type 4종 + 90일 보유). `pattern_detections.md` (3회+ 감지 트리거 + pattern_signature hash + 승격 체인). `adapt_scores.md` (5차원 + 가중치 스냅샷 + immutable + MSP 업셀 신호). `gate_results.md` (4-Tier T1~T4 + 긴급 배포 skipped + retroactive 재검증). `spec_analyses.md` (R1~R7 역순 금지 트리거 + Evidence Pack + generated HITL 추적). **00_index § 10.3 키워드 트리거 23개 대거 추가** (channels 8 + skills 7 + schemas/tables 8). **전체 스켈레톤: 95/104 → 111/111 (100%+).** tarball 95 → 111 파일. 고유 rule ID 299 → 310+ 예상. 이제 F/R/S 체인이 어떤 영역 작업이든 필요한 파일을 자동 로드 가능. 실제 `gridge-ai-aimsp-harness` npm publish + GitHub 레포 시작 가능 상태. 운영 중 증분 업데이트 루프 진입. |
| 0.17 | 2026-04-19 | **스켈레톤 정합성 복구 — `.context/` 이층 구조 + `issue/` 디렉토리 + skills 디렉토리화 + 파일명 정규화.** 사용자가 원본 스켈레톤과 현재 구현을 대조하여 구조적 gap 지적: (1) `.context/` 최상위 디렉토리 전체 부재, (2) `.claude/issue/` 디렉토리 부재, (3) skills/ 평면 파일 구조 vs 스켈레톤 디렉토리 구조 불일치, (4) `skills/claude-api/` 부재, (5) `products/wiring/demo/` 부재, (6) protocol 파일명 불일치 (91 vs 99). **복구 작업**: `.context/{rules,skills,issue}/` 생성 + 각 README (프로젝트 전용 규칙 / 로컬 패턴 / 자동 기록 용도 명시 + 하네스와 이층 관계 설명). `.claude/issue/README.md` 생성 + `.gitignore` 에 `.context/issue/*` 패턴 추가. skills/ 8개 평면 파일 → 7개 디렉토리 (`nextjs/CLAUDE.md` 등 kebab-case) + 신규 `claude-api/CLAUDE.md` (Anthropic Messages API + SDK TypeScript/Python + 스트리밍 + Tool Use + MCP + 비용 추적 + G-088 Mode C 연계). `skills/INDEX.md` → `skills/CLAUDE.md` rename + 카탈로그 갱신. `products/wiring/demo/CLAUDE.md` 신규 (7종 데모 시나리오 A~G + 세일즈 트랙 조합 가이드 + 연출 데이터 fixtures/ + 페르소나 프리셋 + CLI 터미널 에뮬레이터 P-001.6). **파일명 정규화**: `rules/91_protocol.md` → `99_protocol.md` (스켈레톤 일치). `rules/99_governance.md` → `98_governance.md` (CHANGELOG 성격, protocol 과 구별). **참조 전면 수정**: sed 로 `.md` 경로 / `§` 섹션 참조 일괄 치환 + `scripts/*.js` 5개 파일의 하드코딩 파일명 수정. Wiring CLAUDE.md 에 demo/ 행 추가. 00_index § 10.3 에 claude-api / wiring/demo 키워드 2개 추가. **2층 구조 완성**: `.claude/` 하네스 (npm 배포, gitignore) vs `.context/` 프로젝트 고유 (git 추적) 완전 분리. 충돌 시 `.context/` 우선 원칙 명시. **결과**: validate 0 error / 109 .md / 299 unique IDs / ALWAYS_LOAD 3388/3500 (97%) / 스모크 15/15. 이제 스켈레톤 100% 준수 + 운영 진입 가능. |
| 0.27 | 2026-04-19 | **LucaPus screens 최초 작성 + AiOPS screens 최초 작성.** 두 제품 (LucaPus / AiOPS) 은 rules/tables 완성이나 screens 0개였던 상태 → Phase 0 Alpha 실착수 필수 화면 각 4개씩 신규 작성. **LucaPus screens 5개 신규**: `INDEX.md` (B2B SaaS 특성 반영 + 3단 권한 Admin/Developer/Viewer + Mode 전환 UX + Sprint 우선순위), `dashboard.md` (헤더 세션 배지 Mode 전환 + 프로젝트 드롭다운 + StatCard 3개 + 빠른 시작 3 경로 + 최근 실행 5건 + 추천 작업 AI 진단), `spec_workbench.md` (4-Plane 탭 Problem/Solution/Contract/Context + 통합 뷰 5번째 탭 교차 검증 + 실시간 모호성 감지 AI + 준비도 점수 ≥ 80 실행 버튼 + Monaco Editor 자동 저장), `orchestrator_view.md` (React Flow 3 Orchestrator 시각화 + 4 탭 시각화/로그/산출물/설정 + 실시간 스트리밍 로그 + HITL 일시 중지 + 재시도 모달), `pipeline_runs.md` (실행 이력 + 필터 5종 + StatCard + 실패 패턴 분석 차트 + 재시도 모달 Mode 변경 + 월별 비용 분해 에이전트별). **AiOPS screens 5개 신규**: `INDEX.md` (역할별 화면 경험 매트릭스 + 3단 권한 super_admin/admin_teams/member + Sprint 우선순위), `dashboard.md` (super_admin 전용 + StatCard 4개 + 채널별 사용량 11종 + 이상 알림 PA-007 + 성숙도 라인 차트 + 비용 분해 벤더별 + 비용 최적화 AI 제안), `logs_explorer.md` (필터 권한 역할별 + 로그 상세 드로어 + 민감 정보 하이라이트 + 세션 그룹화 + CSV/JSON/ZIP 내보내기), `maturity_view.md` (4축 레이더 차트 + 3 scope 조직/팀/개인 + 주간 12주 추이 + 팀 비교 테이블 + 회귀 감지 -15% 자동 alerts + 개인 강점/약점 분석), `coaching_inbox.md` (개인 카드 오늘의 추천 3 + 카드 액션 5종 + 챌린지 자동 추적 + 근거 로그 링크 + Admin 팀 코칭 현황 뷰). **00_index § 10.3** 키워드 9개 추가. **v0.26 → v0.27**: .md 209 → 219 (+10: LucaPus 5 + AiOPS 5), rule IDs 314 유지. **주요 진전**: LucaPus screens 0 → 5 (최초), AiOPS screens 0 → 5 (최초). **제품별 완성도**: Billing 95% / AiOPS 90% ★ (+10) / LucaPus 85% ★ (+10) / Wiring 80%. |
| 0.26 | 2026-04-19 | **Wiring P2 테이블 완결 + Billing 잔여 P2 + Wiring screens 확장.** **Wiring P2 5개 신규**: `agent_sessions.md` (세션 라이프사이클 + 토큰 비용 + I-004 Billing usage_snapshots 매핑 + handover chain 재귀 쿼리), `harness_assignments.md` (중앙 레지스트리 agent_id × mode × model + G-131 정합 + previous_model_id 변경 이력), `activity_logs.md` (6유형 agent_state/hitl/stage/rule/commit/notification + 자동 트리거 + 실시간 피드 최적화 인덱스), `sub_items.md` (B1~B6 레이어 SSOT/Spec/Code/Test/Review/Deploy + HITL 레벨 매핑 + retry_count ≥ 3 에스컬레이션), `item_artifacts.md` (8 artifact_type + 4 storage_type inline/github/s3/supabase + 버전 관리 parent_artifact_id + GitHub PR 연동). **Billing 잔여 P2 4개 신규**: `notification_preferences.md` (채널 × 이벤트 × enabled + 3단계 조회 로직 본인/조직기본/시스템기본 + 기본값 상수 + Owner 일괄 적용), `csm_notes.md` (7 note_type general/monthly_review/deal_insight/risk_signal/vendor_contact/legal_note/handover + 가시성 강제 internal_only 트리거 + 영구 보관), `monthly_reviews.md` (auto_summary_data 5 지표 자동 집계 + prepared_talking_points 자동 생성 + action_items JSONB + 완료 시 csm_notes INSERT 트리거), `upsell_signals.md` (5 signal_type + confidence_level 3단계 + evidence JSONB + 자동 감지 배치 매일 04:00 + 전환율 KPI 쿼리 Phase 2 ≥ 10%/20% 목표). **Wiring screens 확장 2개**: `adapt_tab_detail.md` (4 탭 카드대기/타임라인/관계그래프/온톨로지 + 4종 HITL 카드 온톨로지/규칙/패턴/예외 + 처리 액션 승인/수정/거부/보류 + React Flow 관계 그래프 + 실시간 구독), `session_badges.md` (PW-013 3 변형 컴팩트/표준/전체 + Mode 색상 파란/보라/오렌지 + 벤더 아이콘 + Framer Motion pulsing + 헤더/아이템/HITL 배치). **00_index § 10.3** 키워드 5개 추가. **v0.25 → v0.26**: .md 198 → 209 (+11: Wiring 테이블 5 + Billing 테이블 4 + Wiring screens 2), rule IDs 314 유지. Wiring 테이블: 10 → 15 / Billing 테이블: 24 → 28 / Wiring screens: 2 → 4. |
| 0.25 | 2026-04-19 | **Wiring P1 테이블 완결 + Billing Settings + Console CSM/Super 확장.** **Wiring P1 테이블 6개 신규**: `orgs.md` (plan 3종 + infra_mode A/B/C + hitl_strictness 3단계 + ontology_version 스냅샷 + aiops/billing org_id 크로스), `users.md` (6단 위계 L1~L6 매트릭스 + 역할 CTO/PM/TL/SE/Jr.Dev/QA + hitl_preferences JSONB + Slack/Jira 매핑), `teams.md` (lead_user_id TL 레벨 + ontology_domains TEXT[] 소유권 기반 규칙 배정 + Jira component), `user_teams.md` (다대다 lead/member/observer 3 역할), `projects.md` (Stage 0~4 5단계 + LucaPus I-002 연동 lucapus_project_id + Jira/GitHub 매핑), `agents.md` (8 에이전트 harness/ssot-master/scrum-master/tech-leader/be-developer/fe-developer/qa-verifier/doc-writer × Mode A/B/C 세션 매핑 매트릭스 + 상태 전이 5종 idle/running/blocked/error/maintenance + handover_chain). **Billing customer settings 4개 신규**: `settings.md` (프로필 / 비밀번호 / 세션 관리 / 이메일 변경 재인증 / PB-008 예외 영역), `notifications.md` (채널 3종 이메일/Slack/SMS × 이벤트 유형 14종 + 기본값 4단계 정보/액션필요/긴급/정보성 + Owner 조직 기본값 + SMS 사전 동의), `integrations.md` (Slack Connect 공유 채널 + Slack 단일 + Jira Atlassian + SSO Phase 2 예고 + Owner 양측 동의 플로우), `security.md` (2FA TOTP + 백업코드 10개 + 세션 타임아웃 4 옵션 + IP 화이트리스트 CIDR Owner 전용 + SSO SAML/OIDC/SCIM Phase 2). **Console 추가 2개**: `console/csm/reviews.md` (월간 리뷰 준비 노트 + 자동 집계 5 지표 + 업셀 시그널 HIGH/MEDIUM 추천 대화 + 지난 액션 아이템 후속 + 실시간 메모 → CSM 노트 확정), `console/super/services.md` (서비스 카탈로그 중앙 관리 + 약관 실사 4단계 approved/conditional/rejected/pending + pricing_policy 3종 + Anthropic 패스스루 플래그 + 분기 재검토 자동 알림). **00_index § 10.3** 키워드 5개 추가. **v0.24 → v0.25**: .md 186 → 198 (+12: Wiring 6 + Billing settings 4 + Console 2), rule IDs 314 유지. Wiring 테이블 완성도: 4개 기존 (hitl_cards/rule_timeline/items/audit_logs) → 10개 완성. Billing screens customer 11 → 15 (+4) / console 5 → 7 (+2: csm/reviews, super/services). |
| 0.24 | 2026-04-19 | **Medium 우선순위 + CI 추가.** Billing 나머지 P2 테이블 5개 + AiOPS P2 2개 + GitHub Actions CI. **Billing P2 5개**: `teams.md` (조직 내 팀 + 선택적 monthly_budget_krw + 80% 초과 경고 쿼리), `am_assignments.md` (primary/secondary/backup 3 역할 + primary partial unique index + 이관 트랜잭션 + Phase 2 auto-assign 예고), `payment_receipts.md` (Immutable + 수납 영수증 + Phase 0 수동 / Phase 1 오픈뱅킹 자동 매칭 + match_confidence 3단계), `overdue_actions.md` (D+1/7/14/30/60 5단계 + 자동 실행 vs Super 승인 구분 + 일일 03:00 배치 감지 + 콘솔 연체 관리 UI), `export_jobs.md` (고객 내보내기 작업 큐 + 5 유형 + status 5단계 + 7일 TTL + 다운로드 카운트 추적 + 해지 시 auto_export_on_termination 트리거). **AiOPS P2 2개**: `integrations.md` (Slack/SSO SAML·OIDC·SCIM/Jira/GitHub/Notion/Generic Webhook 9종 + config JSONB + Supabase Vault 참조 + 일일 헬스체크 배치), `usage_patterns.md` (일간 사용 집계 매일 02:00 배치 + 4축 지표 frequency/depth/variety/feedback + maturity_scores 계산 입력 + RLS 본인/팀/조직 3계층). **GitHub Actions CI 신규** (`.github/workflows/validate.yml`): validate + smoke test + phase-check + tarball build + 별도 install-test job 프레시 프로젝트에서 npm install + init + 구조 검증 + 150 .md 최소 기준. **README 업데이트**: 3 제품 → 4 제품 (Billing MSP 포함) 표기. **00_index § 10.3** 키워드 5개 추가. **v0.23 → v0.24**: .md 179 → 186 (+7: Billing 5 + AiOPS 2), rule IDs 314 유지. scripts 10개 유지. GitHub workflow 1개 추가. |
| 0.23 | 2026-04-19 | **High 우선순위 순차 처리 — Billing P2 테이블 6개 + Sprint 4 screens 5개 + AiOPS P2 2개 + phase-check.js.** **Billing P2 6개**: `offboarding_events.md` (PB-011 parent action_request 1:1 + 완료 통계 JSONB + 해지 시 자동 트리거), `anomaly_events.md` (PB-012 Immutable DELETE 금지 + detection_data JSONB 스냅샷 + 관련 엔티티 연결), `anomaly_rules.md` (PB-012 중앙 관리 + trigger_condition JSONB 패턴 4종 + auto_actions 12종 + 룰 수정 절차), `request_messages.md` (고객↔AM 스레드 + text/system_update/attachment + 읽음 상태 양쪽 별도 + unread 인덱스), `request_events.md` (타임라인 이벤트 Immutable + auto-log 트리거 제시 + event_data JSONB 패턴 + SLA 위반 배치 감지), `usage_snapshots.md` (I-004 AiOPS 브릿지 일일 집계 + 이번 달 예상 비용 선형 예측 + 교차 검증 쿼리). **Billing Sprint 4 screens 5개**: `customer/audit_log.md` (가시성 필터 customer_only/both + 고객 측 마스킹 적용 + CSV 내보내기 + 기간·행위자·액션 필터), `customer/data_export.md` (Owner 전용 전체 ZIP + 부분 CSV 유형별 + ZIP 구조 명세 + 해지 시 자동 트리거 auto_export_on_termination + 빈도 제한 주 1회), `customer/org_members.md` (리스트 + 상태 배지 5종 + 역할 배지 + 상세 드로어 + 초대 wizard + Owner 양도 다이얼로그 본인 이메일 검증), `customer/org_members_offboarding.md` (PB-011 3단계 wizard + 영향 미리보기 예상 절감 계산 + 계정별 3가지 액션 즉시/이관/유지 + 원자적 트랜잭션 부모 1 + 자식 N + 본인 비밀번호 확인), `console/payments.md` (4 하위 피드/거절/이상/매입미확정 + SLA 기반 거절 큐 정렬 + 대응 체크리스트 4단계 + 카드사 포털 바로가기 + Supabase Realtime 스트리밍). **AiOPS P2 2개**: `alerts.md` (PA-009 5종 alert_type + 전달 채널 JSONB + acknowledge 추적 + 역할별 RLS), `maturity_scores.md` (PA-010 4축 frequency/depth/variety/feedback + 주간 배치 + 개인·팀·조직 3 scope + 회귀 감지 -15% 트리거). **phase-check.js 신규 스크립트**: PB-013 자동 체크포인트 스캔 + 0-to-1 / 1-to-2 두 전환 모드 + 기술/운영/재무/고객 4축 + Red Flag 체크 + 자동 vs 수동 확인 구분. **00_index § 10.3** 에 9개 키워드 트리거 추가. **v0.22 → v0.23**: .md 166 → 179 (+13: Billing 테이블 6 + Billing screens 5 + AiOPS 테이블 2), 고유 rule IDs 314 유지. scripts 10개 → 11개 (phase-check.js 추가). |
| 0.22 | 2026-04-19 | **⭐⭐ 스켈레톤 균형 2턴 완결 — Billing screens 개별 페이지 11개 완성.** Phase 0 Sprint 1~3 필수 화면 모두 개별 본문 작성. **customer 6개**: `home.md` (StatCard 4개 활성계정/이번달결제/진행중요청/크레딧백진행 + 최근활동 타임라인 + 6개월 라인차트 + 서비스별 도넛 + Alpha Day 1 빈상태), `services.md` (4탭 전체/구독/API/에이전트 + 카드 뷰 진행바 + 계정 상세 드로어 800px 한도·VCN·사용량·최근결제 + Owner/Admin 타멤버 필터), `services_new.md` (5유형 wizard 5단계 + Step 1 유형선택 + Step 2~3 유형별 분기 입력 + Step 4 AM 메시지 + Step 5 최종확인 + 제출 트랜잭션 action_requests+request_events), `requests.md` (3탭 구조 진행상황/메시지스레드/요청상세 + 교체완료 확인 UX + 7종 상태 배지 + 메시지 unread 카운트), `billing.md` (3단계 금액 breakdown UI + 라인아이템 테이블 + 티어별 차감 + 세계서 PDF 다운로드 + 납부 계좌 + 연체 경고 D+ 표시), `creditback.md` (6개월 진행바 M1~M6 상태별 색상 + 누적/예상 금액 + D-30 경고 배너 + M6 final 공제 특별 표시 + Wiring/AiOPS 업셀 자연 연결). **console 5개**: `home.md` (AM/Super/Finance/Ops 역할별 차등 뷰 + 오늘 할 일 우선순위 4종 + 담당 고객사 카드 + 업셀 시그널 카드 + Luna 기본 뷰 = am+ops 통합), `org_detail.md` (8탭 overview/accounts/transactions/invoices/requests/members/teams/notes + 탭 1 계약정보·이번달요약·건강도 3열 + 탭 8 CSM 메모 internal_only + 상단 위험액션 2단계), `request_detail.md` (3컬럼 레이아웃 + 유형별 체크리스트 6종 + progress_state JSONB 기록 + Fast Path/Full Path 선택 버튼 + 승인/반려 메시지 스레드 + bulk_terminate 자식 테이블), `vcn_detail.md` (9단계 상태머신 수평 플로우 시각화 + 불가능 전이 버튼 비활성화 + 카드사 실시간 동기화 + 전체번호 조회 Super 전용 감사로그 internal_only + Backup 페어 발급), `invoice_detail.md` (월말 검수 체크리스트 5종 + 3단계 breakdown UI + 고액 ₩10M+ Super 2차 승인 필요 + Smart Bill 상태 + draft/issued 편집 가능 범위 + 수정 발행 절차). **v0.21 → v0.22**: .md 155 → 166 (+11 screens), 고유 rule IDs 314 유지 (화면 스펙에는 ID 추가 없음). **00_index § 10.3** 에 11개 screens 키워드 트리거 추가. **v0.17 → v0.22 총 변화**: .md 109 → 166 (+57: Billing 4제품 전체 + AiOPS 균형 + 전 화면). **Billing 룰북 완전체 달성**: rules 13 + INDEX + 12 tables + 2 screens INDEX + 11 screens 개별 + 7 playbook + INDEX = 46 파일. Alpha 고객 Phase 0 Sprint 1~3 전 화면 Claude Code 바이브 코딩 지원 가능. |
| 0.21 | 2026-04-19 | **⭐ 스켈레톤 균형 복구 + Billing 규칙 완전체 확장 (v0.21).** 사용자가 "스켈레톤 기준 미비 파일" 지적 후 전면 정리. **Critical 클린업**: bash brace expansion 실패로 생성된 잘못된 디렉토리 2개 삭제 (`.claude/{rules,commands,issue}/` + `.claude/products/lucapus/{rules,orchestrators,planes,schemas}/`) + `scripts/validate.js` 에 check5_malformedDirs 추가하여 재발 방지. **Billing 카탈로그 4개 신규**: `rules/INDEX.md` (PB-001~007 완료 + PB-008~013 예고 + 규칙 간 관계도), `schemas/tables/INDEX.md` (P1 12개 완료 + P2 16개 확장 예정 + 우선순위 가이드), `screens/INDEX.md` (customer 27 + console 49 상위 카탈로그 + Service-First 두 포털 관계), `playbook/INDEX.md` (7개 완료 + 역할별 필독 가이드 + 타임라인 도식). **Billing 규칙 PB-008~013 6개 신규**: `service_first.md` (고객 조회·요청 / AM 실행 경계 + Fast Path 30%+ + 셀프서비스 유혹 금지 + 9가지 금지 직접 액션), `accounting_split_engine.md` (결제 수신 → 3필드 분리 자동 계산 + DB 트리거 enforce_accounting_fields + View 3계층 격리 + 크레딧백 별도 처리), `audit_visibility.md` (3분할 visibility 결정 플로우차트 + 30+ 액션 타입별 기본 가시성 카탈로그 + 마스킹 구현 + 정기 감사), `offboarding.md` (parent/child 패턴 + 3가지 계정별 옵션 즉시해지/이관/유지 + 7일 유예 이유 + 3단계 wizard UI + 실패 복구), `anomaly_detection.md` (4 카테고리 거절/결제/교차검증/운영 + 시드 룰 9개 + 자동 조치 auto_actions + false positive 관리), `phase_transition.md` (Phase 0→1 기술/운영/재무/고객 4축 체크포인트 + Phase 1→2 동일 + Red Flag 금지 조건 + 전환 프로세스). **AiOPS schemas/tables/ 4개 신규** (균형 복구): `orgs.md` (plan 3종 / infra_mode A·B·C / prompt_storage 옵션 / billing_org_id Billing 연동), `users.md` (3단 권한 super_admin/admin_teams/member / managed_team_ids), `logs.md` (채널 11종 / prompt_storage 옵션 기반 NULL 처리 / 월 100만+ 파티셔닝 / Billing 교차 검증 뷰), `audit_logs.md` (Immutable G-141 / Billing 과 물리적 별도 테이블 G-091-06 / 3년 보존). **00_index 갱신**: § 5.5 PB-008~013 6개 행 등재 + § 10.3 키워드 트리거 9개 추가 (Service-First + 회계 분리 + 가시성 + 오프보딩 + 이상 감지 + Phase 전환 + 카탈로그 + AiOPS 테이블). **v0.20 → v0.21**: .md 141 → 155 (+14: 카탈로그 4 + Billing 규칙 6 + AiOPS 테이블 4), 고유 rule IDs 308 → 314 (+6: PB-008~013). **남은 v0.22**: Billing screens 우선순위 11개 (customer 6 + console 5). |
| 0.20 | 2026-04-19 | **⭐ 3턴 완전체 마무리 — Billing MSP Integrations + Playbook 전체 반영.** v0.18 핵심 골격 + v0.19 P1 테이블·화면 카탈로그 이후, 마지막 통합 단계. **Integrations 2개 (I-004, I-005)**: `billing-aiops.md` (AiOPS 사용량 snapshot ↔ Billing transactions 교차 검증 + variance_pct 오차 임계 20% + Anthropic 패스스루 일치율 + MSP대행 BM 3 Phase 진화 + 업셀 시그널 양방향), `billing-wiring.md` (CSM 업셀 시그널 4종 자동 감지 A/B/C/D + 크레딧백 종료 D-60 → Wiring 번들 전환 플로우 + Wiring → Billing 역방향 + 업셀 전환율 KPI + UX 금기 사항). **Playbook 7개**: `phase0-day1-runbook.md` (D-7 계약 → D-5 킥오프 → D-4 org 등록 → D-3 서비스 카탈로그 실사 → D-2 Owner 초대 → D-1 리허설 → D+0 Go-Live 첫 VCN → D+1~30 일일 운영), `month-end-close.md` (M+1일 00:30 pg_cron 배치 invoice_generation SQL + 02:00 교차 검증 + 09:00 Finance 검수 + 12:00 Super 고액 2차 + 15:00 Smart Bill 발행 + 16:00 예치금 차감 + 17:00 마감 보고), `decline-response.md` (거절 카테고리 7종 + 24시간 SLA 4단계 + 5분 10건 초과 긴급 에스컬레이션 + 백업 레일 자동 전환), `card-issuer-ops.md` (신한 V-Card 1순위 실무 + KB SmartPay 백업 + 일일 한도 20장 + MCC 5734/7372/5817 + 해외결제 VCN 별 허용 + Phase 1 B2B API 전환 계약 요소 + 1Password 볼트 구조 고객사별 분리), `smartbill.md` (월 건수 요금제 + 법인 인증서 등록 + Phase 0 수동 발행 절차 + 수정 발행 = 취소 후 재발행 연속 거래번호 규정 + Phase 1 API 자동화 TypeScript 예시 + 503 다운 대응), `legal-tax-review.md` (9-1 법무 5개 영역 A~E + 9-2 세무 5개 영역 A~E + 9-3 규제 3개 + 자문사 선정 기준 + 자문 결과 문서화 템플릿 + Phase 0 Go-Live 전 필수 산출물 5종), `termination.md` (3 시나리오 계약 연장·중도 해지·이관 + D-30 ~ D+30 절차 + 법정 10년 아카이브 vs D+30 완전 삭제 양립 + 티어별 예치금 정산 + 고객 Owner 양도 트랜잭션). **integrations/INDEX.md** 에 I-004, I-005 행 추가. **00_index.md** § 6 I-xxx 섹션에 I-004, I-005 등재 + § 10.3 키워드 트리거 10개 추가 (playbook 7 + I-004 + I-005 + 기타). **v0.19 → v0.20**: .md 132 → **143** (+11: integrations 2 + playbook 7 + 기타), 고유 rule IDs **308** (+2: I-004, I-005). **v0.20 = 3턴 완전체 완결**. Billing MSP 가 이제 AiOPS / LucaPus / Wiring 과 동등한 룰북 완성도 달성 → Alpha 고객 Phase 0 Day-1 수동 운영 전수 + 월말 마감 + 거절 대응 + 법무 자문 준비 + 해지 시나리오 모두 Claude Code 가 바이브 코딩 지원 가능 상태. |
| 0.19 | 2026-04-19 | **v0.18/0.19/0.20 3턴 완전체 중 2턴 — Billing MSP P1 테이블 10개 + 화면 카탈로그 2개.** Phase 0 Day-1 필수 테이블 10개 개별 DDL 본문 작성: `orgs.md` (사업자등록번호 변경 불가 + 상태 전이 + RLS), `members.md` (Owner/Admin/Member 3단 권한 + 오프보딩 PB-011 예고), `admin_users.md` (Super/AM/Finance/Ops 4역할 + 2FA + IP 화이트리스트 + Phase 0 위버/Luna 겸직), `org_contracts.md` (3단 티어 + 신용 한도 + 예치금 + 크레딧백 종료일 + final_creditback_applied 플래그), `services.md` (약관 실사 화이트리스트 + 초기 시드 Claude/ChatGPT/Cursor + 분기별 재실사), `accounts.md` (멤버×서비스 + 상태 전이 + UNIQUE 제약), `virtual_cards.md` (상태 머신 PB-002 트리거 구현 + **전체번호 저장 금지 DDL** + Primary/Backup), `transactions.md` (★회계 분리 3필드 gridge_cost/customer_charge/margin + is_anthropic_passthrough + Immutable rules + v_transaction_customer 뷰), `invoices.md` (3단 티어 금액 계산 interim_paid/deposit_used/net_due + 월말 배치 플로우), `credit_backs.md` (Immutable + 역기록 패턴 예시), `audit_logs.md` (가시성 3분할 customer_only/internal_only/both + auto_audit_log 트리거 PB-005-09 + 해지 후에도 org_id=NULL 유지), `action_requests.md` (5종 요청 타입 + parent/child bulk_terminate + 상태 전이 + SLA). **screens/customer/INDEX.md**: 27 URL + 32 화면 + Sprint 1~4 우선순위 + 권한 매트릭스. **screens/console/INDEX.md**: 49 URL + 56 화면 + Admin 2FA/IP 화이트리스트 + 역할별 민감 데이터 접근 매트릭스 + 2단계 승인 위험 액션 4종. 00_index § 10.3 Billing 테이블 / 고객 포털 / 운영 콘솔 키워드 3개 추가. **v0.18 → v0.19**: .md 123 → ~135 (+12), validate 0 error 유지 예상. **v0.20 예고**: integrations/billing-aiops.md + billing-wiring.md + playbook/ 5~7개 (Phase 0 Day-1 런북 + 월말 마감 + 거절 SOP + 법무·세무 자문 + 이관·해지). |
| 0.18 | 2026-04-19 | **⭐ 4번째 제품 Billing MSP (Mode D) 핵심 골격 추가 — v0.18/0.19/0.20 3턴 완전체 중 1턴.** 프로젝트 knowledge 에 7개 시리즈 문서 (01 서비스 정의 ~ 07 운영 플레이북) 이 추가된 **Gridge AI Account MSP** 를 4번째 제품으로 반영. 리셀러 구조 + 3단 결제 티어 + 10% 크레딧백 + Anthropic 패스스루 + 전담 AM Service-First + 벤더 약관 화이트리스트 + Immutable Ledger. **신규 디렉토리**: `.claude/products/billing/{rules,schemas/tables,screens,playbook}/`. **라우터**: `products/billing/CLAUDE.md` (4제품 포트폴리오 위치 + Mode D 직교 축 정의 + 9개 도메인 18 테이블 요약 + 8개 설계 원칙 + Phase 0~2 로드맵 + BM 6개월 크레딧백). **핵심 규칙 7개 (PB-001~007)**: `reseller.md` (PG 아님 / "결제 대행" 용어 금지 / 자금 흐름 도식 / 전자금융거래법 경계 / 계약서 명시 필수 / 자동 검증 grep 패턴). `vcn.md` (상태 머신 pending→approved→issuing→issued→delivered→active / Phase 0 수동 워크플로 Luna 체크리스트 / Phase 1 API 자동 / 한도 정책 / MCC 화이트리스트 / 해외결제 허용 / 폐기 suspend→revoked 7일 유예 / 전체번호 저장 금지). `billing_tier.md` (3단: monthly 기본 / weekly 주간내역서+월세계서 / prepaid_monthly 선불예치금 / 세법 해석 월 1회 공급시기 말일 / 자동 티어 이동 트리거). `creditback.md` (다음달 청구서 공제 매출할인 / M6 마지막 공제 / final_creditback_applied 플래그 / 세금계산서 VAT 할인 후 기준 / Anthropic 패스스루 중첩). `immutable_ledger.md` (7 테이블 UPDATE/DELETE 금지 + 역기록 패턴 / 상태 전이는 예외 / 가시성 3분할 customer_only/internal_only/both / 트리거 auto_audit_log / 보존 기간 법정 10년). `vendor_compliance.md` (ChatGPT Team / Claude Team / Cursor Business 허용 vs ChatGPT Plus 모호 / conditional 조건부 허용 / 분기별 재실사 / 약관 변경 대응 SOP). `anthropic_passthrough.md` (파트너십 10% 할인 패스스루 / is_anthropic_passthrough 필드 / gridge_cost_krw vs customer_charge_krw vs gridge_margin_krw 분리 / v_anthropic_partnership_monthly 재협상 자료 자동 생성 / 타 벤더 확장 설계). **schemas/INDEX.md**: 18 테이블 (조직·멤버 7, 계정·VCN 4, 결제 원장 4, 요청 워크플로 4, 정산·청구 8, 이상 감지 2, 알림 1, 감사·내보내기 2, CSM 3) + 13 View + 마이그레이션 순서 21단계 + RLS 개요 + DB 트리거 + 보존 기간 + P1/P2/P3 우선순위 마킹. **기존 파일 갱신**: `01_product.md` 제목 "3제품 → 4제품" + § 1 테이블에 Billing 추가 + § 1.2 핵심 가치 Billing 추가 + § 4.2 외부 노출 금지어 "결제 대행/PG/결제대행수수료" 추가 + § 4.3 대안 표현 테이블 3행 추가. `05_infra_mode.md` § 12 Mode D 전체 섹션 신규 (G-091-01~07: 병행 보유 / 다루는 범위 / 리셀러 구조 / 비용 표시 / Mode A 경계 / 감사 로그 분리 / 자동 검증). `00_index.md` § 0 네임스페이스 PB-xxx 행 추가 + § 5.5 신규 섹션 "PB-xxx : Billing MSP 전용 (Mode D)" (PB-001~007 7개 + 향후 PB-008~013 예고) + § 10.3 키워드 트리거 9개 추가 (Billing/VCN/결제 대행/티어/크레딧백/Immutable/벤더 약관/패스스루/테이블 카탈로그/Mode D). **신규 rule ID 8개**: PB-001~007 + G-091 (Mode D 공통). **v0.19 예고**: schemas/tables/ 18개 개별 본문 + screens/ 고객 포털 27 URL + 운영 콘솔 49 URL 페이지 규칙. **v0.20 예고**: integrations/billing-aiops.md (AiOPS 사용량 ↔ Billing 실결제 매칭) + integrations/billing-wiring.md (CSM 업셀 시그널 → Wiring 제안) + playbook/ (Phase 0 Day-1 런북 + 월말 마감 + 거절 SOP + 법무·세무 자문 리스트). |

---

## 부록 A. `.context/config.yml` 포맷 (프로젝트 고정 메타)

프로젝트 최초 생성 시 작성. git 추적 대상. 거의 변하지 않음.

```yaml
# .context/config.yml
product: wiring              # aiops / lucapus / wiring / standalone
mode: A                      # A (매니지드) / B (온프레) / C (고객키)
org_id: org-korail           # 조직 식별자
team_id: team-backend        # 팀 식별자 (선택)
project_id: proj-shop-renew  # 프로젝트 식별자

stage: 3                     # 0 / 1 / 2 / 3 — 현재 도입 단계

tech_stack:
  backend: [nextjs-14, supabase, typescript]
  frontend: [nextjs-14, tailwind, zustand]
  orchestration: paperclip

llm_routing:
  primary: claude-sonnet-4-6
  fallback: gpt-4o
  specialized:
    code: gpt-4o
    verify: claude-sonnet-4-6
    korean: solar-pro

harness_version: "0.5.0"     # 이 룰북 버전 고정 (현재 세션)
```

**로드 순서:**
1. 세션 진입 시 자동 로드
2. 제품/모드/Stage 4축에 자동 주입
3. 사용자 확인 없이 진행 가능 (불확실 축 제거)
4. 파일 부재 시 `/gz-scope` 대화형 생성 → 저장

---

## 부록 B. `.context/session.yml` 포맷 (세션 휘발 메타)

세션별 휘발. gitignore. 재개용.

```yaml
# .context/session.yml
session_id: 2026-04-18_14-30
actor: L3                    # 현재 작업자 위계
target: [L2, L3]             # 이 세션의 기능 target
branch: feat/wiring-kanban-hitl-filter
chain: F                     # 현재 진행 중 체인
chain_step: 3                # 6단계 중 어디
started_at: 2026-04-18T14:30:00Z
last_activity: 2026-04-18T15:45:00Z

loaded_files:                # 이미 로드한 파일 (재로드 스킵용 — GAP-009)
  - rules/00_index.md
  - rules/03_hierarchy.md
  - rules/06_hitl.md
  - products/wiring/CLAUDE.md
  - products/wiring/rules/kanban.md

pending_handoffs:            # 대기 중 핸드오프
  - id: handoff-001
    type: "아키텍처 선택"
    decision: "필터 저장 방식"
    awaiting: L3
    options: [URL, localStorage, Zustand]
    ai_recommend: URL

conflict_count: 0            # 세션 내 Conflict 발생 횟수
knowledge_drafts: 2          # 아직 승격 안 된 Knowledge 후보

hitl_routing_log:            # HITL 카드가 누구에게 갔는지 (G-109 연동)
  - { type: tech_decision, routed_to: L3, resolved: true }
```

**로드 순서:**
1. 세션 진입 시 존재 확인
2. 존재 시 → 이전 상태 복원 후 "이어서 진행?" 질문 (92 § G-192)
3. 부재 시 → 새 세션으로 간주, 4축 확정 후 신규 생성
4. 세션 종료 시 자동 저장 (92 § G-195)
