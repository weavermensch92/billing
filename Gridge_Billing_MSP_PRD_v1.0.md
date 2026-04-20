# Gridge Billing MSP — PRD v1.0

> **문서 목적**: Gridge AIMSP Claude Code 하네스 (v0.27 / 314 rule IDs / 219 .md) 위에서 **Billing MSP** (Mode D 결제 레일 제품) 을 실제 개발하기 위한 제품 요구사항 명세 + 실행 계획.
>
> **대상**: 개발팀 (Claude Code 주관), Luna AM, Alpha 고객 의사결정자.
>
> **적용 범위**: Phase 0 Alpha (최초 3개월) 중심. Phase 1 ~ 2 는 로드맵으로 기술.
>
> **관련 문서**:
> - 하네스 룰북 `@gridge-ai/aimsp-harness@0.27.0`
> - 원본 기획: `01_서비스_정의.md`, `02_시스템_아키텍처.md`, `03_데이터_모델.md`
> - 규칙: `rules/PB-001 ~ PB-013` + `G-091 Mode D`
> - Playbook: `playbook/*.md` (7 SOP)

---

## 0. 문서 요약 (TL;DR)

| 항목 | 요약 |
|---|---|
| **제품명** | Gridge Billing MSP (결제 관리형 서비스) |
| **한 줄 정의** | AI 서비스 결제를 법인카드 대신 리셀러 구조로 대행 + 10% 크레딧백 + 전담 AM 제공 |
| **차별화** | 리셀러 구조 (PG 아님) + Service-First UX + Anthropic 파트너십 패스스루 |
| **Alpha 타깃** | 1개사 (3개월 무사고 운영) |
| **성공 지표** | 월말 오차율 < 0.5% / SLA 95%+ / NPS ≥ 8 / Anthropic 승인 |
| **개발 주체** | Claude Code (하네스 기반) + Luna (운영) + 위버 (Super) |
| **예상 일정** | D-7 준비 → D+0 Go-Live → D+30 첫 청구 → D+90 Phase 0 완료 |
| **Phase 1 전환** | 카드사 B2B API / 오픈뱅킹 / Smart Bill API 자동화 |
| **Phase 2** | 다수 고객사 + 표준 상품화 + SSO + ML 이상 감지 |

---

## 1. 제품 비전 / 문제 정의

### 1.1 해결하려는 문제 (Problem)

한국 중소·중견 기업 (10~200명 규모) 의 **AI 도구 법인 결제 실무** 는 현재 다음 고통을 겪음:

1. **법인카드 사용 제약** — Claude Team, ChatGPT Team 등 다수 AI 서비스가 해외 결제 · 구독 모델 → 법인카드 승인 거부 / 불규칙 지출로 회계 혼란
2. **개별 관리 지옥** — 멤버 × 서비스 매트릭스가 폭증. 퇴사 시 해지 누락 → 연 수백만 원 누수
3. **비용 투명성 부재** — "누가 / 무엇을 / 얼마" 매월 파편화된 영수증으로 집계. CFO 의무화된 비용 센터 분류 불가
4. **세금계산서 처리** — 해외 사업자 발행 불가 → 자체 비용 처리 난이도 폭증
5. **규정 준수 리스크** — 각 AI 벤더 약관의 법인 사용 허용 여부 판단 / 재판매 가능성 등을 기업이 자체 검토 불가

### 1.2 제공하는 가치 (Value)

Gridge Billing MSP 는 위 문제들을 **리셀러 구조** 로 통합 해결:

- **Gridge 법인 명의** 로 한국 카드사 VCN (Virtual Card Number) 발급 → 각 AI 서비스에 등록
- **Gridge → Anthropic / OpenAI / Cursor 등** 으로 원화 결제 + USD 매입
- **고객 → Gridge** 로 매월 한국 원화 청구서 + **세금계산서 발행** (Smart Bill 경유)
- **10% 크레딧백** 6개월간 → 신규 유치 유인 + 장기 관계 구축
- **전담 AM Luna** 가 개설 · 해지 · 거절 대응 · 월간 리뷰 전담 → 고객 셀프서비스 부담 0

### 1.3 사업적 포지션

| 경쟁 영역 | 경쟁자 | Gridge 차별화 |
|---|---|---|
| 법인카드 대안 | Brex, Ramp | 한국 서비스 / 전담 AM / AI 특화 |
| 결제 대행 | PG사 (나이스/KG 등) | PG 아님 (리셀러 구조) / AI 서비스 카탈로그 |
| 비용 관리 SaaS | Spendesk | 결제 레일 직접 소유 / AI 벤더 파트너십 |
| AI 관측 도구 | (AiOPS) | 같은 고객에게 패키지 (Billing → AiOPS 업셀) |

**핵심 전략**: Billing → AiOPS / Wiring 으로 **번들 전환 20%+ / 10%+** 달성. 크레딧백 6개월 = CSM 릴레이션 구축 기간.

---

## 2. 목표 사용자 / 페르소나

### 2.1 1차 고객 (Buyer)

**Alpha 페르소나**: AI 도입 중견 기업 CTO / 개발팀 리드

| 속성 | 값 |
|---|---|
| 조직 규모 | 10~200명 (개발팀 5~50명) |
| AI 도구 수 | 5~15개 (ChatGPT, Claude, Cursor 등 혼합) |
| 월 AI 지출 | 300만 ~ 3,000만 원 |
| 현재 결제 방식 | 개인 법인카드 / 모두 대표 개인카드 |
| 핵심 고통 | 관리 혼란 + 세금계산서 없어 회계 처리 곤란 |
| 의사결정권자 | CTO (실무) + CFO (예산) |
| 도입 Trigger | 1) AI 지출 가시성 요구 (CFO) / 2) 퇴사 시 누수 발견 |

### 2.2 2차 사용자 (Users)

