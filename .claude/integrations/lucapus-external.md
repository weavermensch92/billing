# Integrations / LucaPus ↔ External Tools — 규칙 본문

> L-001~L-015 본문. LucaPus 가 고객 외부 도구 (Jira / Slack / GitHub 등) 와 양방향 연동.
> 고객의 기존 워크플로우 유지 + AI 진행 현황 전파.

---

## L-xxx — 외부 도구 연동 (MUST)

### 철학

**"Gridge 쓰려고 도구 바꾸지 않아도 된다."**

- Jira 쓰는 팀 → 아이템↔이슈 양방향 싱크
- Slack 쓰는 팀 → HITL 알림 인라인 승인
- GitHub PR 쓰는 팀 → AI 코드가 PR 로 자동 생성

---

## L-001 — Jira 양방향 연동 (MUST)

### 방향

| Gridge → Jira | Jira → Gridge |
|---|---|
| 아이템 생성 시 → 이슈 생성 | 이슈 상태 변경 → 아이템 상태 싱크 |
| 아이템 상태 변경 → 이슈 상태 | 이슈 코멘트 → 아이템 코멘트 |
| HITL 발생 → 이슈 라벨 "AI 검토 필요" | 이슈 담당자 변경 → 아이템 담당자 |

### 구현

- Jira REST API v3
- Webhook 등록 (Jira 측) + API Polling (fallback)
- 필드 매핑: `items.code` ↔ `jira.issue.key` (예: `PT-001 ↔ PROJ-1234`)

### 충돌 해결

- 마지막 수정 우선 (last-write-wins)
- 충돌 감지 시 사용자에게 알림 (양측 변경 시)

### 강제 수준

**SHOULD** (Jira 사용 조직).

---

## L-002 — Slack 봇 연동 (MUST)

### 용도

HITL 알림 + 인라인 승인.

### 흐름

```
HITL 카드 생성 (Wiring)
  ↓
Slack 봇이 담당자 채널 / DM 에 메시지 전송
  ↓
Slack 메시지에 [옵션 A] [옵션 B] [Gridge 에서 처리] 버튼
  ↓
간단 결정 → 버튼 클릭 → Slack → Wiring API → 적합화 + 감사 + Jira 동시 반영
복잡 결정 → "Gridge 에서 처리" 링크 → 웹 UI 이동
```

### 보안

- Slack Signing Secret 검증 필수 (G-150)
- Slack OAuth 토큰은 암호화 저장 (G-143)

### 강제 수준

**SHOULD**.

---

## L-003 — GitHub / GitLab PR 자동 생성 (MUST)

### 흐름

```
LucaPus BE Developer 코드 생성 완료
  ↓
Gate T1~T2 통과
  ↓
자동 PR 생성:
  - 브랜치: feat/PT-003-point-expiry
  - 제목: [PT-003] 포인트 만료 배치 처리
  - 본문: AI 어노테이션 + 적합화 참조 + 리뷰어 자동 지정
  ↓
리뷰어 (L3) 가 GitHub 에서 직접 리뷰
  ↓
머지 → Gate T4 재실행 → prod 배포 파이프라인
```

### AI 어노테이션 (PR 코멘트)

- 각 커밋이 참조한 적합화 규칙 (예: "rule-optimistic-lock 적용")
- 생성 에이전트 정보 (BE Developer / Mode C / GPT-4o)
- HITL 결정 참조 (예: "TK-005 낙관적 락 선택 결과")

### 강제 수준

**MUST** (Stage 2+).

---

## L-004 — SSO 연동 (SAML/OIDC) (MUST)

### 구성

Wiring `products/wiring/rules/sso.md` (PW-014) 와 동일 구조를 LucaPus CLI 에도 적용.

### CLI SSO

```bash
gridge login --sso
# → 브라우저 OAuth → 콜백 → CLI credentials 저장 (암호화)
```

### 강제 수준

**MUST** (Enterprise).

---

## L-005 — Jenkins / ArgoCD 웹훅 (MUST, Stage 3)

### 용도

배포 파이프라인 트리거:

```
Gate T4 통과 → LucaPus Webhook → Jenkins/ArgoCD 빌드 잡
  ↓
빌드 결과 → Gridge 로 callback
  ↓
Wiring 실시간 로그 + 운영 탭 업데이트
```

### 보안

- Webhook URL 은 HMAC 서명 검증 필수
- Jenkins API 토큰은 Gridge 시크릿 저장소에

### 강제 수준

**MUST** (Stage 3).

---

## L-006 — SonarQube 연동 (SHOULD)

### 용도

코드 품질 게이트 — 4-Tier Gate T2 강화.

### 흐름

```
AI 생성 PR → SonarQube 스캔
  ↓
품질 이슈 발견 → Tech Leader 에게 리뷰 요청 HITL 생성
  ↓
수정 제안 → 재 PR
```

### 강제 수준

**SHOULD**.

---

## L-007 — Confluence 자동 게시 (SHOULD)

### 용도

LucaPus R7 생성 문서 (architecture.md / api-contracts.md 등) → Confluence 페이지 자동 게시.

