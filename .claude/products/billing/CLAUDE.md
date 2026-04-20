# Billing MSP — 라우터

> Gridge AI Account MSP. 4번째 제품.
> 기업의 모든 AI 서비스 계정을 그릿지가 대신 구매·관리·청구하는 MSP 서비스.
> 내부 코드: **Mode D (Billing Proxy)** — 기존 Mode A/B/C(AI 실행 레일)와 직교하는 결제 레일 축.

---

## 1. 제품 정체성

### 한 줄 정의

기업이 쓰는 모든 AI 서비스(구독·API·에이전트)를 그릿지가 구매해 고객사에 재판매하고, 전담 Account Manager가 계정 라이프사이클과 청구를 대행한다.

### 핵심 구별

| 구분 | 내용 |
|---|---|
| 서비스 성격 | **Service-First** — 고객은 조회·요청만, 실행은 AM 책임 |
| 법적 구조 | **리셀러** (재판매) — PG 아님. "결제 대행" 용어 금지 |
| 수익 | 최초 6개월 원가 −10% 크레딧백, 이후 별도 협의 |
| Mode | **D (Billing Proxy)** — AI 실행 Mode A/B/C 와 직교 |
| 확장성 | CSM 1명당 초기 2~10개 고객 상한 (Phase 0) |

### Gridge 포트폴리오 내 위치

```
Gridge MSP 본류 라인
├── Human MSP (개발자 매칭, 기존 본업)
├── AI Account MSP (Billing) ← 2026 신규 ★
├── AiOPS (모니터링·로깅·코칭)
├── LucaPus (AI Dev Platform)
└── Wiring AI (개발 플랫폼 UI)
```

---

## 2. 핵심 규칙 (PB-xxx)

F 체인 작업 시 작업 유형에 따라 자동 로드.

| 제목 | 파일 |
|---|---|
| **PB-001** 리셀러 구조 원칙 (PG 아님, 용어 금지) | `rules/reseller.md` |
| **PB-002** VCN 라이프사이클 (발급·한도·폐기) | `rules/vcn.md` |
| **PB-003** 3단 결제 티어 (월간·주간·선불) | `rules/billing_tier.md` |
| **PB-004** 크레딧백 10% (6개월, 다음 달 공제) | `rules/creditback.md` |
| **PB-005** Immutable Ledger (결제·감사 역기록) | `rules/immutable_ledger.md` |
| **PB-006** 벤더 약관 실사 화이트리스트 | `rules/vendor_compliance.md` |
| **PB-007** Anthropic 패스스루 회계 | `rules/anthropic_passthrough.md` |

공식 rule_id 등록 장소: `rules/00_index.md § 5.5`.

**확장 완료 (v0.21)**:
- **PB-008** Service-First UX 경계 → `rules/service_first.md`
- **PB-009** 회계 분리 엔진 → `rules/accounting_split_engine.md`
- **PB-010** 감사 로그 가시성 3분할 → `rules/audit_visibility.md`
- **PB-011** 멤버 오프보딩 일괄 처리 → `rules/offboarding.md`
- **PB-012** 이상 감지 룰 → `rules/anomaly_detection.md`
- **PB-013** Phase 0→1→2 전환 체크포인트 → `rules/phase_transition.md`

---

## 3. 데이터 모델

`schemas/INDEX.md` — 18개 테이블 카탈로그 (PostgreSQL 15 / Supabase).

9개 도메인:
1. **조직·멤버**: orgs, teams, members, org_contracts, offboarding_events, admin_users, am_assignments
2. **계정·VCN**: accounts, virtual_cards, services, issuer_health
3. **결제 원장**: transactions, usage_snapshots, unmapped_merchants, fx_rates
4. **요청 워크플로**: action_requests, request_messages, request_events, sla_policies
5. **정산·청구**: invoices, billing_cycles, invoice_batches, credit_backs, interim_statements, payment_receipts, overdue_actions, monthly_close_checklist
6. **이상 감지**: anomaly_events, anomaly_rules
7. **알림**: notification_preferences
8. **감사·내보내기**: audit_logs, export_jobs
9. **CSM**: csm_notes, monthly_reviews, upsell_signals

개별 테이블 DDL 은 `schemas/tables/*.md` (v0.19 작성 예정).

---

## 4. 화면 (Phase 0 기준)