| 역할 | 사용 화면 | 주요 액션 |
|---|---|---|
| **Owner** (조직 대표, 1명) | `/app/*` 전체 | 조직 설정 / 예산 승인 / 해지 결정 |
| **Admin** (보통 CTO, 1~3명) | `/app/services`, `/app/requests` | 신규 요청 / 한도 관리 / 멤버 관리 |
| **Member** (개발자 등, 5~50명) | `/app/services`, 본인 내역 | 본인 계정 조회 / 요청 제출 |
| **CFO / Finance** | `/app/billing` | 월별 청구서 / 세금계산서 다운로드 |

### 2.3 운영 주체 (Gridge Side)

| 역할 | 인원 | 역할 |
|---|---|---|
| **Luna (AM)** | 1 | 고객 계정 / 요청 처리 / CSM 월간 리뷰 |
| **위버 (Super)** | 1 | Super admin / 약관 실사 / 고액 승인 / 법무 |
| **Phase 1+** | Finance 전담 / Ops | 월말 마감 / 거절 대응 / 이상 감지 |

---

## 3. 성공 지표 (KPI)

### 3.1 Alpha 단계 지표 (Phase 0, 3개월)

**기술 / 운영**:
| 지표 | 목표 | 측정 |
|---|---|---|
| VCN 해외결제 승인률 | ≥ 95% | `transactions.status` 기반 |
| 월말 정산 오차율 | < 0.5% | 청구 총액 대비 실결제 오차 |
| 거절 대응 SLA | ≥ 95% (24h 내) | `action_requests.sla_deadline` |
| SLA 준수율 전체 | ≥ 95% | 모든 요청 유형 |
| 운영 공수 | ≤ 월 40시간 | Luna 1인 수용 가능 수준 |

**재무 / 고객**:
| 지표 | 목표 | 측정 |
|---|---|---|
| Alpha 월 매출 | ≥ ₩500만 | 3개월 연속 |
| NPS | ≥ 8 | D+90 설문 |
| 이탈 (D+90 이내) | 0건 | - |
| Anthropic 파트너십 승인 | ✅ | 1건 |

### 3.2 Phase 1 전환 조건

Alpha 3개월 종료 시 `scripts/phase-check.js 0-to-1` 16개 자동 + 8개 수동 체크포인트 100% 통과 시 Phase 1 개시.

### 3.3 Phase 2 장기 목표

- 고객 5개사 → 20개사 (18개월)
- Billing → AiOPS 전환율 ≥ 20%
- Billing → Wiring 전환율 ≥ 10%
- 매출총이익률 ≥ 10% (크레딧백 종료 고객)

---

## 4. 범위 (Scope)

### 4.1 Phase 0 Alpha 포함 (In Scope)

**제품 기능**:
- [F1] 고객 포털 (`app.gridge.ai`) 15 화면 (customer)
- [F2] 운영 콘솔 (`console.gridge.ai`) 7 화면 (console + csm + super)
- [F3] Supabase DDL 28 테이블 (P1 12 + P2 16)
- [F4] 요청 워크플로 (5 유형 + bulk_terminate)
- [F5] 3단 결제 티어 (Alpha = tier 1 monthly 기본)
- [F6] 크레딧백 10% × 6개월 (월별 적용)
- [F7] Service-First UX (PB-008)
- [F8] 회계 분리 엔진 (PB-009)
- [F9] 감사 가시성 3분할 (PB-010)
- [F10] 이상 감지 룰 9종 (PB-012)

**운영**:
- [O1] 카드사 포털 수동 VCN 발급 (신한 V-Card)
- [O2] Smart Bill 웹 로그인 수동 발행
- [O3] 오픈뱅킹 수동 매칭
- [O4] Luna 1인 전담 운영
- [O5] 7 Playbook SOP

**파트너십 / 법무**:
- [P1] Anthropic 파트너십 (패스스루 10%)
- [P2] 벤더 약관 실사 15+ 서비스 (approved / conditional / rejected)
- [P3] 법무·세무 자문 완료 (전자금융거래법 경계)

### 4.2 Phase 0 제외 (Out of Scope)

다음은 Phase 1 이후:
- 카드사 B2B API 자동화
- Smart Bill API 연동
- 오픈뱅킹 웹훅 자동 매칭
- 백업 카드사 (KB SmartPay)
- 1Password Connect 자동화
- SSO (SAML / OIDC / SCIM)
- 해외 VCN (Wise / Airwallex)
- 표준화된 고객 온보딩 자동화
- ML 기반 이상 감지

### 4.3 영구 제외 (Never)

- **전자지급결제대행 (PG) 등록** — 리셀러 구조 전제 위반, PB-001 원칙
- **결제 정보 (카드 전체 번호, CVV)** 고객 포털 노출 — 1Password 경유 전용
- **`결제 대행` 용어** 외부 표시 — G-004 금지어 (PR 자동 차단)
- **Owner 계정 오프보딩** — Owner 양도 후에만 가능
- **감사 로그 수정 / 삭제** — Immutable PB-005

---

## 5. 기능 요구사항 (Functional Requirements)

### 5.1 조직 관리 (Org Management)

#### F1.1 조직 생성
- **입력**: Gridge 계약 체결 시 Super 가 수동 생성 (Phase 0)
- **필드**: 사업자등록번호 (immutable), 조직명, 결제 티어, 크레딧백 시작일
- **트리거**: Phase 1+ 자동 온보딩 (사업자등록증 OCR → orgs INSERT)
- **규칙 참조**: `rules/reseller.md` (PB-001), `schemas/tables/orgs.md`
- **HITL**: Super 최종 승인 (L6 급)

#### F1.2 Owner / Admin / Member 초대
- **UI**: `/app/org/members/new`
- **흐름**: 이메일 + 이름 + 역할 선택 → Supabase Auth `inviteUserByEmail` → `members INSERT (status='invited')`
- **제약**: Owner 는 조직당 **1명만** (PB-001-03)
- **감사**: `audit_logs INSERT (visibility='both', action='member_invited')`

