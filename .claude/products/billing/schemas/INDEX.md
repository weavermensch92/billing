# Billing / Schemas — INDEX

> PostgreSQL 15 (Supabase) 기준. 18개 신규 테이블 + 13개 View + 9개 도메인.
> 개별 테이블 DDL 은 `tables/*.md` (v0.19 작성 예정).

---

## 데이터 모델 원칙 (8개)

1. **Immutable Ledger**: 결제·감사 UPDATE/DELETE 금지, 역기록만 (PB-005)
2. **Snake_case 네이밍**: 테이블·컬럼 모두. 시간 `_at` (TIMESTAMPTZ), 날짜 `_date` (DATE), 금액 `_krw` (BIGINT)
3. **UUID 기본 키**: 모든 PK `UUID DEFAULT gen_random_uuid()`
4. **FK 정책**: CASCADE (종속) / SET NULL (선택적) / RESTRICT (해지 프로세스로만)
5. **JSONB 활용**: 검색 자주 안 하는 확장 필드만
6. **금액 정수 (원화)**: 외화는 `amount_original_numeric` + `currency_code` + `fx_rate` 분리
7. **CHECK 제약**: 모든 status·type 필드는 DB 레벨 enum
8. **Created/Updated 자동**: 트리거 관리

---

## 9개 도메인 — 테이블 카탈로그

### 도메인 1. 조직·멤버 (7개)

| 테이블 | 책임 | 우선 | 파일 |
|---|---|---|---|
| `orgs` | 고객사 | ★ P1 | `tables/orgs.md` |
| `teams` | 팀 | P1 | `tables/teams.md` |
| `members` | 사용자 | ★ P1 | `tables/members.md` |
| `org_contracts` | 계약 (티어 · 크레딧백 · 예치금) | ★ P1 | `tables/org_contracts.md` |
| `offboarding_events` | 오프보딩 이벤트 | P2 | `tables/offboarding_events.md` |
| `admin_users` | 운영자 (Super/AM/Finance/Ops) | ★ P1 | `tables/admin_users.md` |
| `am_assignments` | AM 담당 매핑 | P2 | `tables/am_assignments.md` |

### 도메인 2. 계정·VCN (4개)

| 테이블 | 책임 | 우선 | 파일 |
|---|---|---|---|
| `services` | AI 서비스 카탈로그 (약관 실사 화이트리스트) | ★ P1 | `tables/services.md` |
| `accounts` | 멤버×서비스 계정 | ★ P1 | `tables/accounts.md` |
| `virtual_cards` | VCN (issuer_token, last4, 한도) | ★ P1 | `tables/virtual_cards.md` |
| `issuer_health` | 카드사 상태 | P2 | `tables/issuer_health.md` |

### 도메인 3. 결제 원장 (4개)

| 테이블 | 책임 | 우선 | 파일 |
|---|---|---|---|
| `transactions` | 결제 이벤트 (회계 분리 필드) | ★ P1 | `tables/transactions.md` |
| `usage_snapshots` | API 사용량 일일 스냅샷 | P1 | `tables/usage_snapshots.md` |
| `unmapped_merchants` | 미매칭 가맹점 | P2 | `tables/unmapped_merchants.md` |
| `fx_rates` | 환율 이력 | P2 | `tables/fx_rates.md` |

### 도메인 4. 요청 워크플로 (4개)

| 테이블 | 책임 | 우선 | 파일 |
|---|---|---|---|
| `action_requests` | 고객 요청 (Service-First) | ★ P1 | `tables/action_requests.md` |
| `request_messages` | 요청 스레드 메시지 | P1 | `tables/request_messages.md` |
| `request_events` | 요청 타임라인 이벤트 | P1 | `tables/request_events.md` |
| `sla_policies` | SLA 정책 | P2 | `tables/sla_policies.md` |

### 도메인 5. 정산·청구 (8개)

| 테이블 | 책임 | 우선 | 파일 |
|---|---|---|---|
| `invoices` | 월 청구서 | ★ P1 | `tables/invoices.md` |
| `billing_cycles` | 청구 사이클 | P2 | `tables/billing_cycles.md` |
| `invoice_batches` | 월말 배치 이력 | P2 | `tables/invoice_batches.md` |
| `credit_backs` | 크레딧백 적용 | ★ P1 | `tables/credit_backs.md` |
| `interim_statements` | 티어 2 주간 내역서 | P2 | `tables/interim_statements.md` |
| `payment_receipts` | 수납 영수증 | P1 | `tables/payment_receipts.md` |
| `overdue_actions` | 연체 조치 | P2 | `tables/overdue_actions.md` |
| `monthly_close_checklist` | 월 마감 체크리스트 | P2 | `tables/monthly_close_checklist.md` |

### 도메인 6. 이상 감지 (2개)

| 테이블 | 책임 | 우선 | 파일 |
|---|---|---|---|
| `anomaly_events` | 감지된 이상 | P1 | `tables/anomaly_events.md` |
| `anomaly_rules` | 감지 룰 | P2 | `tables/anomaly_rules.md` |

### 도메인 7. 알림 (1개)

