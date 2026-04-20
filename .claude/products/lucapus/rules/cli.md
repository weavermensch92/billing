# LucaPus / Rules / CLI — 규칙 본문

> PL-006 본문. gridge CLI 명령어 스펙 + 동작 원칙.
> 개발자 주 접점. L3/L4 가 IDE/Terminal 에서 사용.

---

## PL-006 — gridge CLI (MUST)

### 철학

**"CLI = 개발자 접점. 웹 UI = PM/경영진 접점."**

- 개발자가 CLI 에서 적합화 카드 확인 + 코드 리뷰 + 재설계 요청 모두 가능
- 웹 UI 와 동일 백엔드 (하네스 + Orchestrator) 공유
- CLI 출력은 터미널 친화 포맷 (색상, 박스, 간결)

---

## PL-006-01 — 설치 / 초기화 (MUST)

### 설치

```bash
npm install -g @gridge-ai/cli
# 또는
curl -sSL https://cli.gridge.ai/install.sh | bash
```

### 인증

```bash
gridge login
# → 브라우저 창 열림 → OAuth 로그인 → 터미널로 토큰 전달

gridge whoami
# → User: 이시니어 (L3) / Org: AcmeCorp / Project: payment-service
```

### 프로젝트 초기화

```bash
cd my-project
gridge init
# → .gridge/ 디렉토리 생성
# → 하네스가 기술 스택 감지
# → 온톨로지 기반 초기 규칙 추천
```

---

## PL-006-02 — 핵심 명령어 카탈로그 (MUST)

### 1. 적합화 관리

| 명령어 | 동작 |
|---|---|
| `gridge adapt list` | 결정 대기 HITL 카드 목록 |
| `gridge adapt show <card-id>` | 특정 카드 상세 보기 |
| `gridge adapt resolve <card-id> --option <opt>` | 카드 결정 |
| `gridge adapt defer <card-id>` | 보류 |
| `gridge adapt rules` | 확정 규칙 타임라인 |

### 2. 코드 리뷰

| 명령어 | 동작 |
|---|---|
| `gridge review <pr-number>` | AI 생성 PR 리뷰 요청 |
| `gridge review approve <pr>` | 승인 |
| `gridge review reject <pr> --reason ...` | 거부 |
| `gridge review edit <pr>` | 직접 수정 → 적합화 큐 선택 |

### 3. 파이프라인 / 에이전트

| 명령어 | 동작 |
|---|---|
| `gridge pipeline status` | 현재 에이전트 상태 요약 |
| `gridge pipeline logs` | 실시간 로그 스트림 (tail -f 형태) |
| `gridge harness show` | 모델 배정표 |
| `gridge harness redesign` | 재설계 요청 (L3 전용) |

### 4. 작업 (아이템)

| 명령어 | 동작 |
|---|---|
| `gridge items` | 담당 아이템 목록 |
| `gridge item show <id>` | 상세 |
| `gridge item start <id>` | AI 에이전트 트리거 (Stage 2+) |

### 5. 기획서 분석

| 명령어 | 동작 |
|---|---|
| `gridge spec analyze <file>` | 기획서 업로드 + R1~R7 실행 |
| `gridge spec status` | 현재 R-단계 진행률 |

### 6. 유틸리티

| 명령어 | 동작 |
|---|---|
| `gridge config` | 설정 조회 / 변경 |
| `gridge export` | 적합화 데이터 ZIP 내보내기 |
| `gridge doctor` | 환경 진단 |

---

## PL-006-03 — 적합화 카드 표시 포맷 (MUST)

### `gridge adapt list`

```
GRIDGE — 결정 대기 큐 (5건)

🔶 기획 결정 (2건)
  BP-001  환불 시 포인트 복원 여부              담당: @김PM       high
  BP-002  쿠폰 중복 사용 허용                  담당: @김PM       high

🔷 기술 결정 (2건)
  TK-003  사용자 VENDOR 역할 분리               담당: @이시니어    high  ★AI 87%
  TK-005  PointUsage 동시성 제어                담당: @이시니어    medium ★AI 74%

🔶 코드 패턴 승격 (1건)
  CP-007  @Builder 패턴 엔티티 적용 (4회 감지)  담당: @박주니어    medium

───────────────────────
 상세:  gridge adapt show <ID>
 결정:  gridge adapt resolve <ID> --option <A|B|C>
```

