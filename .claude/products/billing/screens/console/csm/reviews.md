# Billing / Screens / Console / CSM / reviews — `/console/csm/reviews`

> 월간 리뷰 준비 노트. AM 이 고객사별 월간 미팅 전 데이터 자동 수집 + 업셀 시그널 + 템플릿 대화 포인트.

---

## 목적

Luna 가 월 1회 각 고객사와 **월간 리뷰 미팅** 준비. 스스로 SQL 돌릴 필요 없이 데이터 자동 집계 + AI 기반 시그널 + 추천 액션.

## 레이아웃

```
┌────────────────────────────────────────────────┐
│ 월간 리뷰 준비                                    │
├────────────────────────────────────────────────┤
│ 예정된 리뷰 (3)                                    │
│                                                    │
│ 📅 5월 20일 (월) 15:00                             │
│    Alpha Inc. - Q2 리뷰                          │
│    담당: Luna  ·  준비도: 🟢 완료                 │
│    [준비 노트 보기]  [미팅 링크]                  │
│                                                    │
│ 📅 5월 24일 (금) 11:00                             │
│    (Phase 1 예정 고객사)                           │
│                                                    │
│ [+ 리뷰 예약]                                      │
├────────────────────────────────────────────────┤
│ 지난 리뷰 (3)                                      │
│                                                    │
│ 📋 2026-04-15 · Alpha Inc. · Luna                 │
│    완료 · [노트 보기]                              │
│                                                    │
│ 📋 2026-03-15 · Alpha Inc. · Luna                 │
│    완료 · Wiring 관심 표명 ← 업셀 시그널 발생    │
└────────────────────────────────────────────────┘
```

## 준비 노트 상세 (`/console/csm/reviews/[reviewId]`)

```
┌──────────────────────────────────────────────────┐
│ 📋 Alpha Inc. 5월 월간 리뷰                        │
│ 2026-05-20 (월) 15:00 · 담당: Luna                │
│ 참석 예정: Alice (Admin), Bob (Admin)             │
├──────────────────────────────────────────────────┤
│ 📊 지난 한 달 요약 (자동 집계)                      │
│                                                    │
│ 매출: ₩7.3M (전월 대비 ▲ +12%)                    │
│ 활성 계정: 14 (전월 대비 ▲ 2)                      │
│ 거절율: 0.7% (양호 ✅)                             │
│ SLA 준수: 98% (우수 ✅)                            │
│ 크레딧백 진행: M3 / 6 (₩2,310,000 누적)            │
│                                                    │
├──────────────────────────────────────────────────┤
│ 🎯 감지된 시그널 (2)                                │
│                                                    │
│ 🟢 Wiring 업셀 가능성 HIGH                         │
│    이유:                                           │
│    - 개발팀 AI 도구 사용률 60%+                   │
│    - Cursor, Claude Code 집중 사용                 │
│    - 이번 달 Wiring 유사 기능 문의 2건             │
│    추천 대화: "AI 에이전트 개발 자동화 관심 있음?" │
│    [제안서 템플릿]  [AM 의견 반영]                │
│                                                    │
│ 🟡 AiOPS 번들 가능성 MEDIUM                        │
│    이유:                                           │
│    - 결제 투명성 + 보안 감사 관심 표명 (지난 리뷰)│
│    - 최근 본사 감사 대비 문의                      │
│    추천: "AI 로그 통합 관리 필요성?"               │
│    [제안서 템플릿]  [시그널 무시]                 │
│                                                    │
├──────────────────────────────────────────────────┤
│ 📝 지난 리뷰 액션 아이템 후속 (4)                   │
│                                                    │
│ ✅ VCN 해외결제 허용 (4/20 완료)                   │
│ ✅ Owner 양도 프로세스 문의 답변 (4/25 완료)       │
│ ⏳ 신규 멤버 온보딩 가이드 작성 (진행 중, 50%)     │
│ ⏳ Phase 1 API 전환 시점 상의 (다음 리뷰)          │
│                                                    │
├──────────────────────────────────────────────────┤
│ 🎤 준비된 대화 포인트 (추천)                        │
│                                                    │
│ 1. "지난 한 달 잘 사용하셨나요?" (Open)            │
│ 2. "거절 1건 발생 관련 원인 설명 + 재발 방지"       │
│ 3. "Wiring 관심 탐색 대화" ← 업셀                  │
│ 4. "크레딧백 종료 3개월 전 예고 (M6 = 9월)"        │
│ 5. "개선 요청이나 이슈는?"                         │
│                                                    │
│ [포인트 추가]  [대화 순서 변경]                    │
├──────────────────────────────────────────────────┤
│ ✍️ 실시간 메모 (리뷰 중 작성)                       │
│                                                    │
│ ┌──────────────────────────────────────────────┐│
│ │                                                ││
│ │ (리뷰 중 여기에 메모)                          ││
│ │                                                ││
│ └──────────────────────────────────────────────┘│
│                                                    │
│ [저장]  [CSM 노트로 확정]                          │
└──────────────────────────────────────────────────┘
```

## 데이터 소스 (준비 노트 자동 생성)

```sql
-- 월별 요약
SELECT 
  SUM(customer_charge_krw) AS monthly_revenue,
  COUNT(DISTINCT virtual_card_id) AS active_vcns,
  COUNT(*) FILTER (WHERE status = 'declined') * 100.0 / COUNT(*) AS decline_rate,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600) AS avg_sla_hours
FROM transactions t
LEFT JOIN action_requests ar ON ar.org_id = t.org_id
WHERE t.org_id = $1
  AND t.authorized_at >= date_trunc('month', now() - interval '1 month')
  AND t.authorized_at < date_trunc('month', now());

-- 업셀 시그널
SELECT us.*, sp.*
FROM upsell_signals us  
JOIN service_profile sp ON sp.org_id = us.org_id
WHERE us.org_id = $1 AND us.status = 'new'
ORDER BY us.confidence DESC;

-- 지난 리뷰 액션 아이템
SELECT ra.*, ar.status AS current_status
FROM review_actions ra
LEFT JOIN action_requests ar ON ar.id = ra.related_request_id
WHERE ra.review_id = (
  SELECT id FROM monthly_reviews 
  WHERE org_id = $1 ORDER BY reviewed_at DESC LIMIT 1 OFFSET 1
);
```

## 리뷰 완료 후 자동 처리

[저장] → 실시간 메모 저장만
[CSM 노트로 확정] →
1. `csm_notes INSERT (visibility='internal_only')`
2. `monthly_reviews UPDATE (completed_at, notes)`
3. 새 액션 아이템 추출 → `review_actions INSERT`
4. 업셀 시그널 후속 상태 업데이트

## 권한

- **Super / AM**: 본인 담당 리뷰 만
- **AM**: 다른 AM 리뷰는 조회만 (편집 불가)

## Sprint 우선순위

**Sprint 3~4**. Phase 0 D+30 첫 월간 리뷰 시점부터 유용. Alpha 에서 Luna 업무 효율 핵심.

## 참조

- `monthly_reviews` (v0.26+): 추후 작성
- `upsell_signals` (I-005): `integrations/billing-wiring.md`
- `csm_notes`: `schemas/INDEX.md § 11 알림·감사·CSM`
- 가시성 규칙: `rules/audit_visibility.md` (PB-010, csm_notes = internal_only)
- AM 홈: `screens/console/home.md § AM 뷰`
