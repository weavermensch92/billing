# 05_Infra Mode — 인프라 모드 분기 규칙

> Gridge AIMSP의 3가지 인프라 모드 (A 매니지드 / B 온프레미스 / C 고객 API).
> 보안 수준, 결제 방식, 데이터 경계가 달라짐에 따라 UI/백엔드 전반이 분기.
> 규칙 ID: G-080~G-099.

---

## 1. 모드 정의 (G-080)

| 모드 | 명칭 | AI 실행 | 결제 | 데이터 위치 | 타깃 |
|---|---|---|---|---|---|
| **A** | **매니지드** | 그릿지 Max 계정 | 그릿지 토큰 | 그릿지 인프라 | SMB (10~100인) |
| **B** | **온프레미스** | 고객 서버 | 고객 자체 | 고객 인프라 | 엔터프라이즈 (보안 중시) |
| **C** | **고객 API** | 그릿지 플랫폼 + 고객 API 키 | 고객 직접 | 그릿지 + 벤더 | 중견기업 (비용 직접 관리) |

### G-080-01 — 모드 할당 주체

- **슈퍼 어드민**만 고객사 모드 할당/변경 (G-049)
- 고객이 UI에서 "모드 변경" 불가 — 읽기 전용 표시
- Org Admin도 인프라 모드는 읽기만 가능 (설정 > 인프라 모드 확인)

### G-080-02 — 모드 전환 시

A → B, C → B 등 전환 요청은 **슈퍼 어드민 수동 처리.** 자동 전환 없음.

전환 시 감사 로그 필수 (G-141):
```json
{
  "action": "인프라 모드 변경",
  "actor": "슈퍼 어드민",
  "before": "A 매니지드",
  "after": "B 온프레미스",
  "reason": "고객 요청 — 보안 심사 통과 조건",
  "at": "..."
}
```

---

## 2. 비용 표시 분기 (G-082)

### 2.1 칸반 상단 요약 바

```
TOTAL 48 | ⚡ HITL 3 | DEV 12 | DONE 20 | [모드별 비용]
```

| Mode | 비용 표시 | 클릭 동작 |
|---|---|---|
| A | `오늘 485 tk | 잔여 8,420 tk` | 토큰 충전 페이지 이동 |
| B | **미표시** (또는 `오늘 2.4 CPU시간`) | 인프라 자원 모니터링 |
| C | `오늘 $12.40` | USD breakdown 페이지 |

### 2.2 설정 > 비용 관리

| Mode | 기능 |
|---|---|
| A | 토큰 잔액 + 예산 설정 + 경고 임계치 (50% / 80% / 100%) + 에이전트별 소비 + **충전 버튼** |
| B | **"Mode B는 고객 인프라를 직접 사용합니다. 인프라 자원 모니터링은 설정 > 인프라 상태"** 안내 |
| C | USD 에이전트별 / 모델별 breakdown + 월간 누적 + 고객 API 키 관리 (마스킹) |

### G-082-01 — 비용 표시 금지 사항

- Mode B에 `$` 기호 노출 금지 (잘못된 인상 유발)
- 에이전트 모델명과 함께 비용 표시 금지 (Mode B에서 "Llama-3 $10" 같은 표현)
- 토큰 수치와 USD를 같은 화면에 병기 금지 (Mode A 고객이 혼란)

---

## 3. 세션 배지 분기 (G-083)

에이전트 노드 / 칸반 카드 / 로그에 붙는 세션 배지.

| 에이전트 | Mode A | Mode B | Mode C |
|---|---|---|---|
| 하네스 AI | `Claude Max` | `vLLM Llama-3` | `Claude Opus 4` |
| SSOT Master | `Claude Max` | `vLLM Llama-3` | `Claude Sonnet 4` |
| Scrum Master | `Claude Max` | `vLLM Llama-3` | `Claude Sonnet 4` |
| Tech Leader | `Claude Max` | `vLLM Llama-3` | `Claude Opus 4` |
| BE Developer | `ChatGPT Pro` | `Ollama CodeLlama` | `GPT-4o` |
| FE Developer | `ChatGPT Pro` | `Ollama CodeLlama` | `GPT-4o` |
| QA Verifier | `Claude Max` | `vLLM Llama-3` | `Claude Sonnet 4` |

