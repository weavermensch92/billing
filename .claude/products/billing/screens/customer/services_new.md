# Billing / Screens / Customer / services_new — `/app/services/new`

> 신규 요청 wizard. 5개 유형 통합 (new_account / terminate / limit_change / vcn_replace / decline_response).

---

## 목적

고객이 원하는 모든 AI 계정 변경을 단일 wizard 로 요청. 모든 요청은 `action_requests` 경유 (PB-008 Service-First).

## Wizard 5단계 흐름

```
Step 1: 요청 유형 선택
Step 2: 대상 선택 (멤버 / 계정 / VCN)
Step 3: 상세 정보 입력
Step 4: 담당자 메시지 (선택)
Step 5: 최종 확인 + 제출
```

## Step 1 — 요청 유형 선택

```
┌──────────────────────────────────────────────┐
│ 어떤 요청을 하시나요?                          │
│                                                │
│ ○ 신규 계정 — 새 AI 서비스 시작                │
│ ○ 한도 변경 — 기존 계정 한도 증감              │
│ ○ VCN 재발급 — 카드 번호 교체                  │
│ ○ 계정 해지 — 더 이상 사용 안 함                │
│ ○ 결제 문제 — 거절 발생 (AM 요청 대신 이 양식)  │
│                                                │
│                            [다음 →]           │
└──────────────────────────────────────────────┘
```

각 유형별로 Step 2~3 내용이 분기됨.

## Step 2~3 — 유형별 입력

### A. 신규 계정 (`new_account`)

**Step 2**:
- **대상 멤버**: 본인 기본 / Owner·Admin 은 타 멤버 선택 가능
- **서비스 선택**: `services WHERE is_active AND tos_review_status IN ('approved','conditional')` 드롭다운
  - `conditional` 은 경고 배지 + 동의 체크박스

**Step 3**:
- **월 한도 (₩)**: 기본값 제시 (서비스별 list_price × 1.2)
- **건당 한도**: 선택 (대부분 무제한)
- **해외결제 필요?**: 체크박스 (USD 서비스는 자동 ✅)
- **사용 목적**: 자유 입력 (감사용, 200자 제한)

### B. 한도 변경 (`limit_change`)

**Step 2**: 기존 계정 선택 (드롭다운)

**Step 3**:
- **현재 한도**: 표시만
- **신청 한도**: 입력
- **변경 사유**: 자유 입력 (200자)
- **적용 시점**: "즉시" or "다음 달부터"

경고:
- 현재 × 2배 이상 증액 → "Super 승인 필요, 평균 2~24시간 소요"
- 감액 시 → "현재 사용량 대비 낮음" 경고

### C. VCN 재발급 (`vcn_replace`)

**Step 2**: 기존 계정 선택

**Step 3**:
- **재발급 사유**:
  - ○ 유효기간 만료 임박
  - ○ 카드 정보 유출 의심 (보안)
  - ○ 벤더 요구 (결제 오류)
  - ○ 기타
- **유예 기간**: 기본 7일 (구 VCN `suspended` → `revoked`)

### D. 계정 해지 (`terminate_account`)

**Step 2**: 해지할 계정 선택

**Step 3**:
- **해지 사유**: 드롭다운 (퇴사, 서비스 불만족, 비용 절감, 대체 서비스, 기타)
- **해지 일자**: 기본 "즉시" / "말일까지 사용 후"
- **데이터 백업 확인**: 체크박스 필수 ("벤더 서비스에서 데이터 백업 완료")

### E. 결제 문제 (`decline_response`)

**Step 2**: 문제 계정 / 거절된 결제 선택 (자동 감지)

**Step 3**:
- **문제 설명**: 자유 입력
- **긴급도**: 일반 / 긴급 (24h 내 필요)

## Step 4 — 담당자 메시지 (선택)

```
┌──────────────────────────────────────────────┐
│ Luna 님에게 추가 메시지 (선택)                 │
│ ┌──────────────────────────────────────────┐ │
│ │ (예: 긴급합니다 / 다음 주 화요일까지)      │ │
│ └──────────────────────────────────────────┘ │
│                      [이전]      [다음 →]    │
└──────────────────────────────────────────────┘
```

## Step 5 — 최종 확인

```
┌──────────────────────────────────────────────┐
│ 요청 내용 확인                                 │
│                                                │
│ 유형:    신규 계정                             │
│ 대상:    Alice Kim (your org)                  │
│ 서비스:  Claude Team                           │
│ 월 한도: ₩30,000                               │
│ 사유:    AI 리서치 / 일일 쿼리                 │
│                                                │
│ 예상 처리 시간: 2~4시간 (기본 SLA)              │
│ 담당: Luna (AM)                                │
│                                                │
│ 이 요청에 대한 진행 상황은                     │
│ /app/requests 에서 확인하실 수 있습니다.       │
│                                                │
│                      [이전]      [제출]       │
└──────────────────────────────────────────────┘
```

## 제출 트랜잭션

```sql
BEGIN;
-- action_requests INSERT
INSERT INTO action_requests (
  org_id, requested_by, target_member_id, target_account_id,
  action_type, request_data, status, sla_deadline
) VALUES (...)
RETURNING id;

-- request_events INSERT (초기 이벤트)
INSERT INTO request_events (action_request_id, event_type, event_data)
VALUES ($request_id, 'submitted', ...);

-- SLA 정책 적용
INSERT INTO request_events (...) -- sla_assigned

-- 담당 AM 에게 Slack 알림
-- (비동기 큐, 실패해도 요청 유지)
COMMIT;
```

## 데이터 소스

- 서비스 목록: `SELECT * FROM services WHERE is_active AND tos_review_status IN ('approved','conditional')`
- 기존 계정: `SELECT * FROM accounts WHERE org_id=$1 AND status='active'`
- 기본 한도 제안: `services.list_price_krw * 1.2`

## 권한

- 본인 대상: 모든 멤버
- 타 멤버 대상: Owner/Admin 만
- Step 1 에서 "다른 멤버 대신 요청" 토글 (Owner/Admin 만 노출)

## 검증

Step 3 에서 서버 측 검증:
- 서비스 중복 체크 (같은 멤버의 같은 서비스 기존 계정 있으면 에러)
- 한도 > 조직 `monthly_credit_limit_krw` 면 경고
- `conditional` 서비스 선택 시 acknowledgment 필수

## Sprint 우선순위

**Sprint 2 필수**. `/app/services` 보다 먼저 온보딩 완료. Alpha 첫 VCN 발급의 UI 입구.

## 참조

- `action_requests` 스키마: `schemas/tables/action_requests.md`
- Service-First 원칙: `rules/service_first.md` (PB-008)
- 서비스 카탈로그: `schemas/tables/services.md`
- 약관 실사: `rules/vendor_compliance.md` (PB-006)
- 처리 SOP: `playbook/phase0-day1-runbook.md § Go-Live`
