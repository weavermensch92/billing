# Billing / Screens / Operations Console — INDEX

> `console.gridge.ai` 운영 콘솔. 56개 화면 / 49개 고유 URL / 9개 섹션.
> **별도 Admin Auth + 2FA + IP 화이트리스트** (Phase 0 부터).

---

## 기술 전제

- 고객 포털과 동일 스택 (Next.js 14, Tailwind, Zustand, Recharts)
- **Admin Auth 독립** (Supabase Auth 별도 프로젝트 or 독립 IdP)
- **2FA 필수** (TOTP, `admin_users.twofa_enabled`)
- **IP 화이트리스트** (`admin_users.allowed_ips`)
- Supabase Realtime (전 조직 대상 구독)
- Vercel 배포 (별도 도메인)

## 역할 4종

| 역할 | 약칭 | Phase 0 담당 |
|---|---|---|
| Super Admin | Super | 위버 (+ Finance 겸직) |
| Account Manager | AM | Luna (+ Ops 겸직) |
| Finance | Finance | Phase 1 채용 (현재 Super) |
| Operations | Ops | Phase 1 채용 (현재 AM) |

---

## 사이트맵

```
/login                     Admin 로그인 + 2FA

/console                   (콘솔 레이아웃)
├── /console/home                       ★ 대시보드 (역할별 차등)
│
├── /console/orgs                       고객사 관리
│   ├── /console/orgs                   고객사 리스트
│   ├── /console/orgs/new               신규 등록 (Super)
│   └── /console/orgs/[orgId]           고객사 상세 (8탭)
│       ├── /overview
│       ├── /accounts
│       ├── /transactions
│       ├── /invoices
│       ├── /requests
│       ├── /members
│       ├── /teams
│       └── /notes
│
├── /console/requests                   요청 큐
│   ├── /console/requests?filter=...    [대기|진행|완료|반려]
│   └── /console/requests/[requestId]   요청 상세 + 처리 액션
│
├── /console/vcn                        VCN 관리 (Ops/Super)
│   ├── /console/vcn                    전체 목록
│   ├── /console/vcn/expiring           만료 임박
│   ├── /console/vcn/issues             이슈 큐
│   └── /console/vcn/[vcnId]            VCN 상세
│
├── /console/payments                   결제 모니터링
│   ├── /console/payments               결제 피드
│   ├── /console/payments/declined      거절 대응 큐
│   ├── /console/payments/anomalies     이상 감지
│   ├── /console/payments/unsettled     매입 미확정
│   └── /console/payments/[txnId]       트랜잭션 상세
│
├── /console/billing                    정산·청구 (Finance/Super)
│   ├── /console/billing                대시보드
│   ├── /console/billing/drafts         초안 검수 (월말)
│   ├── /console/billing/issued         발행·수납 관리
│   ├── /console/billing/tax-invoices   세계서 관리
│   ├── /console/billing/overdue        연체
│   └── /console/billing/[invoiceId]    청구서 상세
│
├── /console/csm                        CSM (Super/AM)
│   ├── /console/csm                    CSM 홈
│   ├── /console/csm/customers          담당 고객사
│   ├── /console/csm/reviews            월간 리뷰
│   ├── /console/csm/reviews/[id]       리뷰 준비 노트 ★
│   ├── /console/csm/upsell-signals     업셀 시그널
│   ├── /console/csm/health-index       건강도
│   └── /console/csm/renewals           재계약
│
├── /console/super                      슈퍼 어드민 (Super)
│   ├── /console/super                  플랫폼 대시보드
│   ├── /console/super/services         서비스 카탈로그
│   ├── /console/super/services/[id]    서비스 편집
│   ├── /console/super/merchant-mapping 가맹점 매칭
│   ├── /console/super/cross-org        전 조직 교차
│   ├── /console/super/platform-health  시스템 헬스
│   └── /console/super/danger           위험 액션 (2단계 승인)
│
└── /console/settings                   설정
    ├── /console/settings               내 계정
    ├── /console/settings/notifications 알림
    ├── /console/settings/team          운영팀 (Super)
    ├── /console/settings/system        시스템 설정 (Super)
    ├── /console/settings/audit-log     전체 감사 로그
    └── /console/settings/export        운영 내보내기
```

