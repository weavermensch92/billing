# Billing / Schemas / Tables — INDEX

> Phase 0 Day-1 필수 P1 12개 본문 완성. P2 6+개 확장 예정.
> 상위 카탈로그: `schemas/INDEX.md` (18+ 테이블 전체).

---

## P1 (작성 완료, 12개)

Phase 0 Day-1 Alpha 고객 운영에 반드시 필요한 핵심 테이블.

| 테이블 | 도메인 | 핵심 특성 |
|---|---|---|
| `orgs.md` | 조직·멤버 | 사업자등록번호 변경 불가 / 해지 D+30 CASCADE |
| `members.md` | 조직·멤버 | Owner/Admin/Member 3단 / org 당 Owner 1명 |
| `admin_users.md` | 조직·멤버 | Super/AM/Finance/Ops 4역할 / 2FA + IP 화이트리스트 |
| `org_contracts.md` | 조직·멤버 | 3단 티어 + 예치금 + 크레딧백 종료일 |
| `services.md` | 계정·VCN | 약관 화이트리스트 / 글로벌 테이블 / 초기 시드 15개 |
| `accounts.md` | 계정·VCN | 멤버×서비스 유니크 / 상태 전이 5단계 |
| `virtual_cards.md` | 계정·VCN | 상태 머신 트리거 / **전체 번호 저장 금지 DDL** |
| `transactions.md` | 결제 원장 | **회계 분리 3필드** / Immutable (settled 이후) / v_transaction_customer 뷰 |
| `invoices.md` | 정산·청구 | 3단 티어 금액 계산 (interim_paid / deposit_used / net_due) |
| `credit_backs.md` | 정산·청구 | Immutable / 역기록 패턴 예시 |
| `audit_logs.md` | 감사 | 가시성 3분할 / auto_audit_log 트리거 / org_id=NULL 유지 |
| `action_requests.md` | 요청 워크플로 | 5종 타입 + parent/child bulk_terminate |

## P2 (작성 예정, 16개+)

Phase 0 후반~Phase 1 필요 시 작성.

### 조직·멤버 (3)
- `teams.md` — 팀 관리 (org 내 하위 그룹)
- `am_assignments.md` — AM 고객 담당 매핑
- `offboarding_events.md` — 오프보딩 이벤트 기록 (PB-011)

### 계정·VCN (1)
- `issuer_health.md` — 카드사 상태 헬스체크

### 결제 원장 (3)
- `usage_snapshots.md` — API 일일 사용 스냅샷
- `unmapped_merchants.md` — 미매칭 가맹점
- `fx_rates.md` — 환율 이력

### 요청 워크플로 (3)
- `request_messages.md` — 요청 스레드 메시지
- `request_events.md` — 요청 타임라인
- `sla_policies.md` — SLA 정책

### 정산·청구 (6)
- `billing_cycles.md`
- `invoice_batches.md` — 월말 배치 이력
- `interim_statements.md` — 티어 2 주간 내역서
- `payment_receipts.md` — 수납 영수증
- `overdue_actions.md` — 연체 조치
- `monthly_close_checklist.md` — 월 마감 체크리스트

### 이상 감지 (2)
- `anomaly_events.md` — 감지된 이상
- `anomaly_rules.md` — 감지 룰 정의

### 알림·감사·CSM (5)
- `notification_preferences.md` — 알림 설정
- `export_jobs.md` — ZIP 내보내기
- `csm_notes.md` — CSM 메모
- `monthly_reviews.md` — 월간 리뷰 세션
- `upsell_signals.md` — 업셀 시그널

## 13개 View (아직 별도 파일 없음)

View 는 `schemas/INDEX.md § 13개 View` 에 카탈로그로 등재. 구현 시 각 테이블 파일에 관련 view 섹션 추가.

주요 View:
- `v_org_summary` / `v_org_full_summary`
- `v_account_detail` / `v_vcn_summary`
- `v_transaction_detail` / `v_transaction_customer` (RLS 분리 뷰)
- `v_declined_transactions`
- `v_invoice_summary` / `v_creditback_status`
- `v_finance_mtd` / `v_anthropic_partnership_monthly` (Finance 전용)

## 작성 우선순위 (v0.21+)

**High (PB-011, PB-012 와 연계 필요)**:
1. `offboarding_events.md` — PB-011 오프보딩 규칙 구현
2. `anomaly_events.md` + `anomaly_rules.md` — PB-012 이상 감지

**Medium (Phase 0 실무 편의)**:
3. `request_messages.md` + `request_events.md` — Sprint 2 요청 처리 UI
4. `usage_snapshots.md` — 고객 포털 "이번 달 예상 비용" 표시
5. `payment_receipts.md` — 수납 관리

**Low (Phase 1 이후)**:
- 나머지 P2 테이블

## 마이그레이션 순서

18+ 테이블 FK 의존성 순서는 상위 `schemas/INDEX.md § 마이그레이션 순서` 참조.

## 참조

- 상위 INDEX: `schemas/INDEX.md`
- Immutable 원칙: `rules/immutable_ledger.md` (PB-005)
- RLS 패턴: 각 테이블 본문 RLS 섹션
- 13개 View: `schemas/INDEX.md § 13개 View`