### 흐름

```
LucaPus 산출물 생성 완료
  ↓
OA 설정한 Confluence 스페이스에 페이지 업로드
  ↓
기존 페이지 덮어쓰기 (버전 히스토리 유지)
```

### 강제 수준

**MAY**.

---

## L-008 — Teams 봇 연동 (SHOULD)

Slack 대안. 마이크로소프트 생태계 고객용.

- Bot Framework SDK
- Adaptive Cards 로 HITL 알림
- L-002 와 동일 기능

### 강제 수준

**SHOULD**.

---

## L-009 — OpenAPI / Postman 통합 (SHOULD)

### 용도

LucaPus 생성 OpenAPI 스펙 → Postman Collection 자동 생성 / 동기화.

### 강제 수준

**MAY**.

---

## L-010 — 내부 Wiki (Notion / Outline) 연동 (MAY)

### 용도

- 내부 위키에 적합화 규칙 스냅샷 게시
- 규칙 변경 시 위키 자동 업데이트

### 강제 수준

**MAY**.

---

## L-011 — Datadog / New Relic APM (SHOULD)

### 용도

LucaPus 에이전트 실행 성능 → APM 에 trace 전송.

### 구현

- OpenTelemetry 표준
- trace_id 전파 (서비스 간)

### 강제 수준

**SHOULD** (Enterprise).

---

## L-012 — GitLab (대안) (MUST)

### 용도

GitHub 의 대안. L-003 와 동일 기능:
- PR (Merge Request) 자동 생성
- AI 어노테이션
- 리뷰 상태 싱크

### 강제 수준

**MUST** (GitLab 사용 조직).

---

## L-013 — Bitbucket (대안) (SHOULD)

Atlassian 생태계. Jira 와 함께.

### 강제 수준

**SHOULD**.

---

## L-014 — ChatOps (Mattermost / Rocket.Chat) (MAY)

self-hosted 오픈소스 대안.

### 강제 수준

**MAY** (Mode B 고객 선호).

### Mode B 고려

- Gridge SaaS 를 쓰지 못하는 고객의 사내 메시징 대체
- Slack 연동 금지 환경에서 유일 대안

---

## L-015 — Legacy 시스템 커스텀 웹훅 (MAY)

### 용도

고객 자체 운영 도구 연동 (HR / 사내 티켓 / 자체 CI).

### 제공 기능

- 일반 Webhook Sender / Receiver
- HMAC 서명 표준
- Payload 스키마 문서화

### 강제 수준

**MAY**.

---

## L-xxx 공통 원칙

### 인증 / 시크릿 (MUST, G-143/G-150 정합)

- OAuth / API 토큰은 암호화 저장 (AES-256)
- 로그 / 에러 메시지에 토큰 노출 금지
- 분기별 로테이션 권장

### 연동 상태 표시 (MUST)

Wiring 설정 > 연동 탭:
```
Jira:       ✅ 연결됨 [설정] [해제]
Slack:      ✅ 연결됨 [설정] [해제]
GitHub:     ✅ 연결됨 [설정] [해제]
SSO:        ⚠  테스트 실패 [재설정]
Jenkins:    ❌ 미연결 [연결]
SonarQube:  ❌ 미연결 [연결]
Confluence: ❌ 미연결 [연결]
```

### 실패 / 장애 대응

- 3회 재시도 (exponential backoff)
- 지속 실패 → OA 알림 + UI 배너
- 장애 중에는 큐에 보관 (복구 후 재전달)

### 외부 도구 장애 전파 금지 (MUST)

외부 도구 (Jira / Slack 등) 장애가 **Gridge 본 기능 마비로 전파 금지**:
- Jira 다운 → 적합화 / 칸반은 정상
- Slack 다운 → HITL 처리는 웹 UI 에서 정상

---

## L-xxx 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] OAuth / API 토큰 평문 저장 (G-143 위반)?
- [ ] Webhook 서명 검증 없이 수신 (L-005 위반)?
- [ ] 외부 도구 장애가 Gridge 본 기능 차단?
- [ ] Slack / Teams 봇 권한이 과도 (전 채널 접근 등)?
- [ ] L-002 인라인 승인 시 감사 로그 누락?
- [ ] GitHub PR 본문에 민감 정보 노출?
- [ ] Jira 필드 매핑 불일치 (items.code ≠ jira.issue.key)?
- [ ] Mode B 고객이 Slack / Teams 사용 (외부 반출)?

---

## 참조

- PRD 외부 연동 매트릭스: `03_프로덕트_인터페이스.md § 8` (원본 문서)
- Wiring 설정 > 연동: `products/wiring/screens/settings.md` (작성 예정)
- SSO: `products/wiring/rules/sso.md` (PW-014)
- 4-Tier Gate: `products/lucapus/rules/gate.md` (PL-005)
- 암호화: `08_security.md § 4` (G-143)
- 시크릿 보호: `08_security.md § 9` (G-150)
- Mode B 외부 반출 금지: `05_infra_mode.md § 7` (G-087)
- Stage 3 운영: `04_stage.md § 4.4`
