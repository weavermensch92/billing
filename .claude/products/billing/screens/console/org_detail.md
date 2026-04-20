# Billing / Screens / Console / org_detail — `/console/orgs/[orgId]`

> 고객사 상세. 8개 탭 (overview / accounts / transactions / invoices / requests / members / teams / notes).

---

## 목적

AM / Super / Finance 가 특정 고객사 **전수 정보 하나의 화면** 에서 탐색. 타 탭으로 이동 없이 거의 모든 판단 가능.

## 레이아웃

```
┌────────────────────────────────────────────────────┐
│ Alpha Inc.                              [⋯ 액션]    │
│ 🏢 123-45-67890 · 🟢 active · ⭐ Alpha 파일럿         │
│ 월 매출: ₩7.3M · 담당 AM: Luna · 가입 D+15           │
├────────────────────────────────────────────────────┤
│ [Overview] [계정] [결제] [청구서] [요청] [멤버]     │
│ [팀] [메모]                                         │
├────────────────────────────────────────────────────┤
│ [선택된 탭 내용]                                    │
└────────────────────────────────────────────────────┘
```

## 탭 1: Overview (기본)

```
┌──────────────────┬──────────────────┬──────────────┐
│ 계약 정보         │ 이번 달 요약      │ 건강도 지표   │
│ ─────────────    │ ─────────────    │ ─────────── │
│ 티어: monthly    │ 매출: ₩7.3M      │ NPS: -        │
│ 한도: ₩10M       │ 결제: 142건      │ 거절율: 0.7%  │
│ 크레딧백: M4/6   │ 거절: 1건        │ SLA: 98%     │
│ 종료: 2026-10-01 │ 활성 계정: 14    │ 활성 멤버: 8  │
│                  │ 새 요청: 2       │              │
└──────────────────┴──────────────────┴──────────────┘

📈 최근 6개월 결제 추이 (라인 차트)

🎯 업셀 시그널 (1)
└ Wiring 도입 제안 (개발팀 AI 60%)
  [대화 시작] [제안서]

📝 최근 CSM 메모 (3)
├ 2026-05-10 · Luna · 월간 리뷰 완료, Wiring 관심 표명
├ 2026-05-01 · Luna · VCN 해외결제 허용 완료
└ 2026-04-15 · 위버 · Alpha 파일럿 계약 서명
[전체 메모 보기 →]
```

## 탭 2: 계정 (`accounts`)

전체 계정 테이블 + 필터 + VCN 정보 + 이번 달 사용량:

```
서비스         멤버      VCN         한도     이번 달   상태
Claude Team    Alice    ****4521    ₩30k    ₩28.5k   🟢
ChatGPT Team   Bob      ****7823    ₩35k    ₩35k     🟢
Anthropic API  Alice    ****3344    ₩200k   ₩187k    🟠 (93%)
Cursor Pro     Charlie  ****9102    ₩22k    ₩22k     🟢
...
```

각 행 우측 [상세] 버튼 → 드로어 (`account_detail.md` — v0.23+)

## 탭 3: 결제 (`transactions`)

```
필터: [기간▾] [상태▾] [서비스▾] [멤버▾]

시각               가맹점                    금액        상태   패스스루
2026-05-15 14:22   Anthropic                ₩45,000    🟢 settled ✅
2026-05-15 13:15   Claude.ai                ₩28,500    🟢 settled
2026-05-15 02:11   Lovable.dev              ₩29,500    🔴 declined
2026-05-14 18:30   OpenAI                   ₩67,000    🟢 settled
...
[더 보기]
```

콘솔은 `transactions` 직접 SELECT (내부 필드 모두 표시 — margin, raw_payload 등).

## 탭 4: 청구서 (`invoices`)

```
청구월        발행일     금액          상태    세계서
2026-04     2026-05-01  ₩8,019,000   ✅ 완납  SB-2026-05-001
2026-03     2026-04-01  ₩7,458,000   ✅ 완납  SB-2026-04-001
2026-02     2026-03-01  ₩6,890,000   🟡 예정   ...
```

각 행 [상세] → 청구서 상세 드로어 (console/invoice_detail.md)

## 탭 5: 요청 (`requests`)

`action_requests` 리스트. 고객 포털 `/app/requests` 와 유사하지만 AM 처리 액션 버튼 포함:
- [승인]
- [반려]
- [처리 시작]
- [메시지 보내기]

각 행 → 요청 상세 (`console/request_detail.md`)

## 탭 6: 멤버 (`members`)

```
이름       이메일               역할      상태      계정수   가입일
Alice Kim  alice@alpha.co.kr   Admin     🟢 active  3개     2026-04-01
Bob Lee    bob@alpha.co.kr     Admin     🟢 active  4개     2026-04-01
Charlie    charlie@alpha.co.kr Member    🟢 active  2개     2026-04-15
...
```

AM 액션:
- [초대 발송 재시도] (status='invited')
- [권한 변경] (Owner → Admin / Admin → Member)
- [오프보딩 시작] (PB-011)

## 탭 7: 팀 (`teams`)

```
팀명          소속 멤버 수  총 지출 (이번 달)  관리자
개발팀        4명          ₩3,200,000        Alice
마케팅팀      3명          ₩1,800,000        Bob
...
```

## 탭 8: 메모 (`notes`)

```
📝 CSM 메모 추가
┌────────────────────────────────────────┐
│ (내부 전용, 고객 포털 노출 안 됨)        │
│                                          │
└────────────────────────────────────────┘
[저장]

───────────────────────────────────
2026-05-10 · Luna · 월간 리뷰 완료
Wiring 관심 표명. 개발팀 적합. 다음 월간 리뷰에서 제안 예정.
```

`csm_notes` 테이블. `visibility = 'internal_only'` 강제.

## 상단 액션 메뉴 (`[⋯ 액션]`)

드롭다운:
- [신규 요청 대신 제출] (Member 대신)
- [월간 리뷰 예약]
- [업셀 시그널 수동 생성]
- [계약 편집] (Super 만)
- [해지 시작] (Super 만) — D-30 프로세스
- [완전 삭제] (Super + 2단계 승인) — D+30 후

## 권한

- **조회**: Super / AM (담당) / Finance / Ops 모두
- **메모 작성**: Super / AM
- **요청 처리**: Super / AM / Ops
- **계약 편집**: Super 만
- **위험 액션**: Super + 2단계 승인

## 데이터 소스

각 탭 진입 시 lazy load (한 번에 다 가져오지 않음):
```typescript
const tabQueries = {
  overview: () => fetch('/api/orgs/:id/overview'),
  accounts: () => fetch('/api/orgs/:id/accounts'),
  transactions: (params) => fetch('/api/orgs/:id/transactions', { params }),
  // ...
};
```

## 실시간 갱신

- `transactions` INSERT → 결제 탭 새 행
- `action_requests.status` → 요청 탭 배지
- `csm_notes` INSERT → 메모 탭 새 메모

## Sprint 우선순위

**Sprint 1 필수** (Overview + 계정 + 요청 최소). 나머지 탭은 Sprint 2~3.

## 참조

- 각 하위 드로어: `console/request_detail.md`, `console/vcn_detail.md`, `console/invoice_detail.md`
- 권한 매트릭스: `screens/console/INDEX.md`
- CSM 메모 가시성: `rules/audit_visibility.md` (PB-010)
- 위험 액션 2단계: `screens/console/INDEX.md § 2단계 승인`
- 업셀 (I-005): `integrations/billing-wiring.md`