### G-083-01 — 배지 텍스트 원칙

- Mode A: **상품명** 사용 ("Claude Max", "ChatGPT Pro")
- Mode B: **모델명 + 인프라** ("vLLM Llama-3", "Ollama CodeLlama")
- Mode C: **구체 모델명** ("Claude Sonnet 4", "GPT-4o")

이유: Mode A는 고객이 모델 디테일 신경 안 씀. Mode C는 고객이 API 키 직접 관리하므로 정확한 모델명 필요.

### G-083-02 — 모델명 노출 최소화

Mode A에서 "Claude Sonnet 4 2026-04-15" 같은 버전 노출 금지. 단순 "Claude Max"로 유지.
Mode C에서도 마이너 버전까지는 노출 안 함.

---

## 4. 서브노드 분기 (G-084 — 파이프라인)

파이프라인 AI 노드에 붙는 📊 서브노드(확장 시 카드).

| Mode | 📊 내용 |
|---|---|
| A | 세션 + 토큰 (오늘 / 주간 / 월간) |
| B | 모델명 + 자원률 (CPU% / GPU% / 메모리) |
| C | 모델명 + USD (에이전트별 breakdown) |

🧠 서브노드 (메모리)는 **모드 무관.** 어디서나 동일 표시 (이름 / 건수 / 크기 / 갱신일).

---

## 5. 설정 > 인프라 상태 분기 (G-085)

| Mode | 표시 내용 |
|---|---|
| A | **전용 컴퓨터**: machine-id / 상태 / 업타임 / 세션별 상태 |
| B | **고객 서버**: 엔드포인트 URL / 상태 / 모델 목록 / 최근 헬스체크 |
| C | **미표시** (고객이 직접 API 키 관리, 인프라 개념 없음) |

### G-085-01 — Mode A 전용 컴퓨터 개념

각 고객사에 **전용 가상 머신** 1~N대 배정. machine-id (`machine-a-001` 등)로 식별.

- 고객 A의 컴퓨터가 고객 B의 작업 처리 **금지** (격리)
- 한 컴퓨터에 여러 에이전트 세션 돌지만 **고객 간 격리**

### G-085-02 — Mode B 엔드포인트 관리

슈퍼 어드민이 고객사 설치 시 엔드포인트 등록. 고객은 읽기만:

```
AI Gateway: https://ai.korail-internal.kr/v1
Health: ✅ 응답 시간 45ms (1분 전)
Models: llama-3-70b, codellama-13b, mixtral-8x7b
```

---

## 6. 온보딩 모드별 분기 (G-086)

프로젝트 생성 3단계 위저드의 **스텝 3** 첫 화면:

| Mode | 첫 화면 |
|---|---|
| A | "**그릿지가 전용 AI 인프라를 운영합니다. API 키 불필요.**" + 토큰 잔액 표시 |
| B | "**코드가 귀사 서버를 벗어나지 않습니다.**" + 엔드포인트 확인 배너 |
| C | API 키 입력 UI + **[연결 테스트]** 버튼 → 성공/실패 즉시 표시 |

### G-086-01 — Mode C 연결 테스트

- 고객이 입력한 API 키로 실제 모델 호출 (가벼운 "ping" 쿼리)
- 성공 시 녹색 체크 + 모델 목록 표시
- 실패 시 에러 메시지 + 재시도 버튼
- API 키는 AES-256 암호화 저장 (G-143)

---

## 7. Mode B 특수 규칙 (G-087) — 온프레미스 격리

Mode B는 **엔터프라이즈 고객의 보안 심사 통과**를 위한 핵심 모드.

### G-087-01 — 데이터 반출 절대 금지