---

## 핵심 페이지 (Alpha 고객 운영 필수)

Phase 0 Day-1 즉시 필요:

1. **`/console/home`** — Luna 출근 시작점 (AM 대시보드 / 오늘 할 일)
2. **`/console/orgs/[Alpha]`** — 고객사 상세
3. **`/console/requests/[id]`** — 요청 처리 워크플로
4. **`/console/vcn/[id]`** — VCN 관리
5. **`/console/payments`** — 결제 모니터링
6. **`/console/billing/[invoiceId]`** — 월말 청구서

---

## 권한 매트릭스

| 페이지 영역 | Super | AM | Finance | Ops |
|---|---|---|---|---|
| `/console/home` | ✅ (전체) | ✅ (담당) | ✅ (재무) | ✅ (운영) |
| `/console/orgs/*` 조회 | ✅ | ✅ | ✅ | ✅ |
| `/console/orgs/new` | ✅ | ❌ | ❌ | ❌ |
| `/console/requests/*` | ✅ | ✅ | ❌ | ✅ |
| `/console/vcn/*` | ✅ | ❌ | ❌ | ✅ |
| `/console/payments/*` | ✅ | ❌ | ✅ | ✅ |
| `/console/billing/*` | ✅ | ❌ | ✅ | ❌ |
| `/console/csm/*` | ✅ | ✅ | ❌ | ❌ |
| `/console/super/*` | ✅ | ❌ | ❌ | ❌ |
| `/console/super/danger` | ✅ (2단계) | ❌ | ❌ | ❌ |

서버 미들웨어: `assertRole(req, ['super','am'])` (RLS 아님 — admin 별도 Auth).

## 민감 데이터 접근 (PB-005-05)

| 데이터 | Super | AM | Finance | Ops |
|---|---|---|---|---|
| `virtual_cards` 전체 번호 | ✅ (감사 로그) | 조회 요청 | ❌ | ✅ (감사 로그) |
| `transactions.gridge_margin_krw` | ✅ | ❌ | ✅ | ❌ |
| `transactions.raw_payload` | ✅ | 조회 | ❌ | ✅ |
| `audit_logs.visibility='internal_only'` | ✅ | 일부 | ✅ | ✅ |

## 2단계 승인 액션 (`/console/super/danger`)

- `org.delete` (고객사 완전 삭제)
- `service.code_migrate` (사업자번호 변경 M&A)
- `audit_log.retention_exception` (법정 보존 예외)
- `transactions.bulk_reversal` (대량 역기록)

모든 위험 액션은 **Super 2명 동의 필수** + 별도 감사 로그.

---

## 구현 우선순위 (Phase 0)

### Sprint 1 (2주)
1. `/login` (2FA)
2. `/console/home` (AM 뷰)
3. `/console/orgs` + `/console/orgs/[id]/overview`
4. `/console/orgs/new` (Alpha 등록 필수)

### Sprint 2 (2주, 요청 처리)
5. `/console/requests` + `/console/requests/[id]`
6. VCN 수동 발급 UI
7. 고객사 상세 계정·결제·요청 탭

### Sprint 3 (2주, 결제 + 월말)
8. `/console/vcn/*` 전체
9. `/console/payments/*` + 거절·이상·매입 지연
10. `/console/billing/*` + 초안 검수 + 청구서 상세

### Sprint 4 (2주, 마무리)
11. `/console/csm/*` 기본
12. `/console/super/*` 기본
13. `/console/settings/*`
14. 감사 로그 UI

## 개별 페이지 스펙

Phase 0 Day-1 필수 개별 본문 (v0.19+ 확장):
- `home.md` — AM 대시보드
- `org_detail.md` — 8탭 구조
- `request_detail.md` — 처리 워크플로
- `vcn_detail.md` — 상태 머신 UI
- `invoice_detail.md` — 월말 검수

원본 전수: 프로젝트 knowledge `05_운영_콘솔_스펙.md`.

## 참조

- 고객 포털: `screens/customer/INDEX.md`
- admin_users 역할: `schemas/tables/admin_users.md`
- 가시성 3분할: `rules/immutable_ledger.md § PB-005-05`
- 원본 전수: `05_운영_콘솔_스펙.md` (프로젝트 knowledge)
