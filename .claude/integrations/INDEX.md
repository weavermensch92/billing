# Integrations — INDEX

> 제품 간 / 외부 도구 연동 규칙 카탈로그.
> F/R/S 체인 실행 시 연동 범위 작업이면 이 INDEX 에서 관련 파일 로드.

---

## 네임스페이스 요약

| 네임스페이스 | 범위 | 파일 수 |
|---|---|---|
| `I-xxx` | Gridge 제품 간 (AiOPS / Wiring / LucaPus) | 3 |
| `L-xxx` | LucaPus 와 외부 도구 (Jira / Slack / GitHub 등) | 15 |
| `H-xxx` | 하네스 AI 내부 API | 5 |

---

## I-xxx — Gridge 제품 간 연동

| 규칙 | 제목 | 방향 | 파일 |
|---|---|---|---|
| 🔗 I-001 참조 | AiOPS → Wiring 로그 파이프라인 | AiOPS → Wiring | `aiops-wiring.md` |
| 🔗 I-002 참조 | Wiring ↔ LucaPus 적합화 데이터 동기화 | 양방향 | `wiring-lucapus.md` |
| 🔗 I-003 참조 | LucaPus → AiOPS 에이전트 호출 로깅 | LucaPus → AiOPS | `lucapus-aiops.md` |
| 🔗 I-004 참조 | Billing ↔ AiOPS 실결제·사용량 교차 검증 | 양방향 | `billing-aiops.md` |
| 🔗 I-005 참조 | Billing → Wiring CSM 업셀 시그널 | Billing → Wiring | `billing-wiring.md` |

> ID 공식 등록: `rules/00_index.md § 6`

### 핵심 원칙 (공통)

1. **동일 org_id 매칭**: 제품 간 조직 경계 공유
2. **Mode 일치**: Wiring Mode A 면 AiOPS 도 Mode A
3. **Mode B 데이터 격리**: Gridge 서버 경유 절대 금지 (G-087)
4. **외부 노출 금지**: 내부 용어 / API 구조 고객 UI 에 노출 X (G-004)

---

## L-xxx — LucaPus 외부 도구 연동

**단일 파일 통합**: `lucapus-external.md`

| ID | 도구 | 방식 | 강제 |
|---|---|---|---|
| L-001 | Jira | REST + Webhook 양방향 | SHOULD |
| L-002 | Slack 봇 | HITL 알림 + 인라인 승인 | SHOULD |
| L-003 | GitHub PR | API + AI 어노테이션 | MUST (Stage 2+) |
| L-004 | SSO (SAML/OIDC) | 역할 매핑 | MUST (Ent) |
| L-005 | Jenkins / ArgoCD | Webhook | MUST (Stage 3) |
| L-006 | SonarQube | API | SHOULD |
| L-007 | Confluence | API 자동 게시 | MAY |
| L-008 | Teams 봇 | Adaptive Cards | SHOULD |
| L-009 | Postman | OpenAPI 동기화 | MAY |
| L-010 | Notion / Outline | 위키 연동 | MAY |
| L-011 | Datadog / New Relic | OpenTelemetry | SHOULD |
| L-012 | GitLab | MR + 어노테이션 | MUST (GitLab 조직) |
| L-013 | Bitbucket | PR + 어노테이션 | SHOULD |
| L-014 | Mattermost / Rocket.Chat | Slack 대체 | MAY (Mode B 선호) |
| L-015 | Legacy 커스텀 Webhook | 일반 HMAC Webhook | MAY |

### 핵심 원칙 (공통)

- OAuth / API 토큰 암호화 저장 (G-143)
- Webhook HMAC 서명 검증 (G-144)
- 외부 도구 장애 → Gridge 본 기능 차단 금지
- Mode B 고객: 외부 SaaS (Slack/Teams 등) 사용 시 데이터 반출 경고

---

## H-xxx — 하네스 AI 내부 API

**단일 파일 통합**: `harness-api.md`

| ID | 제목 | 방향 |
|---|---|---|
| H-001 | 기획서 → 구체화 트리거 | 웹 → 하네스 |
| H-002 | 모델/역할 배정 결과 | 하네스 → 웹 |
| H-003 | 재설계 요청 (L3 전용) | 웹 → 하네스 |
| H-004 | 스킬 적합화 결과 | 하네스 → 웹 |
| H-005 | 세션 / 인프라 상태 | 인프라 → 웹 |

### 핵심 원칙 (공통)

- 내부 서비스 토큰 인증 (24h 로테이션)
- Mode B 에서 Gridge 외부로 이벤트 전송 금지
- `/harness/*` API 공개 문서화 금지 (G-004)
- 하네스 장애 시 Wiring 본 기능 정상 유지 (PL-004-09)

---

## 로드 우선순위

### 필수 (F/R/S 체인이 로드)

| 작업 키워드 | 파일 |
|---|---|
| "통합 고객 / 단일 조직" | `aiops-wiring.md` |
| "적합화 결정 / HITL → 엔진 반영" | `wiring-lucapus.md` ★ |
| "하네스 / 재설계 / 배정" | `harness-api.md` |

### 선택 (도구별 작업 시 로드)

| 도구 | 파일 섹션 |
|---|---|
| Jira / Slack / GitHub | `lucapus-external.md § L-001~L-003` |
| SSO / SAML | `lucapus-external.md § L-004` |
| Jenkins / ArgoCD | `lucapus-external.md § L-005` |
| SonarQube / Confluence | `lucapus-external.md § L-006~L-007` |

---

## 참조

- Wiring 설정 > 연동 UI: `products/wiring/screens/settings.md` (작성 예정)
- Wiring SSO 상세: `products/wiring/rules/sso.md` (PW-014)
- AiOPS 채널 카탈로그: `products/aiops/rules/channels.md` (PA-005)
- LucaPus 하네스: `products/lucapus/orchestrators/harness.md` (PL-004)
- 공통 보안: `08_security.md` (G-140~160)
- Mode 원칙: `05_infra_mode.md` (G-080~092)
- 외부 노출 금지: `01_product.md § 4` (G-004)