다음 데이터는 고객 서버 밖으로 **절대 나가지 않음**:
- 코드 원본
- 적합화 규칙 내용 (그릿지 네트워크 통계용 메타도 X)
- HITL 결정 내용
- 감사 로그
- 에이전트 프롬프트 및 응답

### G-087-02 — 크로스 고객사 통계 제외

**Mode B 고객의 데이터는 그릿지 네트워크 통계(온톨로지 추천 소스)에 포함 안 됨** (G-105).

단, 고객이 **명시적 opt-in** 한 경우 익명 메타 데이터만 참여 가능:
- 도메인 카테고리 (이커머스 / 핀테크 / 물류 등)
- 기술 스택 카테고리 (Spring Boot / Next.js 등)
- 규칙 채택률 (규칙 내용 X, 채택/거부 통계만)

### G-087-03 — Mode B 고객도 크로스 통계 수혜

Opt-in 안 해도 **다른 고객의 익명 통계는 수혜 받음**:
- "유사 프로젝트 92%가 Facade 패턴 선택"
- "이커머스 도메인 87%가 멱등성 키 필수"

이 방향은 단방향 (받기만). Mode B 고객이 "우리만 노하우 내려받고 기여 안 한다"는 **무임승차** 우려는 엔터프라이즈 가치 프로포지션 (보안 > 참여).

### G-087-04 — Mode B 배포 / 업그레이드

- 그릿지가 마이그레이션 스크립트 + 업데이트 릴리즈 노트 전달
- 고객이 자체 배포 파이프라인에서 적용
- PR merge ≠ 고객 배포 (`93_workflow § G-219`)

---

## 8. Mode C 특수 규칙 (G-088) — 고객 API 키

### G-088-01 — 키 관리

- API 키는 UI에 **영구 마스킹** (`sk-ant-****-****-1234`)
- 서버 저장 시 AES-256 암호화 (G-143)
- 키 노출 감사 로그: 누가 언제 무슨 작업에 사용했는지 추적
- 고객이 언제든지 키 회전/삭제 가능 (Zustand `useIntegrationStore`)

### G-088-02 — 벤더별 비용 분리

```
월간 비용:
  Anthropic (Claude): $1,240
  OpenAI (GPT-4o):    $856
  Upstage (Solar):    $42
  Google (Gemini):    $15
  ─────────────────────────
  총:                 $2,153
```

벤더별 breakdown + 에이전트별 breakdown 두 축으로 표시.

### G-088-03 — Rate limit 대응

고객 API 키의 rate limit 초과 시:
- 다른 에이전트 호출 대기열에 넣음 (즉시 실패 X)
- 10분 이상 대기 예상 시 사용자 알림
- **절대 그릿지 키로 fallback 하지 않음** (고객 비용 구조 깨짐)

---

## 9. 모든 모드 공통 원칙 (G-089)

### 9.1 적합화 데이터 소유 = 고객

모드 무관 공통:
- 적합화 규칙 / 아키텍처 정의 / 감사 로그 **= 고객의 것**
- 언제든지 YAML / JSON / ZIP 으로 내보내기 가능
- 서비스 종료 시 전체 ZIP 자동 생성 + 30일 유예 + 완전 삭제 + 확인서

### 9.2 정합성 7원칙 적용

Mode A/B/C 모두 LucaPus 정합성 7원칙(G-025) 적용. 모드가 다르다고 원칙 완화 없음.

### 9.3 UI 분기 원칙 (G-090)

**서버 응답 레벨에서 분기.** 클라이언트 `if (mode === "A")` 패턴 금지.

```typescript
// ❌ 금지 — 클라이언트 분기
const cost = mode === "A" ? formatTokens(tk) : formatUSD(usd);

// ✅ 올바름 — 서버 응답에 이미 mode-aware
const { displayCost } = useCostFromServer(); // 서버가 mode별로 포맷
```

예외: 아이콘 / 색상 등 **표현 계층**만 클라이언트 분기 OK.

### G-090-01 — mode 전환 시 전체 UI 재렌더링