#### F1.3 Owner 양도
- **UI**: `/app/org/members` → Owner 본인 메뉴 [Owner 양도]
- **보안**: 본인 이메일 재입력 확인
- **트랜잭션**: `members.role` 양측 동시 UPDATE (원자적)
- **Owner 오프보딩**: 양도 없이 불가능

#### F1.4 멤버 오프보딩 (PB-011)
- **UI**: `/app/org/members/[id]/offboarding` 3단계 wizard
- **Step 1**: 영향 미리보기 (계정 N개 + 월 절감 예상)
- **Step 2**: 계정별 3가지 옵션 (즉시 해지 / 이관 / 유지)
- **Step 3**: 본인 비밀번호 확인 + 제출
- **Backend**: 부모 `action_requests (bulk_terminate)` + 자식 N개 + `offboarding_events INSERT`
- **처리**: VCN suspended → 7일 유예 → revoked 자동 배치
- **규칙**: `rules/offboarding.md`

### 5.2 계정 / VCN 관리 (Account & VCN)

#### F2.1 신규 계정 요청
- **UI**: `/app/services/new` 5유형 wizard (Step 1 "신규 계정" 선택)
- **입력**: 대상 멤버 / 서비스 (tos_review_status approved/conditional) / 월 한도 / 해외결제 / 사용 목적
- **검증**: `services.tos_review_status != 'rejected'` (차단)
- **Backend**: `action_requests INSERT (action_type='new_account')`
- **AM 처리 (Luna)**: `/console/requests/[id]` 에서 Full Path 기본 승인
- **카드사 발급**: 신한 V-Card 포털 수동 (Phase 0) / API (Phase 1)
- **1Password 공유**: 7일 유효 링크 자동 생성
- **고객 확인**: `status = 'awaiting_customer'` → 고객 [교체 완료 확인] 클릭 → `active`

#### F2.2 VCN 상태 머신 (9단계) — PB-002
```
pending → approved → issuing → issued → delivered → active
                                                      │
                                                      ├ suspended → revoked
                                                      └ expired (자동)
```
- **DDL 트리거**: 불가능 전이 DB 레벨 차단
- **UI**: `/console/vcn/[id]` 수평 플로우 시각화
- **전체 번호 조회**: Super 전용 + 사유 입력 필수 + `audit_logs (visibility='internal_only')`
- **규칙**: `rules/vcn.md`, `schemas/tables/virtual_cards.md`

#### F2.3 한도 변경 (PB-008 Fast/Full Path)
- **Fast Path**: 현재 한도 × 1.5배 이내 증액 → AM 즉시 승인 (SLA 30분)
- **Full Path**: × 2배 이상 or 감액 → Super 승인 필요 (SLA 2~24h)
- **자동 판단**: `suggestFastPath()` 로직, UI 자동 제안
- **Phase 1+**: 카드사 API 자동 반영

#### F2.4 결제 거절 대응 (PB-012)
- **감지**: 카드사 CSV (Phase 0) / 웹훅 (Phase 1) → `transactions INSERT (status='declined')`
- **자동 감지 룰**: `decline_burst` (5분 내 10건+) → `anomaly_events INSERT (severity=critical)` + `pause_vcn_issuance` 자동 액션
- **UI**: `/console/payments/declined` 거절 큐 (SLA 기반 정렬)
- **대응 체크리스트**: 1) 원인 파악 → 2) VCN 설정 변경 → 3) 카드사 포털 반영 → 4) 고객 통지 → 5) 재시도 확인
- **SOP**: `playbook/decline-response.md`
- **SLA**: 24시간 내 조치

### 5.3 결제 / 청구 (Payment & Billing)

#### F3.1 결제 수집
- **Phase 0**: 일일 CSV 수동 import (아침 Luna 업무)
- **Phase 1**: 카드사 웹훅 실시간 (HMAC 서명 검증)
- **저장**: `transactions` 테이블 + 회계 분리 3필드 자동 계산 (PB-009)
- **Anthropic 패스스루**: `is_anthropic_passthrough` 자동 플래그

#### F3.2 회계 분리 엔진 (PB-009)
- **필드**: `amount_krw`, `gridge_cost_krw`, `customer_charge_krw`, `gridge_margin_krw`, `is_anthropic_passthrough`
- **Trigger**: `enforce_accounting_fields` DDL (INSERT/UPDATE BEFORE) → 누락 자동 채움 + 검증
- **고객 포털 뷰**: `v_transaction_customer` (gridge_cost / margin 숨김)
- **내부 뷰**: `v_transaction_internal`, `v_finance_mtd`
- **Finance 대시보드**: 벤더별 매출 / 원가 / 마진 / 크레딧백 분리

#### F3.3 월말 청구서 발행
- **배치**: M+1일 00:30 ~ 03:00
- **플로우**:
  1. 00:30 월말 transactions 확정 (settled 검증)
  2. 02:00 교차 검증 (AiOPS ↔ Billing, I-004)
  3. 03:00 `invoices INSERT (status='draft')` 각 조직별
  4. M+1일 09:00 Finance 검수 큐 업로드
  5. 검수 완료 → `status='issued'` + Smart Bill 수동 발행 (Phase 0)
  6. Smart Bill 확인 → `tax_invoice_id` UPDATE
  7. 고객에 이메일 발송
- **3단계 금액 breakdown**: subtotal_before_creditback → -credit_amount → subtotal → +VAT(10%) → total_due
- **고액 청구서** (≥ ₩10M): Super 2차 승인 필수
- **규칙**: `rules/billing_tier.md` (PB-003), `rules/creditback.md` (PB-004)

#### F3.4 크레딧백 (PB-004)
- **정책**: 월 청구액의 10% × 6개월
- **적용 시점**: M+1월 청구서 발행 시 `credit_backs INSERT` + `invoices.subtotal_krw` 반영
- **M6 Final**: `final_creditback_applied = TRUE` 플래그 + 고객 포털 특별 경고
- **UI**: `/app/billing/creditback` 6개월 진행바 + D-30 경고 배너 + Wiring / AiOPS 업셀 연계