| 테이블 | 책임 | 우선 | 파일 |
|---|---|---|---|
| `notification_preferences` | 고객/운영자 알림 설정 | P2 | `tables/notification_preferences.md` |

### 도메인 8. 감사·내보내기 (2개)

| 테이블 | 책임 | 우선 | 파일 |
|---|---|---|---|
| `audit_logs` | Immutable 감사 로그 | ★ P1 | `tables/audit_logs.md` |
| `export_jobs` | ZIP 내보내기 작업 | P2 | `tables/export_jobs.md` |

### 도메인 9. CSM (3개)

| 테이블 | 책임 | 우선 | 파일 |
|---|---|---|---|
| `csm_notes` | CSM 메모 | P2 | `tables/csm_notes.md` |
| `monthly_reviews` | 월간 리뷰 세션 | P2 | `tables/monthly_reviews.md` |
| `upsell_signals` | 업셀 시그널 (Billing→AiOPS/Wiring) | P2 | `tables/upsell_signals.md` |

**합계**: 18개 신규 (AiOPS/Wiring 와 공용 없음), P1 별표 = 10개 (Phase 0 Day-1 필수).

---

## 13개 View (집계·조회 최적화)

| View | 용도 |
|---|---|
| `v_org_summary` | 고객사 리스트 요약 |
| `v_org_full_summary` | 고객사 상세 (콘솔) |
| `v_account_detail` | 계정 상세 + 이번 달 사용 |
| `v_vcn_summary` | VCN 상태 요약 |
| `v_transaction_detail` | 결제 + 멤버 + 서비스 조인 |
| `v_declined_transactions` | 거절 대응 큐 |
| `v_invoice_summary` | 청구서 요약 + MoM |
| `v_creditback_status` | 크레딧백 진행 상태 |
| `v_team_summary` | 팀별 지출 |
| `v_member_summary` | 멤버별 지출 |
| `v_finance_mtd` | Finance 손익 (Anthropic 패스스루 포함) |
| `v_anthropic_partnership_monthly` | 파트너십 재협상 자료 (PB-007) |
| `v_admin_csm_dashboard` | CSM 담당 고객 대시보드 |

---

## 마이그레이션 순서 (FK 의존성)

```
1. 확장 설치 (pgcrypto, pg_trgm, pg_cron)
2. admin_users
3. orgs → teams → members
4. org_contracts → am_assignments
5. services → issuer_health
6. accounts → virtual_cards
7. transactions → usage_snapshots → unmapped_merchants → fx_rates
8. sla_policies → action_requests → request_messages → request_events
9. invoices → billing_cycles → invoice_batches
10. credit_backs → interim_statements → payment_receipts → overdue_actions
11. monthly_close_checklist
12. anomaly_rules → anomaly_events
13. notification_preferences
14. audit_logs → export_jobs
15. csm_notes → monthly_reviews → upsell_signals
16. offboarding_events
17. 인덱스 생성
18. View 13개 생성
19. RLS 정책
20. DB 트리거 (auto_audit_log, immutable rules)
21. 초기 시드 (admin_users, services 기본 카탈로그)
```

## 보유 기간

| 테이블 | 보존 | 처리 |
|---|---|---|
| `transactions` | 2년 → raw_payload 압축 아카이브 | 집계 유지 |
| `audit_logs` | 3년 | 이후 cold storage |
| `invoices` / `tax_invoices` | 10년 | 법정 보관 |
| `usage_snapshots` | 1년 → 월 합계만 유지 | 일별 삭제 |
| `export_jobs` 파일 | 7일 | 메타는 영구 |
| 해지 조직 | D+30 완전 삭제 | audit_logs 만 org_id=NULL 유지 |

---

## RLS 정책 개요 (PB-005-05 가시성 3분할)

- `accounts`, `transactions`, `invoices`, `action_requests` — 고객 포털 RLS 적용 (org 단위 + 역할별)
- `virtual_cards` 전체 번호 조회 — Super 만 + 감사 로그 필수
- `transactions.gridge_margin_krw`, `raw_payload` — Finance 이상만
- `audit_logs.visibility` 컬럼으로 고객/콘솔 분기

상세: `tables/*.md` (v0.19) 각 테이블별 CREATE POLICY.

---

## DB 트리거

| 트리거 | 대상 | 동작 |
|---|---|---|
| `auto_audit_log` | 민감 테이블 전체 | AFTER INSERT/UPDATE → audit_logs INSERT |
| `immutable_rules` | transactions (settled), audit_logs, credit_backs | UPDATE/DELETE 차단 |
| `updated_at_sync` | 변경 가능 테이블 | BEFORE UPDATE → updated_at = now() |
| `invoice_state_sync` | invoices | status 변경 시 관련 payment_receipts 검증 |

---

## 참조

- 각 테이블 개별 DDL + 인덱스 + RLS: `tables/*.md` (v0.19 작성 예정)
- Immutable 원칙: `rules/immutable_ledger.md` (PB-005)
- 회계 분리 필드: `rules/anthropic_passthrough.md` (PB-007)
- 티어별 필드: `rules/billing_tier.md` (PB-003)
- ERD: `02_시스템_아키텍처.md § 3-2` + `03_데이터_모델.md § 18`
