# Billing / Screens / Console / Super / services — `/console/super/services`

> 서비스 카탈로그 관리. Super 전용. 약관 실사 + 화이트리스트 + 가격 정책 + 패스스루 플래그.

---

## 목적

Super (위버) 가 AI 서비스 카탈로그 중앙 관리. PB-006 벤더 약관 실사 결과 반영 + 신규 서비스 등록 + 제재.

## 레이아웃

```
┌──────────────────────────────────────────────────┐
│ 서비스 카탈로그 관리                                │
│                              [+ 신규 서비스 등록]   │
├──────────────────────────────────────────────────┤
│ 필터: [상태▾] [벤더▾] [카테고리▾] [약관 상태▾]   │
├──────────────────────────────────────────────────┤
│ 코드          표시명          벤더    약관       │
│                                                    │
│ svc_claude_team     Claude Team    Anthropic  🟢 approved │
│ svc_anthropic_api   Anthropic API  Anthropic  🟢 approved │
│ svc_chatgpt_team    ChatGPT Team   OpenAI     🟢 approved │
│ svc_cursor_biz      Cursor Biz     Cursor     🟢 approved │
│ svc_lovable         Lovable        Lovable    🟡 conditional │
│ svc_v0              v0             Vercel     🟡 conditional │
│ svc_perplexity_pro  Perplexity Pro Perplexity 🔴 rejected │
│   (기업 API 법인 청구 불가, 제재 2026-03-12)       │
│ svc_notion_ai       Notion AI      Notion     ⚪ pending  │
└──────────────────────────────────────────────────┘
```

## 서비스 상세 드로어

```
┌────────────────────────────────────────────────┐
│ Claude Team                             [×]     │
│ svc_claude_team                                  │
├────────────────────────────────────────────────┤
│ 기본 정보                                         │
│ ├ 표시명:       Claude Team                     │
│ ├ 벤더:         Anthropic                       │
│ ├ 카테고리:     subscription                    │
│ ├ 기본 가격:    USD 25 /월 /시트                │
│ ├ 통화:         USD                             │
│ └ MCC:          5734                            │
│                                                  │
├────────────────────────────────────────────────┤
│ 약관 실사 (PB-006)                               │
│                                                  │
│ 상태:        🟢 approved                        │
│ 최종 검토:   2026-04-15                         │
│ 다음 재검토: 2026-07-15 (분기마다)              │
│                                                  │
│ 검토 이력:                                       │
│ ├ 2026-04-15 · 위버 · 재확인 · 변경 없음        │
│ ├ 2026-01-15 · 위버 · 첫 승인 · 법인 청구 허용  │
│                                                  │
│ 근거 링크:                                       │
│ [Anthropic Terms of Service ↗]                  │
│ [Commercial Use Policy ↗]                       │
│                                                  │
│ 내부 검토 노트:                                  │
│ ┌────────────────────────────────────────────┐│
│ │ 법인 명의 VCN 결제 공식 허용. API 별도 약관  ││
│ │ (svc_anthropic_api) 와 분리 관리. 재판매     ││
│ │ 목적 허용 확인.                              ││
│ └────────────────────────────────────────────┘│
│                                                  │
├────────────────────────────────────────────────┤
│ 가격 정책 (PB-009)                               │
│                                                  │
│ pricing_policy: passthrough                     │
│                                                  │
│ ● passthrough       (원가 그대로 재판매)        │
│ ○ cost_plus_2pct    (2% 마진, 미사용)           │
│ ○ fixed_markup_10k  (10k 고정 가산, 미사용)     │
│                                                  │
│ ⚠️ 정책 변경은 고객 통지 + 계약 수정 필요         │
│                                                  │
├────────────────────────────────────────────────┤
│ 특수 플래그                                       │
│                                                  │
│ ☑ Anthropic 파트너십 패스스루 (PB-007)           │
│   10% 할인 자동 전달                             │
│ ☐ 한도 기본 알림 (90% 도달 시)                  │
│ ☑ 해외결제 필수 (USD 서비스)                    │
│ ☐ 월 자동 갱신 (VCN 만료 방지)                  │
│                                                  │
├────────────────────────────────────────────────┤
│ 📊 사용 현황 (이번 달)                            │
│ 활성 계정: 2 · 매출: ₩1,245,000                  │
│ (Anthropic 패스스루 포함)                        │
│                                                  │
│ [약관 재검토]  [정책 변경 제안]  [일시 중단]    │
└────────────────────────────────────────────────┘
```