#### F3.5 세금계산서 (Smart Bill)
- **Phase 0**: Finance 가 Smart Bill 웹 수동 발행 후 `tax_invoice_id` 입력
- **Phase 1**: Smart Bill API 자동 발행 (`POST /api/issue` + 웹훅)
- **수정 발행**: 오류 발견 시 취소 + 재발행 (연속 거래번호 규정 준수)
- **SOP**: `playbook/smartbill.md`

#### F3.6 수납 매칭 (Phase 1+)
- **Phase 0**: Finance 가 은행 앱 수동 확인 → `payment_receipts INSERT` + `invoices.status='paid'`
- **Phase 1**: 오픈뱅킹 웹훅 → 자동 매칭 (금액 + 송금인명 + ±3일 범위)
- **미매칭**: Finance 큐에 표시 (`match_confidence = 'unmatched'`)

#### F3.7 연체 관리 (PB-012 + overdue_actions)
- **자동 단계**:
  - D+1: 친절한 알림 (자동)
  - D+7: 경고 + Luna 직접 연락 (자동 + 수동)
  - D+14: VCN 중지 예고 (수동 판단)
  - D+30: VCN 일시 중지 (Super 승인 필수)
  - D+60: 계약 해지 검토 (법무 자문)
- **UI**: `/console/billing/overdue`

### 5.4 감사 / 가시성 (Audit)

#### F4.1 Audit Logs (Immutable, PB-005)
- **DDL**: `UPDATE / DELETE RULE ... DO INSTEAD NOTHING`
- **3분할 visibility**: `customer_only` / `internal_only` / `both` (PB-010)
- **자동 트리거**: 각 테이블 INSERT/UPDATE 시 `audit_logs INSERT`
- **마스킹**: `both` 중 민감 필드 (`gridge_margin_krw`, 전체 VCN 번호) 는 고객 측에서 `***`
- **UI**: 
  - 고객: `/app/settings/audit-log` (customer_only + both 마스킹)
  - 내부: `/console/orgs/[id]` 메모 탭 (internal_only + both 전체)

#### F4.2 Data Export (PB-010)
- **UI**: `/app/settings/data-export` (Owner 전용)
- **유형**: 전체 ZIP (주 1회) / 부분 CSV (일 3회) / 세금계산서 PDF
- **ZIP 구조**: organization / accounts / transactions / invoices / requests / audit_logs
- **민감 제외**: VCN 전체 번호 / gridge_margin / csm_notes
- **만료**: 7일 유효 URL
- **해지 자동**: `orgs.status = 'terminating'` 트리거 시 자동 ZIP 생성

### 5.5 알림 / 설정

#### F5.1 알림 설정 (Member 개별)
- **UI**: `/app/settings/notifications`
- **차원**: 채널 3종 (email / slack / sms) × 이벤트 14종 × enabled
- **테이블**: `notification_preferences`
- **조회 로직**: 본인 설정 → 조직 기본값 → 시스템 기본값 3단계 fallback
- **Owner 기본값**: 조직 전체 신규 멤버에 적용

#### F5.2 Slack Connect (Phase 0 필수)
- **설정**: Owner 가 `/app/settings/integrations` 에서 연결
- **양측 동의**: 고객 초대 + Gridge Luna 수락 (자동 플로우)
- **이벤트 전파**: 결제 거절 / AM 메시지 / 요청 승인 필요 / 크레딧백 D-30

#### F5.3 2FA / 세션 / IP 화이트리스트
- **UI**: `/app/settings/security`
- **2FA**: TOTP + 백업 코드 10개 (개별)
- **세션 타임아웃**: Owner 가 조직 정책 설정 (15m / 30m / 1h / 4h)
- **IP 화이트리스트**: CIDR 표기 (Phase 1+, 엔터프라이즈 전환 고객만)

### 5.6 운영 콘솔 (Gridge Side)

#### F6.1 AM 홈 (Luna 출근 시작점)
- **UI**: `/console/home` (역할별 차등: AM / Super / Finance / Ops)
- **AM 뷰**: 오늘 할 일 (긴급 / 요청 큐 / 승인 대기 / 오늘 미팅) + 담당 고객사 카드 + 업셀 시그널 카드
- **실시간**: Supabase Realtime 구독

#### F6.2 고객사 상세 (8탭)
- **UI**: `/console/orgs/[id]`
- **탭**: Overview / 계정 / 결제 / 청구서 / 요청 / 멤버 / 팀 / 메모
- **상단 액션**: 신규 요청 대신 제출 / 월간 리뷰 예약 / 업셀 시그널 수동 생성 / 계약 편집 (Super)

#### F6.3 요청 처리 워크플로
- **UI**: `/console/requests/[id]` 3컬럼 (요청 정보 / 처리 체크리스트 / 메시지 스레드)
- **유형별 체크리스트**: new_account / terminate / limit_change / vcn_replace / decline_response / bulk_terminate
- **progress_state JSONB**: 각 단계 완료 시 자동 기록
- **Fast/Full Path**: PB-008-05 규칙 기반 자동 제안

#### F6.4 CSM 월간 리뷰
- **UI**: `/console/csm/reviews/[id]` 자동 준비 노트
- **auto_summary_data**: 매출 / MoM / 거절율 / SLA / 크레딧백 진행 자동 집계
- **prepared_talking_points**: AI 기반 5개 추천 대화 포인트
- **완료 시**: `csm_notes INSERT (visibility='internal_only')` 자동

#### F6.5 서비스 카탈로그 관리 (Super 전용)
- **UI**: `/console/super/services`
- **4단계**: approved / conditional / rejected / pending
- **가격 정책**: passthrough (현재) / cost_plus_2pct / fixed_markup_10k (Phase 2+)
- **분기 재검토**: 자동 알림 배치

---