Mode 변경은 거의 없지만, 변경되면:
- `useAuthStore.mode` 변경 → 모든 모드-aware 컴포넌트 재렌더
- 비용 표시 / 세션 배지 / 인프라 상태 탭 / 온보딩 배너 전부 갱신
- WebSocket 권한 이벤트로 즉시 반영

---

## 10. Mode별 구현 난이도 (G-091)

팀 내부 공유용 (외부 비공개):

| Mode | 개발 복잡도 | 운영 복잡도 | 영업 난이도 |
|---|---|---|---|
| A | 낮음 (그릿지 단일 경로) | 중 (컴퓨터 배정 관리) | 낮음 (빠른 시작) |
| B | **높음** (고객별 맞춤 배포) | **높음** (원격 모니터링) | **높음** (보안 심사) |
| C | 중 (키 관리, rate limit) | 낮음 | 중 (비용 투명성) |

---

## 11. Mode × Stage 교차 (G-092)

| Stage | Mode A | Mode B | Mode C |
|---|---|---|---|
| 0 | 라이선스만 | 라이선스 + 초기 배포 지원 | 라이선스 + API 키 검증 |
| 1~2 | 토큰 기반 과금 | 고객 인프라 비용 | USD breakdown |
| 3 | 토큰 + 충전 이벤트 | 자원 모니터링 | USD + 예산 알림 |

---

## 12. 자동 검증 체크리스트

체인 실행 중 Mode 분기 누락 감지 시 Conflict 자동 발동:

- [ ] Mode B 화면에 `$` / 토큰 수치 노출?
- [ ] Mode C 첫 화면에 "API 키 불필요" 배너?
- [ ] 세션 배지가 모드별로 올바르게 표시?
- [ ] 에이전트 모델 직접 변경 UI 존재? (G-025 위반)
- [ ] Mode B 고객 데이터가 크로스 통계 소스로 사용? (G-087-02)
- [ ] Mode C에서 그릿지 키로 fallback 경로 존재? (G-088-03)
- [ ] 클라이언트 `if (mode === ...)` 조건 분기? (G-090 위반)
- [ ] 설정 > 인프라 상태 탭이 모드별로 올바르게 분기?

---

## 12. Mode D — Billing Proxy (G-091) — 4번째 제품 전용

### 12.1 Mode D 정의

**Mode D (Billing Proxy)** = Gridge AI Account MSP 제품의 내부 코드.

기존 Mode A/B/C 가 **AI 실행 레일** (어디서 어떤 LLM 이 실행되는가) 이라면,
Mode D 는 **결제 레일** (어떻게 AI 서비스 비용이 지불되고 청구되는가). 두 축은 **직교**.

```
AI 실행 레일 (Mode A/B/C, 3제품 공통)
      ×
결제 레일 (Mode D, Billing MSP 전용)
```

### G-091-01 — 병행 보유 가능

한 고객사가 **Mode A + Mode D** (또는 Mode B + Mode D, Mode C + Mode D) 를 동시에 계약할 수 있음:

| 시나리오 | 예시 |
|---|---|
| Mode A + Mode D | AiOPS 구독 + Billing MSP 계약 (AI 실행은 Gridge 매니지드, 실결제도 Gridge 리셀러) |
| Mode B + Mode D | 온프레 AiOPS + Billing MSP (내부 LLM 사용하면서도 ChatGPT Team / Claude Team 구독은 Billing 에 위임) |
| Mode C + Mode D | 고객 API 키 사용 + Billing MSP (매입은 고객 키, 실제 구독 서비스만 Billing) |
| Mode D 단독 | Billing MSP 만 계약 (AiOPS / Wiring / LucaPus 없이 결제 관리만) |

### G-091-02 — Mode D 가 다루는 범위 (≠ AI 실행)

- ChatGPT Team / Enterprise / Claude Team / Cursor Business 등 **구독형 SaaS**
- OpenAI / Anthropic / Gemini **API 사용료**
- Lovable / Manus / Replit / v0 등 **에이전트 크레딧**