### `gridge adapt show TK-003`

```
┌─ TK-003 ─────────────────────────────────────────────────────────────┐
│ 🔷 기술 결정  |  담당: @이시니어 (L3)  |  우선순위: high              │
├──────────────────────────────────────────────────────────────────────┤
│ 제목: 사용자 역할에서 VENDOR를 어떻게 분리할까요?                     │
│ 출처: SSOT Master / 모델: Claude Max                                 │
│ 참조: spec-common D-095: vendor 데이터 격리                          │
│                                                                      │
│ 배경:                                                                │
│   User 엔티티의 role 필드에 USER/VENDOR/ADMIN이 있음.                │
│   코어에는 USER/ADMIN만 필요. VENDOR는 이커머스 도메인 전용.         │
│                                                                      │
│ 옵션:                                                                │
│   A: 코어=USER/ADMIN, VENDOR는 도메인 확장 구조    ★ AI 추천 (87%)  │
│   B: 전체 포함하되 VENDOR는 미사용 표기                              │
│   C: Task 2 외부 조사 후 확정                                        │
│                                                                      │
│ 연관 규칙: rule-rbac, rule-vendor-isolation                          │
└──────────────────────────────────────────────────────────────────────┘

 결정:  gridge adapt resolve TK-003 --option A
 보류:  gridge adapt defer TK-003
```

### `gridge adapt resolve TK-003 --option A`

```
✅ TK-003 결정 완료

  선택: A (코어=USER/ADMIN, VENDOR는 도메인 확장)
  AI 추천과 일치: 예 (87% → definite)

  규칙 타임라인에 추가됨:
    rule-vendor-separation (MUST, project)

  연쇄 추천 (1건):
    💡 rule-domain-extension (MUST) — 87%가 함께 추가
       적용? [Y/n]
```

---

## PL-006-04 — 색상 / 아이콘 / 포맷 (MUST)

### ANSI 색상

| 용도 | 색상 |
|---|---|
| 에러 / fail | 빨강 `\x1b[31m` |
| 경고 / warn | 주황 `\x1b[33m` |
| 성공 / pass | 초록 `\x1b[32m` |
| 정보 / info | 파랑 `\x1b[34m` |
| 강조 / 제목 | bold `\x1b[1m` |

### 아이콘 (이모지)

- 🔶 = 비즈니스 / 코드 패턴 (주황)
- 🔷 = 기술 결정 (파랑)
- 🔗 = 온톨로지 추천 (점선)
- ⚡ = HITL 대기
- ★ = AI 추천
- 🔒 = 조직 MUST (수정 불가)
- ✅ / ❌ / ⚠️ = 상태

### `--no-color`

CI / 로그 파일용 플래그. 색상 / 이모지 제거:
```bash
gridge adapt list --no-color
# ANSI 없음, 이모지는 [B], [T], [OPT] 등으로 대체
```

---

## PL-006-05 — 출력 모드 (MUST)

### Human (기본)

위 예시처럼 박스 + 색상 + 축약

### JSON

```bash
gridge adapt list --json
# → 머신 파싱 가능한 JSON 배열
```

### Compact

```bash
gridge adapt list --compact
# → 1줄당 1카드, 디테일 최소
```

### Watch 모드

```bash
gridge pipeline logs --watch
# → 실시간 스트림 (WebSocket)
```

---

## PL-006-06 — 위계별 명령어 제약 (MUST)

G-052 / G-049 정합. 서버가 위계 검증:

| 명령어 | 허용 위계 |
|---|---|
| `adapt resolve` (비즈니스) | L2 + 해당 카드 assignee |
| `adapt resolve` (기술) | L3 + 해당 카드 assignee |
| `harness redesign` | **L3 전용** |
| `pipeline status` | 전 위계 (범위 다름) |
| `items start` (Stage 2+ 트리거) | L3/L4 |
| `config set org-must` | **OA 전용** |

### 권한 거부 출력

```
$ gridge harness redesign

❌ 권한 없음

  이 작업은 L3 기술 리드 이상이 가능합니다.
  현재 위계: L4 (박주니어)

  담당자에게 문의: @이시니어 (L3)
```