## 6. 비기능 요구사항 (Non-Functional Requirements)

### 6.1 성능

| 영역 | 목표 | 측정 |
|---|---|---|
| 고객 포털 페이지 로드 | < 2초 (p95) | Vercel Analytics |
| API 응답 | < 500ms (p95) | Supabase Edge / Next.js Route |
| 실시간 갱신 지연 | < 3초 | Supabase Realtime |
| 월말 배치 (Alpha 1개사) | < 30분 | 매 M+1일 00:30~03:00 |
| 월말 배치 (Phase 2, 20개사) | < 2시간 | 병렬 처리 |

### 6.2 보안

- **인증**: Supabase Auth (Magic Link Phase 0) → SSO (Phase 2)
- **권한**: RLS (Row Level Security) 모든 테이블 + 3단 멤버 role (Owner/Admin/Member)
- **운영 콘솔**: 독립 Admin Auth + 2FA 강제 + IP 화이트리스트
- **VCN 전체 번호**: DB 미저장 (카드사만 보유) + Super 조회 시 감사 로그 필수
- **감사 로그**: Immutable (PB-005) + 3년 보관
- **Secret 관리**: Supabase Vault (카드사 토큰 / Smart Bill API 키 / Slack bot token)
- **HTTPS**: TLS 1.3 (Vercel 자동)
- **감사 표준**: 추후 ISO 27001 / SOC 2 대비 (Phase 2)

### 6.3 가용성

| 영역 | 목표 |
|---|---|
| 고객 포털 (`app.gridge.ai`) | 99.5% (월 3.6시간 다운 허용, Alpha) |
| 운영 콘솔 (`console.gridge.ai`) | 99.9% (월 44분) |
| 월말 배치 실패 시 | 자동 알림 + 4시간 내 수동 복구 SOP |
| 재해 복구 (RPO/RTO) | RPO 1시간 / RTO 4시간 (Phase 0) → RPO 15분 / RTO 1시간 (Phase 2) |

### 6.4 확장성

- **Alpha** (1개사, 월 ~150 transactions): Supabase free tier 수용
- **Phase 1** (5개사, 월 ~1,000 transactions): Supabase Pro
- **Phase 2** (20개사, 월 ~10,000 transactions): Supabase Pro + 월 단위 logs 파티셔닝

### 6.5 규제 준수

- **전자금융거래법**: 리셀러 구조로 PG 등록 불필요 (법무 자문 완료 전제)
- **개인정보보호법**: 멤버 이메일 / 이름 / 전화번호 / IP 수집, 3년 보관 후 파기
- **부가가치세법**: 세금계산서 발행 의무 (Smart Bill 경유)
- **외국환거래법**: USD 결제는 Gridge 명의로, 고객은 KRW 만 인식
- **해지 후 데이터**: 법정 보존 3년 + 이후 파기 + 증빙

### 6.6 접근성 (A11y)

- WCAG 2.1 AA 기준 고객 포털 (Phase 1 목표)
- 한국어 / 영어 이중 지원 (Phase 2)
- 색맹 친화 팔레트

---

## 7. 기술 아키텍처

### 7.1 스택

```
Frontend (고객 포털 + 운영 콘솔):
  Next.js 14 App Router
  TypeScript (strict 모드)
  Tailwind CSS + shadcn/ui
  Zustand (상태)
  Supabase JS Client (RLS + Realtime)
  Pretendard + Geist Mono

Backend:
  Next.js Server Actions + API Routes
  Supabase (PostgreSQL + Auth + Storage + Realtime + Vault)
  Cron: Vercel Cron (Phase 0) → Supabase Cron (Phase 1)

Integrations:
  카드사: 신한 V-Card 포털 (수동) → API (Phase 1)
  세금계산서: Smart Bill 웹 (수동) → API (Phase 1)
  오픈뱅킹: Finance 수동 → 웹훅 (Phase 1)
  1Password: Owner 수동 → Connect (Phase 1)
  Slack: Slack Connect API
  
Monitoring:
  Vercel Analytics (페이지 퍼포먼스)
  Supabase Logs (DB / API)
  Sentry (에러)
```

### 7.2 배포

- **Hosting**: Vercel (Frontend) + Supabase (DB / Auth / Storage)
- **Domain**: `app.gridge.ai` (고객) / `console.gridge.ai` (운영)
- **환경**: `dev` / `staging` / `production` (Phase 1 이후 3 환경)
- **CI/CD**: GitHub Actions (validate + test + install-test in `.github/workflows/validate.yml`)
- **마이그레이션**: Supabase Migration CLI (수동 apply Phase 0 → 자동 Phase 1)

### 7.3 데이터베이스

- **총 테이블**: 28개 (Billing) + 13 Views
  - P1: 12 (orgs, members, admin_users, org_contracts, services, accounts, virtual_cards, transactions, invoices, credit_backs, audit_logs, action_requests)
  - P2: 16 (teams, am_assignments, offboarding_events, anomaly_events, anomaly_rules, request_messages, request_events, usage_snapshots, payment_receipts, overdue_actions, export_jobs, notification_preferences, csm_notes, monthly_reviews, upsell_signals, + 기타)
- **스키마 분리**: `billing.*` (AiOPS `aiops.*` 와 물리적 분리 G-091-06)
- **마이그레이션 순서**: `schemas/INDEX.md § 마이그레이션 순서` 참조

### 7.4 Claude Code 하네스 활용

개발 작업은 **`@gridge-ai/aimsp-harness@0.27.0`** 룰북 위에서 진행:

```bash
# 신규 프로젝트 초기화 (Alpha 저장소)
cd /Users/dev/gridge-billing
npm install --save-dev @gridge-ai/aimsp-harness
npx gridge-harness init --yes
# → .claude/ 디렉토리 생성, 219 .md 룰북 배포
# → CLAUDE.md 라우터 자동 인식

# 개발 시작
claude
> "요청 처리 워크플로 구현해줘"
# → 하네스가 자동 라우팅:
#   - 제품: Billing (product router)
#   - 규칙: PB-008 Service-First, PB-010 audit_visibility
#   - 스키마: action_requests, request_events, request_messages
#   - 스크린: console/request_detail.md
#   - Sprint 우선순위 확인 → 2 Sprint
# → 4축 확정 + 체인 실행 + 자가 검증 + PR 생성
```

