# Billing / Screens / Console / vcn_detail — `/console/vcn/[vcnId]`

> VCN 상태 머신 UI. 9단계 전이 시각화 + 카드사 실시간 상태 + 만료 관리 + 전체번호 조회 (Super + 감사).

---

## 목적

Ops / Super 가 특정 VCN 의 **전 라이프사이클** 추적 + 비상 조치 (즉시 revoke 등) + 전체 번호 조회 (감사 로그 필수).

## 레이아웃

```
┌────────────────────────────────────────────────────┐
│ VCN #vcn_abc123                         [⋯ 액션]    │
│ Alpha Inc. · Alice Kim · Claude Team                │
├────────────────────────────────────────────────────┤
│ 상태 머신 시각화 (수평 플로우)                      │
│                                                      │
│ pending ─▶ approved ─▶ issuing ─▶ issued ─▶        │
│   ✅         ✅          ✅        ✅                │
│   ─▶ delivered ─▶ active ─▶ suspended ─▶ revoked    │
│         ✅          🔵 ← 현재    ⚪       ⚪        │
│                                                      │
│ 다음 가능한 전이: [suspended] [revoked (emergency)]  │
├────────────────────────────────────────────────────┤
│ 카드사 정보                                          │
│ ├ 발급사         신한 V-Card                        │
│ ├ last4          ****4521                            │
│ ├ 유효기간       2027-05-01 (D-365)                  │
│ ├ 발급일         2026-05-01                          │
│ ├ 활성화일       2026-05-02                          │
│ └ issuer_token   shinhan-vc-xyz789                   │
├────────────────────────────────────────────────────┤
│ 한도 및 정책                                         │
│ ├ 월 한도        ₩30,000                             │
│ ├ 건당 한도      제한 없음                           │
│ ├ MCC            5734, 7372, 5817                    │
│ ├ 해외결제       ✅ 허용                             │
│ └ Role           primary (backup 페어: vcn_def456)   │
├────────────────────────────────────────────────────┤
│ 이번 달 사용량                                       │
│ ▓▓▓▓▓▓▓▓▓░ 95% (₩28,500 / ₩30,000)                 │
│ 최근 결제 3건                                        │
│ ├ 2026-05-14 Claude Team ₩28,500 ✅                 │
│ ├ 2026-04-15 Claude Team ₩28,500 ✅                 │
│ └ 2026-03-15 Claude Team ₩28,500 ✅                 │
├────────────────────────────────────────────────────┤
│ 감사 로그 (상세)                                     │
│ ├ 2026-05-01 00:42 · system · INSERT                 │
│ ├ 2026-05-01 09:12 · Luna · approved                 │
│ ├ 2026-05-01 09:15 · Luna · issuing                  │
│ ├ 2026-05-01 09:30 · Luna · issued                   │
│ ├ 2026-05-01 09:35 · Luna · delivered (1Password)    │
│ └ 2026-05-02 14:22 · system · active (첫 결제 성공) │
└────────────────────────────────────────────────────┘
```

## 상태 머신 시각화

9단계 전이를 수평 플로우로 시각화:

```tsx
<div className="flex items-center gap-2 overflow-x-auto">
  {states.map((state, i) => (
    <Fragment key={state.name}>
      <StateBadge
        state={state.name}
        status={state.passed ? 'passed' : state.current ? 'current' : 'pending'}
        timestamp={state.at}
      />
      {i < states.length - 1 && <ArrowIcon />}
    </Fragment>
  ))}
</div>
```

상태별 색상:
- **passed** (지난 단계): 🟢 연한 초록
- **current** (현재): 🔵 파란, 굵은 테두리
- **pending** (미도달): ⚪ 회색
- **error** (failed): 🔴 빨강

## 9단계 상태 전이 (PB-002)

```
pending ─▶ approved ─▶ issuing ─▶ issued ─▶ delivered ─▶ active
                                                            │
                                                            ├▶ suspended ─▶ revoked
                                                            │                   ↑
                                                            └─────────────▶ expired (자동)
```

## 전이 버튼 (상태 머신 강제)

현재 상태에서 가능한 전이만 버튼 노출:

