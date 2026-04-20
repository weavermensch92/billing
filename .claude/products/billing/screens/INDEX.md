# Billing / Screens — INDEX

> 고객 포털 + 운영 콘솔 상위 카탈로그. Service-First 원칙 (PB-001) 반영.
> 총 76개 URL (customer 27 + console 49).

---

## 구조

```
screens/
├── customer/           고객 포털 (app.gridge.ai)
│   ├── INDEX.md        27 URL + Sprint 1~4 + 권한 매트릭스
│   └── *.md            개별 페이지 (v0.22+ 작성 예정)
│
└── console/            운영 콘솔 (console.gridge.ai)
    ├── INDEX.md        49 URL + 역할 매트릭스 + 2단계 승인
    └── *.md            개별 페이지 (v0.22+ 작성 예정)
```

## 두 포털의 관계 (Service-First 구현)

| 사건 | 고객 포털 | 운영 콘솔 |
|---|---|---|
| 신규 계정 요청 | 요청 wizard 로 `action_requests INSERT` | 요청 큐에 대기 → AM 승인 |
| VCN 발급 | 진행 상태 조회만 | AM 이 카드사 포털에서 수동 발급 (Phase 0) |
| 결제 거절 | 계정 상태 배지 🔴 표시 | Ops 거절 대응 SOP 실행 |
| 청구서 발행 | 월별 청구서 리스트 자동 표시 | Finance 초안 검수 → [발행] |
| 감사 로그 | visibility IN ('customer_only','both') | visibility IN ('internal_only','both') |

**같은 사건의 다른 시선** — DB 는 공유, 권한·가시성으로 분리.

## 기술 스택 (공통)

- Next.js 14 App Router
- Tailwind CSS (브랜드 블루 `#1722E8`)
- Pretendard + Geist Mono
- Zustand (상태)
- Recharts (차트)
- Supabase Realtime 구독

## Auth 분리

| 포털 | 인증 |
|---|---|
| 고객 포털 | Supabase Auth (Magic Link Phase 0~1, SSO Phase 2) |
| 운영 콘솔 | **독립 Admin Auth** + **2FA 필수** + **IP 화이트리스트** |

## 개별 페이지 작성 현황

### customer/
- `INDEX.md` ✅
- 개별 27 URL: 작성 예정 (v0.22)

우선순위 (Phase 0 Sprint 1~4):
- Sprint 1: `home.md`, `services.md`, `services_detail.md`
- Sprint 2: `services_new.md`, `requests.md`, `requests_detail.md`, `org_members.md`
- Sprint 3: `billing.md`, `billing_detail.md`, `creditback.md`, `settings.md`
- Sprint 4: `audit_log.md`, `data_export.md`, `discover.md`

### console/
- `INDEX.md` ✅
- 개별 49 URL: 작성 예정 (v0.22)

우선순위 (Phase 0 필수):
- `home.md` — AM 대시보드 (Luna 출근 시작점)
- `org_detail.md` — 고객사 상세 8탭
- `request_detail.md` — 요청 처리 워크플로
- `vcn_detail.md` — VCN 상태 머신 UI
- `invoice_detail.md` — 월말 청구서 검수

## 참조

- Service-First 원칙: `products/billing/CLAUDE.md § 7-1`
- 권한 매트릭스 상세: `screens/customer/INDEX.md § 권한 매트릭스`
- 콘솔 역할: `schemas/tables/admin_users.md`
- 원본 화면 스펙: 프로젝트 knowledge `04_고객_포털_스펙.md` + `05_운영_콘솔_스펙.md`