**하네스 기대 효과**:
- 규칙 위반 자동 감지 (16개 표준 + PB-001~013)
- `phase-check.js 0-to-1` 자동 체크포인트
- 감사 로그 immutable 강제
- `G-091 Mode D` 직교 축 격리 (Wiring / AiOPS 와 분리)

---

## 8. 일정 / 마일스톤 (Roadmap)

### 8.1 개발 일정 (Phase 0 Alpha)

| 기간 | 단계 | 산출물 | 체크포인트 |
|---|---|---|---|
| **D-14 ~ D-7** | 준비 | Supabase 프로젝트 / 서비스 카탈로그 seed / Luna 콘솔 교육 | 파트너십 승인 체크 |
| **D-7 ~ D-1** | Sprint 1 (1 주) | 고객 포털 home / services / services/[id] · 콘솔 home / orgs 기본 | `playbook/phase0-day1-runbook.md § D-7` |
| **D+0** | Go-Live | Alpha 고객 온보딩 + 첫 VCN 발급 | Luna 현장 지원 |
| **D+1 ~ D+7** | Sprint 2 (1 주) | services_new wizard / requests / request_detail 콘솔 | 첫 요청 처리 |
| **D+8 ~ D+21** | Sprint 3 (2 주) | billing / creditback / vcn_detail / invoice_detail / payments | 첫 거절 대응 대비 |
| **D+22 ~ D+30** | Sprint 4 | audit_log / data_export / org_members / settings 4종 | 월말 배치 대비 |
| **D+30** | 첫 청구서 | 4월 청구서 Finance 검수 → Smart Bill 발행 | `playbook/month-end-close.md` 실전 |
| **D+30 ~ D+90** | 운영 안정화 | 거절 대응 / 월간 리뷰 / 크레딧백 M1~M3 | NPS 측정 |
| **D+90** | Phase 0 완료 | `phase-check.js 0-to-1` 실행 | Phase 1 전환 or Alpha 연장 결정 |

### 8.2 Sprint 1 상세 (D-7 ~ D-1) — Go-Live 최소 요건

**목표**: 로그인 + 계정 조회 + VCN 수동 발급 흐름 작동

- [ ] [Day 1] Supabase 프로젝트 + 기본 테이블 12개 migrate
- [ ] [Day 1] RLS 정책 전체 테이블 적용
- [ ] [Day 2] `/app/login` Supabase Magic Link
- [ ] [Day 2] `/app/home` StatCard 4개 기본
- [ ] [Day 3] `/app/services` 카드 뷰 + 4탭
- [ ] [Day 3] `/app/services/[id]` 계정 상세 드로어
- [ ] [Day 4] `/console/login` Admin Auth + 2FA 기본
- [ ] [Day 4] `/console/home` AM 뷰
- [ ] [Day 5] `/console/orgs` 리스트 + `[id]` overview 탭
- [ ] [Day 5] 서비스 카탈로그 seed 10+ (PB-006 `approved`)
- [ ] [Day 6] Alpha 고객 직접 계정 생성 (Super 수동)
- [ ] [Day 6] 첫 VCN 1개 수동 발급 + 1Password 공유 테스트
- [ ] [Day 7] Luna 콘솔 교육 + playbook 숙지

### 8.3 Sprint 2 (D+1 ~ D+7) — 첫 실 요청 처리

- [ ] `/app/services/new` 5유형 wizard (new_account 만 우선)
- [ ] `action_requests` + `request_events` + `request_messages` 테이블 active
- [ ] `/app/requests` 리스트 + 상세 드로어 (진행상황 / 메시지)
- [ ] `/console/requests` 큐 + `/console/requests/[id]` 처리 워크플로
- [ ] Supabase Realtime 구독 (action_requests + request_messages)
- [ ] Slack Connect 알림 연동 (Owner 초대 플로우)
- [ ] 멤버 초대 기본 (`/app/org/members` + `members/new`)

### 8.4 Sprint 3 (D+8 ~ D+21) — 청구서 + 거절 + 크레딧백

- [ ] `/app/billing` 청구서 리스트 + 상세 드로어
- [ ] `/app/billing/creditback` 6개월 진행바
- [ ] `transactions` 테이블 + 회계 분리 엔진 DDL 트리거
- [ ] `/console/vcn/[id]` 9단계 상태 머신 시각화
- [ ] `/console/payments` 실시간 피드 + 거절 큐
- [ ] `/console/billing/[id]` 월말 검수 UI
- [ ] Anomaly rules seed 9종 + `anomaly_events` 기본 감지
- [ ] `decline-response.md` SOP 콘솔 UI 임베드

### 8.5 Sprint 4 (D+22 ~ D+30) — 감사 + 설정 + 월말 준비

- [ ] `/app/settings/audit-log` + `visibility` 필터 + CSV 내보내기
- [ ] `/app/settings/data-export` + `export_jobs` + Supabase Storage 연동
- [ ] `/app/org/members/[id]/offboarding` 3단계 wizard (기본)
- [ ] `/app/settings/notifications` + `notification_preferences`
- [ ] `/app/settings/security` 2FA 기본
- [ ] 월말 배치 (`invoice_generation_batch`) 테스트 (fake data)
- [ ] Smart Bill 테스트 계정 발행 리허설 1회

### 8.6 Phase 1 로드맵 (D+90 ~ D+270, 6개월)

**전제**: Phase 0 Alpha 체크포인트 통과