### 고객 포털 (app.gridge.ai)

27개 URL — `screens/customer/` (v0.19 작성 예정).

주요 영역:
- `/app/home` 대시보드
- `/app/services` AI 서비스 관리 (탭 4개)
- `/app/requests` 요청 내역
- `/app/billing` 청구·정산
- `/app/org` 조직 관리
- `/app/settings` 설정
- `/app/discover` 업셀 허브 (Owner/Admin 전용)

### 운영 콘솔 (console.gridge.ai)

49개 URL — `screens/console/` (v0.19 작성 예정).

역할 4종 (Super / AM / Finance / Ops) 차등 권한 매트릭스.

---

## 5. 운영 플레이북

`playbook/*.md` (v0.20 작성 예정).
- Phase 0 Day-1 런북 (Alpha 고객 온보딩)
- 일일·주간·월말 루틴
- 거절·장애 대응 SOP
- Phase 0 → 1 → 2 전환 체크리스트
- 법무·세무 자문 질문 리스트

---

## 6. 통합 / 연동

- **Billing ↔ AiOPS**: AiOPS 사용량 로그 ↔ Billing 실결제 매칭 (`integrations/billing-aiops.md`, v0.20)
- **Billing ↔ Wiring**: CSM 업셀 시그널 → Wiring 도입 제안 (`integrations/billing-wiring.md`, v0.20)
- **외부 시스템**:
  - 카드사 VCN API (신한 V-Card 1순위, KB SmartPay 백업)
  - Smart Bill (세금계산서 SaaS)
  - 1Password (VCN 공유 볼트)
  - Slack Connect (고객사 채널)
  - Anthropic Usage API
  - Supabase (DB + Auth + Realtime + Storage)

---

## 7. 8개 원칙 (설계 판단 기준)

모든 세부 결정이 이 원칙 위에서 판정:

1. **Service-First** — 고객 조회·요청 / AM 실행 (셀프서비스 비중 인위 상향 금지)
2. **리셀러 구조** — PG 경로 금지. "결제 대행" 용어 금지
3. **내부·외부 정보 분리** — `gridge_margin` 고객 노출 금지, 고객 데이터 내부 마케팅 금지
4. **데이터 주권** — 해지 시 ZIP 이관 + 30일 유예 + 완전 삭제 + 확인서
5. **Immutable Ledger** — UPDATE/DELETE 금지, 역기록만
6. **벤더 약관 실사 우선** — 회색지대 서비스는 카탈로그 등록 보류
7. **Anthropic 패스스루 우선** — 파트너십 재협상 자료 자동 생성 구조
8. **점진적 도입** — 가장 안전한 서비스 1~2개부터 VCN 전환, 단계 확대

---

## 8. Phase 로드맵

| Phase | 기간 | 목표 |
|---|---|---|
| Phase 0 | 0~2개월 | Alpha 고객 1개사 수동 운영 |
| Phase 1 | 2~6개월 | 자동화 (카드사 API / 세계서 API / 오픈뱅킹) + 2번째 고객 |
| Phase 2 | 6개월~ | 표준 상품화 + 리멤버 B2B 캠페인 + 월 5개 신규 |

Phase 0 성공 지표:
- VCN 해외결제 승인률 ≥ 95%
- 월말 정산 오차율 < 0.5%
- 첫 고객 NPS ≥ 8

---

## 9. BM / 가격

| 기간 | 구조 | 고객 부담 |
|---|---|---|
| 최초 6개월 | 원가 −10% 크레딧백 | 원가의 90% |
| 7개월차~ | 원가 (0% 수수료) | 원가의 100% |
| 7개월차 이후 별도 BM | 현 시점 미확정 | — |

크레딧백 방식: **다음 달 청구서 공제** (매출 할인 처리, 선급금 아님).

---

## 참조

- 원본 기획 문서: 프로젝트 knowledge `01_서비스_정의.md` ~ `07_운영_플레이북.md` (7개 시리즈)
- 제품 정체성: `01_product.md § 1~3`
- Mode D 정의: `05_infra_mode.md § 9`
- 공통 규칙: `rules/00_index.md`
- 관련 제품:
  - AiOPS: `products/aiops/CLAUDE.md` (업셀 타겟)
  - Wiring: `products/wiring/CLAUDE.md` (업셀 타겟)