| 현재 상태 | 가능 전이 | 버튼 |
|---|---|---|
| `pending` | approved / failed | [승인] [실패 기록] |
| `approved` | issuing / failed | [발급 시작] |
| `issuing` | issued / failed | [발급 완료] |
| `issued` | delivered / revoked | [공유 링크 발송] [발급 취소] |
| `delivered` | active / revoked | (자동 — 첫 결제 시) |
| `active` | suspended / expired | [일시 중지] |
| `suspended` | active / revoked | [재개] [영구 폐기] |

불가능 전이는 비활성화 (DB 트리거가 2차 방어).

## "전체 번호 조회" 버튼 (Super + 감사)

```
┌─────────────────────────────────────────────┐
│ 🔒 VCN 전체 번호 조회                        │
│                                                │
│ ⚠️ 이 조회는 감사 로그에 기록됩니다            │
│ (visibility='internal_only', actor=$me)       │
│                                                │
│ 조회 사유: [반드시 입력]                      │
│ ┌─────────────────────────────────────────┐ │
│ │ (예: 카드사 긴급 문의 지원)              │ │
│ └─────────────────────────────────────────┘ │
│                                                │
│ [취소]                   [조회 확인]          │
└─────────────────────────────────────────────┘
```

조회 확인 시:
1. **카드사 API 호출** (DB 에 저장 안 함)
2. **전체 번호 표시 30초 후 자동 blur**
3. **audit_logs INSERT** (visibility='internal_only', action='view_full_card_number')
4. **Super 알림** (다른 Super 에게 교차 감사)

## 긴급 액션 (`[⋯ 액션]`)

- [일시 중지] — 즉시 suspended (고객 통지 자동)
- [영구 폐기] — 2단계 확인 (`status = 'revoked'`)
- [한도 변경] — Fast/Full Path 선택
- [MCC 추가] — 화이트리스트 수정
- [해외결제 토글]
- [전체 번호 조회] (Super 만)
- [Backup 페어 발급] — 장애 대비

## 카드사 상태 동기화

Phase 0 수동 확인 / Phase 1 API 동기화:
```
├ Gridge DB 상태:  active
├ 신한 V-Card 포털: active ✅ (일치)
└ 최근 동기화: 2분 전
[수동 재동기화]
```

불일치 시 🔴 경고 + Ops 알림.

## 데이터 소스

```sql
SELECT vc.*, o.name AS org_name, m.name AS member_name, s.display_name AS service_name,
  a.status AS account_status,
  (SELECT SUM(customer_charge_krw) FROM transactions 
    WHERE virtual_card_id = vc.id 
      AND billing_month = date_trunc('month', now())::date
      AND status IN ('authorized','settled')) AS mtd_spent,
  (SELECT json_agg(al.* ORDER BY al.created_at)
    FROM audit_logs al 
    WHERE al.target_table = 'virtual_cards' AND al.target_id = vc.id) AS audit_history,
  (SELECT json_agg(t.* ORDER BY t.authorized_at DESC)
    FROM transactions t 
    WHERE t.virtual_card_id = vc.id LIMIT 10) AS recent_transactions
FROM virtual_cards vc
JOIN orgs o ON o.id = vc.org_id
JOIN accounts a ON a.id = vc.account_id
JOIN members m ON m.id = a.member_id
JOIN services s ON s.id = a.service_id
WHERE vc.id = $1;
```

## 권한

- **조회**: Super / Ops
- **상태 전이 버튼**: Super / Ops
- **한도 변경**: Super / Ops (Fast) / Super (Full)
- **전체 번호 조회**: **Super 만** (감사 로그 + 교차 Super 알림)
- **Backup 페어**: Super

## 실시간 갱신

- `virtual_cards.status` 변경 → 상태 머신 시각화 즉시 갱신
- `transactions` INSERT → 사용량 진행바 + 최근 결제 3건 갱신

## Sprint 우선순위

**Sprint 3 필수**. Phase 0 수동 운영에서 VCN 문제 대응의 핵심 화면.

## 참조

- `virtual_cards`: `schemas/tables/virtual_cards.md`
- VCN 규칙 (PB-002): `rules/vcn.md`
- 상태 머신 트리거: `schemas/tables/virtual_cards.md § 상태 전이 트리거`
- 카드사 실무: `playbook/card-issuer-ops.md`
- 감사 가시성: `rules/audit_visibility.md § PB-010-03` (view_full_card_number = internal_only)
- 거절 대응: `playbook/decline-response.md`