**기술 전환**:
- [ ] 카드사 B2B API (신한 V-Card + KB SmartPay 백업) 계약 + 샌드박스
- [ ] Smart Bill API 자동 발행 (`POST /api/issue` + webhook)
- [ ] 오픈뱅킹 웹훅 자동 수납 매칭
- [ ] 1Password Connect 배포 + 자동 공유 링크
- [ ] Tier 2 (주간 선수금) + Tier 3 (선불 예치) 실행 로직 활성화
- [ ] 이상 감지 ML 전환 (룰 기반 → 학습)

**운영 확장**:
- [ ] 2번째 고객 온보딩
- [ ] Finance 전담자 채용
- [ ] 리멤버 B2B 영업 캠페인 투입
- [ ] CSM 1명당 5~10 고객 관리 프로세스 표준화

### 8.7 Phase 2 로드맵 (D+270 ~ 18개월)

- [ ] SSO (SAML / OIDC / SCIM) 엔터프라이즈 요건
- [ ] 자동 온보딩 (계약 서명 → org 등록 → 초대 발송)
- [ ] 다중 카드사 라우팅 (Primary/Backup 자동 전환)
- [ ] 해외 VCN (Wise / Airwallex) 추가
- [ ] Billing → AiOPS / Wiring 번들 전환 자동 (I-005 파이프라인 고도화)
- [ ] Anthropic 파트너십 재협상 (15% 또는 커밋 계약)

---

## 9. 의존성 / 제약 (Dependencies & Constraints)

### 9.1 외부 의존성

| 항목 | 주체 | Phase 0 리스크 | 완화책 |
|---|---|---|---|
| **카드사** (신한 V-Card) | 한국 VCN 발급 | 포털 수동 = 속도 제약 | Luna 일 평균 3건 처리 가능, Phase 1 API 전환 |
| **Smart Bill** | 세금계산서 | 로그인 계정 공유 | 전용 계정 1개, 공용 MFA |
| **은행 (오픈뱅킹)** | 입금 확인 | 수동 감지 지연 | Luna 매일 09:00 확인 루틴 |
| **Anthropic 파트너십** | 10% 패스스루 | 승인 지연 시 크레딧백 없음 | 승인 완료 후 Alpha 시작 |
| **법무** | 규제 준수 | 해석 변경 시 구조 조정 | 분기 자문 (`legal-tax-review.md`) |
| **세무** | VAT / 거래번호 | 연속 번호 규정 위반 리스크 | Smart Bill 에 위임 |

### 9.2 내부 의존성

- **하네스 룰북** (`@gridge-ai/aimsp-harness@0.27.0`) 지속 업데이트
- **Luna 인력 의존성** — 1인 장애 대비 위버 수동 처리 SOP 필요
- **Supabase 장애** → 고객 포털 + 운영 콘솔 동시 다운 (SLA 99.5% 기준 수용 가능)

### 9.3 기술 제약

- **Phase 0 수동 비율**: 카드사 / Smart Bill / 오픈뱅킹 모두 수동 → 운영 시간 투입 집중
- **Supabase free tier 한계**: 월 ~500 요청 RLS 캐시, Alpha 수용 가능, 2번째 고객 시 Pro 전환
- **Vercel Cron**: 하루 최대 100회 호출 (free), 월말 배치 여유 있음

### 9.4 비즈니스 제약

- **Alpha 고객 집중 의존**: 1개사 이탈 시 매출 0
- **현금 흐름**: Gridge 가 먼저 카드사에 결제 → 월말 고객 수납까지 D+45 갭 → 사내 유동성 필요
- **크레딧백 시간**: 6개월간 매출 10% 비용 → CAC 초기 부담

---

## 10. 리스크 / 대응

| ID | 리스크 | 확률 | 영향 | 대응 |
|---|---|---|---|---|
| R1 | VCN 해외결제 거절 (MCC / 한도 / 해외결제 설정) | M | H | 거절 대응 SOP / Backup 카드사 (Phase 1) / Luna 24h 대응 |
| R2 | Anthropic 파트너십 승인 실패 / 지연 | L | H | 크레딧백 없이 Alpha 진행 가능 여부 재검토 |
| R3 | 법무 자문 해석 변경 (PG 등록 필요 판정) | L | VH | 자문 재확인 (`legal-tax-review.md`) / 계약 구조 재설계 |
| R4 | Alpha 고객 이탈 (NPS < 6) | M | H | D+30 / D+60 / D+90 NPS 측정 / 즉시 원인 대응 |
| R5 | 월말 배치 실패 (데이터 오류 / Smart Bill 다운) | M | M | 수동 복구 SOP / Finance 당일 현장 대응 |
| R6 | Luna 장기 부재 (휴가 / 이직) | M | H | 위버 수동 대응 SOP / Phase 1 2번째 AM 채용 |
| R7 | 민감 정보 유출 (VCN 번호 / 토큰) | L | VH | 1Password / Vault / 감사 로그 / 보안 교육 |
| R8 | Supabase 장애 (전역) | L | H | 상태 페이지 / 장애 공지 SOP / 월 4시간 허용 SLA |
| R9 | Anthropic / OpenAI 약관 변경 → 법인 재판매 금지 | L | VH | 분기 재실사 / 조건부 허용 서비스로 강등 / 대체 탐색 |
| R10 | 외환 환율 급변동 (USD 결제 손실) | M | M | 환율 10% 버퍼 마진 (Phase 2 Finance 정책) |

**확률**: L(Low) / M(Medium) / H(High)  
**영향**: L / M / H / VH(Very High)

---

## 11. 런치 계획

### 11.1 Alpha 계약 전 (D-30 이전)

- [ ] 법무 자문 완료 (리셀러 구조 적법성 재확인)
- [ ] Anthropic Partner Network 승인 공식 완료
- [ ] 15+ 서비스 약관 실사 (`services.tos_review_status`)
- [ ] 회사 내부 자본금 / 카드사 거래 한도 확인
- [ ] Alpha 고객 계약서 / SLA / 해지 조항 법무 검토