## 약관 상태 4단계

| 상태 | 의미 | 사용 가능 |
|---|---|---|
| 🟢 `approved` | 법인 청구 명시적 허용 | ✅ |
| 🟡 `conditional` | 조건부 (예: 개인 명의로만, 리셀러 제한) | ⚠️ 경고 |
| 🔴 `rejected` | 제재 (발견된 위반, 차단) | ❌ |
| ⚪ `pending` | 신규 등록, 검토 대기 | ❌ (검토 완료까지) |

## 신규 서비스 등록 플로우

```
[+ 신규 서비스 등록] 클릭
      ↓
[입력 폼]
  기본 정보 (이름, 벤더, 카테고리, 기본 가격)
  MCC 입력
  약관 링크 (ToS, 결제 정책)
  벤더 담당 연락처
      ↓
[status = 'pending' 저장]
      ↓
[Super 법무 검토 큐]
  위버가 법무 자문 의뢰 or 직접 검토
      ↓
[approved / conditional / rejected 결정]
      ↓
[고객에 공지]
  conditional → 사용 시 경고 표시
  rejected → 사용 차단
      ↓
[3개월 후 재검토 알림 자동]
```

## 정책 변경 (가격 등)

```
[정책 변경 제안] 클릭
      ↓
모달:
  from: passthrough
  to: cost_plus_2pct
  적용 시점: [2026-07-01 ▾]
  고객 통지: ☑ 자동 발송 (30일 전)
  영향 고객사: N 개 예상
      ↓
[Super 최종 승인]
      ↓
[audit_logs INSERT (visibility='internal_only', action='pricing_policy_changed')]
[영향 고객사 이메일 발송 스케줄링]
```

## 분기 재검토 자동 알림

```sql
-- 배치 (매일 09:00)
INSERT INTO admin_notifications (admin_user_id, type, data)
SELECT s.super_id, 'tos_review_due',
  jsonb_build_object('service_id', s.id, 'service_name', s.display_name,
    'last_reviewed_at', s.tos_last_reviewed_at)
FROM services s
JOIN admin_users s ON s.role = 'super'
WHERE s.tos_last_reviewed_at < now() - interval '3 months'
  AND s.status = 'active';
```

## 권한

- **Super 만**. 모든 서비스 등록 / 정책 변경 / 약관 실사 결과 반영.
- **AM / Ops**: 서비스 카탈로그 조회만.
- **Finance**: 가격 정책 연계 보기 (매출 영향 파악).

## 데이터 소스

```sql
SELECT s.*,
  (SELECT COUNT(*) FROM accounts a 
    WHERE a.service_id = s.id AND a.status = 'active') AS active_accounts,
  (SELECT SUM(customer_charge_krw) FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE a.service_id = s.id
      AND t.billing_month = date_trunc('month', now())::date
      AND t.status IN ('authorized','settled')) AS mtd_revenue
FROM services s
ORDER BY active_accounts DESC, mtd_revenue DESC;
```

## Sprint 우선순위

**Sprint 3 Super 필수**. Alpha 온보딩 시 서비스 카탈로그 이미 10+개 등록되어 있어야 함.

## 참조

- 서비스 스키마: `schemas/tables/services.md`
- 약관 실사 규칙: `rules/vendor_compliance.md` (PB-006)
- 가격 정책 엔진: `rules/accounting_split_engine.md` (PB-009)
- Anthropic 패스스루: `rules/anthropic_passthrough.md` (PB-007)
- 법무 자문: `playbook/legal-tax-review.md`
