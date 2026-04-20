# Integrations / Billing ↔ Wiring — CSM 업셀 파이프라인

> **I-005** — Billing CSM 이 감지한 고객 상태 → Wiring AI 도입 제안 자동화. 크레딧백 6개월 종료 → Wiring 라이선스 전환 플로우.

---

## I-005-01. 업셀 구조

Billing 을 **엔트리 포인트** 로 Wiring 을 **본체 판매** 로 연결.

```
[Billing MSP 계약 시작]  ₩0 추가 비용 (6개월 -10% 크레딧백)
      ↓
[1~3개월]  CSM (Luna) 월간 리뷰 진행
      ↓
[3~6개월]  CSM 이 Wiring 시그널 감지
      ↓
[5~6개월]  Wiring 제안 (업셀)
      ↓
[6개월+]  크레딧백 종료 시점 = Wiring 라이선스 전환 자연 타이밍
```

## I-005-02. Wiring 시그널 자동 감지

`upsell_signals` 테이블에 자동 INSERT 되는 시나리오:

### 시그널 A — 개발팀 AI 지출 증가
- 고객 AI 서비스 중 **개발 도구 비중** (Cursor / Claude Code / Copilot / Anthropic API) 가 50% 이상
- 월 ₩500만 초과
- **개발팀 AI 운영 효율화 니즈** = Wiring 타겟

### 시그널 B — 다수 AI 서비스 분산
- 한 고객사가 AI 서비스 **8개 이상** 사용 중
- 팀별로 다른 도구 (Cursor / v0 / Lovable 등)
- **적합화 부재로 인한 중복 / 비효율** = Wiring 의 통합 관리 타겟

### 시그널 C — API 사용량 급증
- Anthropic API / OpenAI API 월 ₩1,000만 초과
- **프로덕션 AI 엔진 운영 중** = Wiring + LucaPus 타겟

### 시그널 D — 크레딧백 종료 임박 (D-60)
- `org_contracts.creditback_end_date - 60 days` 도달
- 재계약 협상 타이밍 = **BM 전환 제안 기회**
- 자동으로 `upsell_signals INSERT (type='wiring_renewal_bundle')`

## I-005-03. 자동 배치 (매일 03:00)

```sql
-- 시그널 A 감지
INSERT INTO upsell_signals (org_id, type, signal_data, detected_at, status)
SELECT o.id, 'wiring_dev_team_upsell',
  jsonb_build_object(
    'dev_tools_share_pct', dev_share,
    'monthly_revenue_krw', monthly_total
  ),
  now(), 'new'
FROM orgs o
JOIN org_contracts oc ON oc.org_id = o.id AND oc.terminated_at IS NULL
CROSS JOIN LATERAL (
  SELECT
    COALESCE(SUM(t.customer_charge_krw) FILTER (
      WHERE s.code IN ('svc_cursor_business','svc_claude_team','svc_anthropic_api','svc_openai_api')
    ), 0) AS dev_total,
    COALESCE(SUM(t.customer_charge_krw), 0) AS monthly_total,
    ROUND(100.0 * COALESCE(SUM(t.customer_charge_krw) FILTER (
      WHERE s.code IN ('svc_cursor_business','svc_claude_team','svc_anthropic_api','svc_openai_api')
    ), 0) / NULLIF(SUM(t.customer_charge_krw), 0), 1) AS dev_share
  FROM transactions t
  JOIN services s ON s.id = t.service_id
  WHERE t.org_id = o.id
    AND t.authorized_at >= now() - interval '30 days'
    AND t.status = 'settled'
) stats
WHERE dev_share >= 50
  AND monthly_total >= 5000000
  AND NOT EXISTS (
    SELECT 1 FROM upsell_signals
    WHERE org_id = o.id AND type = 'wiring_dev_team_upsell'
      AND detected_at > now() - interval '90 days'
  );
```

매일 실행. 동일 시그널 90일 중복 방지.

## I-005-04. CSM 콘솔 표시

`/console/csm/upsell-signals` 페이지에서:

```
┌──────────────────────────────────────────────────┐
│ Alpha Inc.  🏢                                    │
│ 🎯 Wiring 업셀 시그널 (HIGH)                      │
│                                                    │
│ [시그널 A] 개발팀 AI 지출 60% (₩6.3M/월)          │
│ 감지일: 2026-05-15                                 │
│                                                    │
│ 관련 데이터:                                       │
│  - Cursor Business: ₩2.1M                          │
│  - Claude Team:     ₩1.8M                          │
│  - Anthropic API:   ₩2.4M                          │
│                                                    │
│ [대화 시작]  [시그널 무시]  [제안서 템플릿 생성]  │
└──────────────────────────────────────────────────┘
```