### 11.2 D-14 ~ D-1 준비

- [ ] Supabase 프로젝트 프로덕션 승격
- [ ] `app.gridge.ai` / `console.gridge.ai` DNS 설정
- [ ] Vercel 배포 환경 3단계 구성
- [ ] Sentry / Vercel Analytics 연결
- [ ] Luna 교육 완료 (7 playbook SOP 전체 숙지)
- [ ] 1Password 팀 vault 준비 + 공유 정책 확정
- [ ] Slack Connect 워크스페이스 초대 준비
- [ ] Alpha 고객 Kickoff 미팅 (D-7)

### 11.3 D+0 Go-Live Day Checklist

`playbook/phase0-day1-runbook.md § D+0 Go-Live 준비` 절대 준수.

주요:
- [ ] 09:00 Luna 현장 대기 시작
- [ ] 09:30 Alpha Owner / Admin 초대 발송
- [ ] 10:00 Kickoff call (30분)
- [ ] 10:30 첫 VCN 발급 시나리오 (신한 V-Card 포털 수동)
- [ ] 11:00 1Password 공유 링크 발송
- [ ] 12:00 고객 확인 완료 (첫 계정 `active`)
- [ ] 오후 Luna 직접 Slack Connect 으로 지원
- [ ] 18:00 Day-1 Post-Mortem (Gridge 내부)

### 11.4 Post-Launch (D+7 / D+30 / D+90)

- [ ] **D+7**: 첫 주 리뷰 (Luna + 위버) / 조치 항목 기록
- [ ] **D+30**: 첫 청구서 발행 + 첫 수납 / NPS 1차
- [ ] **D+60**: Phase 1 준비 체크리스트 시작
- [ ] **D+90**: `phase-check.js 0-to-1` 실행 / Phase 1 전환 결정

---

## 12. 부록

### 12.1 용어 사전 (Glossary)

| 용어 | 정의 |
|---|---|
| **AIMSP** | AI Managed Service Provider (Gridge 전체 플랫폼) |
| **Billing MSP** | AIMSP 중 결제 관리 특화 제품 (Mode D 직교 레일) |
| **VCN** | Virtual Card Number (가상 카드) |
| **Reseller** | 재판매 구조 (PG 아님). 법적 근거 `01_서비스_정의.md § 2.1` |
| **Service-First UX** | 고객은 조회·요청, AM 은 실행. PB-008 |
| **Fast/Full Path** | 요청 처리 경로 (빠른 승인 vs 상세 검토) PB-008-05 |
| **HITL** | Human-in-the-Loop. AM 또는 Super 승인 포인트 |
| **Mode A/B/C** | 실행 레일 (Gridge 호스팅 / 온프레미스 / 고객 API) |
| **Mode D** | 결제 레일 (Billing MSP 직교 축, G-091) |
| **Passthrough** | 원가 그대로 재판매 (마진 0). 현재 pricing_policy 기본값 |
| **Crossback (크레딧백)** | 매출의 10% 를 다음 달 공제 (6개월) PB-004 |
| **Immutable Ledger** | 수정/삭제 금지 원장 (transactions, invoices, audit_logs) PB-005 |

### 12.2 참조 문서

- **하네스 룰북**: https://github.com/gridge-ai/aimsp-harness
- **원본 기획서 (프로젝트 내)**:
  - `01_서비스_정의.md` (전체 서비스 정의)
  - `02_시스템_아키텍처.md` (기술 아키텍처)
  - `03_데이터_모델.md` (테이블 28개 DDL)
  - `04_고객_포털_스펙.md` (27 URL)
  - `05_운영_콘솔_스펙.md` (49 URL)
  - `06_API_명세.md` (REST / RPC)
  - `07_운영_플레이북.md` (7 SOP)

### 12.3 FAQ (예상 질문)

**Q1. PG 등록 없이 어떻게 결제 대행이 가능한가?**  
A. "결제 대행" 이 아니라 **재판매**. Gridge 가 AI 서비스를 원가에 구매하여 고객에게 판매하는 구조. 법무 자문 완료. `rules/reseller.md` (PB-001).

**Q2. Gridge 가 결제 실패 시 위험은?**  
A. Alpha 는 월 한도 기반 선승인. 고객 수납 D+15 / 수납 확인 후 Gridge 정산. 최대 리스크는 D+45 유동성 (Phase 0 자본금 수용 가능 범위).

**Q3. 크레딧백 종료 후 고객 이탈은?**  
A. 6개월간 CSM 릴레이션 구축 + Billing → AiOPS / Wiring 업셀 전환 (20% / 10% 목표). 크레딧백 D-30 경고 + Luna 월간 리뷰에서 자연스러운 전환 제안.

**Q4. Alpha 실패 기준?**  
A. 다음 중 하나라도 발생 시 Phase 1 전환 보류:
- 월말 오차율 > 1%
- 거절 SLA < 80%
- NPS < 6
- 법무 미해결 이슈
- Anthropic 파트너십 승인 없음

**Q5. 2번째 고객 언제?**  
A. Alpha D+60 이후 Phase 1 준비 시점. Phase 1 계약 예정 파이프라인 확보는 D+30 부터 Luna / 위버 영업 시작.

---

## 13. 변경 이력

| 버전 | 일자 | 작성 | 변경 요약 |
|---|---|---|---|
| 1.0 | 2026-04-19 | 위버 + Claude Code | 최초 작성. Gridge AIMSP 하네스 v0.27 기준. Alpha 중심. |

---

## 14. 승인

| 역할 | 이름 | 날짜 | 비고 |
|---|---|---|---|
| Super / CCO | 위버 | __________ | |
| Co-Founder / COFEO | 이하늘 (Sky) | __________ | |
| Strategic Advisor | 문병용 (Brad) | __________ | |
| AM Lead | Luna | __________ | 운영 수용 확인 |

---

**문서 종료**  
*Gridge Billing MSP PRD v1.0 · 2026-04-19*