---

## PL-006-07 — IDE 통합 (SHOULD)

### VS Code 익스텐션

- CLI 와 동일 백엔드
- 사이드바에 적합화 큐 / 로그 / 파이프라인 실시간
- 코드 리뷰 CodeLens (AI 어노테이션)

### JetBrains 플러그인 (Sprint 3+)

- IntelliJ / WebStorm / PyCharm 공용
- VS Code 와 기능 패리티 유지

### IDE → CLI 위임

복잡한 명령은 IDE 에서 CLI 명령어 생성 → 터미널 실행:
```
[적합화 큐에 승격] 버튼 클릭
 → IDE 가 터미널 오픈 + `gridge adapt resolve CP-007 --option promote`
 → 사용자 확인 후 실행
```

---

## PL-006-08 — 감사 로그 연동 (MUST, G-141)

CLI 를 통한 모든 감사 대상 행위는 `audit_logs` 기록:

```json
{
  "action": "HITL_resolved",
  "actor_user": "이시니어",
  "source": "gridge-cli v1.0",
  "ip_address": "...",
  "before_value": null,
  "after_value": { "card_id": "TK-003", "option_id": "A", "aligned_with_ai": true }
}
```

### CLI source 표시

Wiring 웹 UI 에서 감사 로그 볼 때:
```
2026-04-18 14:20  HITL 결정 (TK-003)  이시니어 (L3)  [via gridge-cli]
```

---

## PL-006-09 — 외부 노출 금지 (MUST, G-004)

CLI 텍스트에 사용 금지:

- `LucaPus` / `Paperclip` / `voyage` / `하네스`
- `SSOT Verifier` / `T1/T2/T3/T4` (노출 시 "4단계 품질 게이트")
- 내부 코드명 / 내부 경로

허용:
- "하네스 AI" (제품명으로 OK)
- "오케스트레이터" / "에이전트"
- "4단계 품질 게이트"

### 검증

```bash
# 패키지 빌드 전 grep 으로 감지
grep -rn "LucaPus\|Paperclip\|voyage#" packages/cli/src
# 발견 시 빌드 실패
```

---

## PL-006-10 — 설정 파일 (MUST)

### `.gridge/config.yml` (프로젝트)

```yaml
version: 1
org_id: acme-corp
project_id: payment-service

stage: 2                        # Stage 0~3
mode: C                         # A/B/C

hierarchy:
  sso_provider: okta
  role_mapping:
    engineers: L4
    engineering_leaders: L3

harness:
  ui_readonly: true             # 고객은 배정 보기만 가능
                                # (모델 변경은 하네스 재설계 요청으로만)

cli:
  default_output: human          # human | json | compact
  watch_interval_sec: 2
```

### `~/.gridge/credentials` (사용자별)

```yaml
token: sk-gridge-abc123...       # OAuth access token
refresh_token: ...
expires_at: ...
```

- 권한: `chmod 600` 강제
- 비밀번호 / API 키 평문 저장 금지 (G-143)

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] CLI 에 "LucaPus" / "SSOT Verifier" / "Paperclip" 노출?
- [ ] 권한 없는 명령어가 클라이언트 검증만 하고 서버 검증 누락?
- [ ] `~/.gridge/credentials` 가 `chmod 600` 이 아님?
- [ ] 감사 대상 행위에 `source: "gridge-cli"` 누락?
- [ ] `--skip-*` / `--force` 같은 게이트 우회 플래그 존재?
- [ ] `--no-color` 에서도 이모지 노출?
- [ ] L4 가 `harness redesign` 명령어 실행 가능?

---

## 참조

- 위계 × 명령어: `03_hierarchy.md § 5` (G-049)
- 감사 로그: `08_security.md § 2` (G-141)
- 외부 노출 금지: `01_product.md § 4` (G-004)
- 모델 변경 금지: `products/lucapus/orchestrators/harness.md § PL-004-05`
- HITL 카드 포맷: `products/wiring/rules/adapt_tab.md`
- Stage × 명령: `04_stage.md § 4` (G-063)
- 외부 연동 (Jira/Slack): `03_product_interface.md` (추후)