**[대화 시작]** → Slack Connect 채널 자동 선택 + 제안 템플릿 미리 채움.

**[제안서 템플릿 생성]** → Wiring 제안서 생성 (고객 실제 데이터 + 추천 Wiring 에디션 자동).

## I-005-05. 크레딧백 종료 → Wiring 전환 플로우

6개월 종료 시점의 특수 시그널 (시그널 D):

```
D-60: upsell_signals INSERT (type='wiring_renewal_bundle')
      CSM 알림 + 재계약 협상 개시
      
D-30: 고객 포털 크레딧백 페이지 경고 + Owner 이메일
      "6개월 크레딧백 혜택이 곧 종료됩니다. Wiring 도입 시 별도 혜택 제공"
      
D-7:  CSM 최종 협상 마감
      세 가지 옵션 제시:
       1. Billing 유지 (원가 청구)
       2. Billing + Wiring 번들 (Wiring 라이선스에 Billing 포함)
       3. 크레딧백 연장 (신규 AI 서비스 도입 조건부)
       
D-0 (creditback_end_date): 최종 크레딧백 적용 (M6 → M7 청구서)

D+1 이후: 선택된 옵션에 따라 계약 업데이트
```

## I-005-06. Wiring → Billing 역방향 (Wiring 고객이 Billing 추가)

Wiring 계약 고객이 AI 서비스 결제 관리 필요 시:
- Wiring 대시보드 에서 "Billing 도입 제안" 배너 자동 표시
- Wiring 라이선스에 Billing 포함 (추가 비용 X, 관리 공수 절감)
- `org_contracts` 2개 레코드 (Wiring + Billing) 병행 관리

## I-005-07. 데이터 모델 신규 필드

```sql
-- billing.upsell_signals 타입 확장
-- 기존: 'renewal_risk', 'aiops_upsell', 'billing_upsell' + 신규:
--   'wiring_dev_team_upsell', 'wiring_multi_service', 'wiring_api_volume',
--   'wiring_renewal_bundle'

-- billing.org_contracts 확장
ALTER TABLE billing.org_contracts ADD COLUMN linked_wiring_contract_id UUID;
-- Wiring 계약과 연결된 경우 참조 (같은 org 2계약)
```

## I-005-08. 업셀 전환율 측정 (KPI)

`/console/csm/health-index` 에 추가:
- **Billing → Wiring 전환율** (목표 10%)
- **AiOPS → Wiring 전환율** (기존 시그널 포함, 목표 20%)
- **시그널 감지 → 대화 시작 비율** (목표 30%+)
- **대화 시작 → 계약 체결 비율** (목표 20%)

Phase 2 영업 데이터로 누적.

## I-005-09. 업셀 UX 금기 사항

❌ **금지**:
- 시그널 감지 즉시 자동 이메일 발송 (CSM 승인 우회)
- 고객 포털 `/app/home` 에 업셀 팝업 공격적 노출
- 크레딧백 종료 압박식 메시지 ("지금 안 바꾸면 비용 급증")
- Billing 내부 데이터 (margin) 를 Wiring 제안서에 포함

✅ **권장**:
- CSM (Luna) 이 대화 시작 — 사람 중심
- 월간 리뷰 미팅 자연스러운 흐름에서 제안
- 데이터 근거 명시 (추정 아닌 실결제 기반)
- 고객 선택권 3안 이상 제시

## I-005-10. 자동 검증 체크리스트

- [ ] 업셀 시그널을 자동 이메일로 발송 (CSM 우회)?
- [ ] 시그널 감지 로직이 `gridge_margin_krw` 를 사용 (내부·외부 정보 분리)?
- [ ] 동일 시그널 90일 내 중복 감지?
- [ ] `creditback_end_date` 전 크레딧백 종료 알림 누락?
- [ ] Wiring 제안서에 Billing 내부 필드 노출?

## 참조

- Wiring 제품: `products/wiring/CLAUDE.md`
- Billing CSM: `products/billing/schemas/tables/*` (csm_notes, monthly_reviews, upsell_signals — v0.19 INDEX 등재)
- 크레딧백 종료 절차: `products/billing/rules/creditback.md § PB-004-06`
- AiOPS → Wiring 기존: `integrations/aiops-wiring.md` (I-001)
- 외부 노출 규칙: `01_product.md § 4` (G-004)