Mode A/B/C 는 이 중 **API 프록시 레일** 만 관여. Mode D 는 이 모든 **실결제 경로 + 계정 관리 + 청구**.

### G-091-03 — 리셀러 구조 (PG 아님)

```
[Gridge 법인카드] → 그릿지 대지급 → [AI 벤더]
                                          │
                                          ↓ 월말 청구
                    [Gridge] → 재청구 → [고객사]
                                          │
                                          ↓ 입금
                                      [Gridge 수납]
```

**절대 금지**: 고객 자금 → 그릿지 경유 → 가맹점 (PG 경로).
전자금융거래법상 PG 등록 의무 발생 리스크.

상세: `products/billing/rules/reseller.md` (PB-001).

### G-091-04 — 비용 표시 (Mode D 전용)

Mode A/B/C 의 비용 표시 (G-082) 와 **별도 레일**:

| 화면 | Mode A/B/C 표시 | Mode D 추가 표시 |
|---|---|---|
| AiOPS 대시보드 | API 사용량 기반 비용 (추정) | **실결제 금액** (transactions 원장 연계) |
| 고객 포털 `/app/billing` | — (미노출) | 월 청구서 · 크레딧백 · 세금계산서 |
| 운영 콘솔 | — (미노출) | Finance 손익 + Anthropic 패스스루 분리 |

**금지**:
- Mode D 미계약 고객에게 `/app/billing` / `transactions` 노출 금지
- Mode D 의 `gridge_margin_krw` 를 AiOPS / Wiring UI 에 노출 금지 (내부·외부 정보 분리, PB-005-05)

### G-091-05 — Mode D 와 Mode A 의 경계

중요: Mode A 는 **Gridge 관리 API 키로 AI 실행 비용을 대납** — 이 비용은 **Mode D 와 무관**.

- Mode A 의 AI 실행 비용 = Wiring 라이선스에 포함 (별도 BM)
- Mode D 의 결제 관리 대상 = **고객사 자체 AI 서비스 구독**

두 비용 절대 혼동 금지. `transactions` 테이블은 Mode D 만, Mode A 의 내부 API 호출 비용은 `aiops.logs` 에 기록 (별도).

### G-091-06 — 감사 로그 분리

- Mode A/B/C 감사: Wiring · AiOPS · LucaPus 각자 `audit_logs`
- Mode D 감사: `products/billing/schemas/` 의 `audit_logs` (별도 테이블)

동일 이름 `audit_logs` 라도 **물리적 별도 테이블** (namespace 분리).

### G-091-07 — 자동 검증 체크리스트

- [ ] Mode D 계약 없이 `/app/billing` 접근 가능?
- [ ] 고객 자금이 그릿지 계좌를 경유하는 결제 경로 존재?
- [ ] Mode A 의 AI 실행 비용과 Mode D 의 리셀러 매출 혼동?
- [ ] Mode D 감사 로그가 Wiring / AiOPS 포털에 노출?
- [ ] `gridge_margin_krw` 필드가 고객 포털 API 응답에 포함?

### 12.2 Mode D 참조

- 제품 라우터: `products/billing/CLAUDE.md`
- 핵심 규칙: `products/billing/rules/reseller.md` (PB-001), `billing_tier.md` (PB-003), `immutable_ledger.md` (PB-005)
- 18 테이블 카탈로그: `products/billing/schemas/INDEX.md`

---

## 13. 참조

- 모드 정의 출처: `01_product.md § 6` (BM)
- UI 분기 원칙: `03_hierarchy.md § 9` (G-052 서버 필터링)
- LucaPus 정합성 7원칙: `02_architecture.md § 5` (G-025)
- 온톨로지 Mode B 제외: `06_hitl.md § 4.2` (G-105)
- 세션 배지 구현: `products/wiring/rules/session_badge.md` (작성 예정)
- 비용 표시 구현: `products/wiring/rules/cost_display.md` (작성 예정)
- 배포 파이프라인: `93_workflow § G-219` (Mode별 배포 차이)
- 감사 로그 포맷: `08_security.md` (G-141)
