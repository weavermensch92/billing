# Billing / Rules / Offboarding — 멤버 오프보딩 일괄 처리

> **PB-011** — 멤버 퇴사 시 계정·VCN 일괄 해지. Parent `action_requests` + 자식 N개 패턴. `offboarding_events` 로 이력 추적.

---

## PB-011-01. 문제 배경

멤버 한 명이 퇴사하면 보통 5~10개 AI 계정 보유:
- Claude Team, ChatGPT Team, Cursor Business, Gemini API, ...

기존 고객사 관행 (법인카드 수작업):
- 각 서비스 개별 해지 → **누락** → 수개월 지속 결제 → **비용 누수**

Gridge Billing MSP 가 해결할 핵심 가치 중 하나. 원자적 일괄 처리 + 감사.

## PB-011-02. Parent / Child 패턴

```
[Owner/Admin] /app/org/members/[id]/offboarding 3단계 wizard
     │
     ▼
[Step 1] 대상 멤버 + 계정 미리보기
  SELECT a.*, s.display_name, vc.last4
  FROM accounts a
  JOIN services s ON s.id = a.service_id
  LEFT JOIN virtual_cards vc ON vc.account_id = a.id AND vc.role = 'primary'
  WHERE a.member_id = $1 AND a.status = 'active'
     │
     ▼
[Step 2] 각 계정별 조치 선택
  - 즉시 해지 (VCN suspend + 7일 유예)
  - 다른 멤버로 이관 (예: 팀장)
  - 계정 유지 (프리랜서 등 특수 케이스, Admin 승인 필요)
     │
     ▼
[Step 3] 최종 확인 + 제출
     │
     ▼
[Backend] 트랜잭션:
  1. 부모 action_requests INSERT (type='bulk_terminate')
  2. offboarding_events INSERT (parent 연결)
  3. 자식 action_requests INSERT × N (각 계정마다 terminate_account)
  4. members.status = 'offboarding'
     │
     ▼
[AM 큐 /console/requests] 부모 + 자식 통합 표시
     │
     ▼
[AM] 승인 → 자동 처리 (각 VCN suspend)
     │
     ▼
[7일 유예 후]
  자식 각각 VCN revoke + accounts.status = 'terminated' + child completed
     │
     ▼
[모든 자식 completed]
  부모 completed
  members.status = 'offboarded'
  Supabase Auth 비활성화 (auth.users ban)
  offboarding_events.completed_at 기록
```

## PB-011-03. 데이터 모델

### action_requests 확장 (parent 필드)

```sql
parent_id UUID REFERENCES action_requests(id) ON DELETE CASCADE
```

자식 삭제 시 부모 그대로 유지 / 부모 삭제 시 자식 CASCADE.

### offboarding_events 테이블

```sql
CREATE TABLE offboarding_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  member_id             UUID NOT NULL REFERENCES members(id),
  initiated_by          UUID NOT NULL REFERENCES members(id),
  initiated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- parent action_request 연결
  parent_request_id     UUID REFERENCES action_requests(id) ON DELETE SET NULL,
  
  -- 대상 계정 요약 (시작 시점 스냅샷)
  affected_accounts_count  INT NOT NULL,
  affected_accounts_summary JSONB,  -- [{service_code, account_id, action}, ...]
  
  -- 완료
  completed_at          TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  cancellation_reason   TEXT,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_offboarding_events_org ON offboarding_events(org_id, initiated_at DESC);
CREATE INDEX idx_offboarding_events_member ON offboarding_events(member_id);
```

## PB-011-04. 3가지 액션 옵션 (각 계정별)

### A. 즉시 해지 (기본)
```sql
-- 자식 action_requests INSERT
action_type = 'terminate_account'
request_data = '{"account_id": "...", "mode": "immediate"}'

-- 처리 시
UPDATE virtual_cards SET status = 'suspended' WHERE account_id = $1;
-- 7일 후 자동 배치: status = 'revoked'
UPDATE accounts SET status = 'terminating' WHERE id = $1;
```

### B. 타 멤버로 이관
```sql
action_type = 'transfer_account'
request_data = '{"account_id": "...", "new_member_id": "..."}'

-- 처리 시
UPDATE accounts SET member_id = $new_member_id WHERE id = $1;
-- VCN 은 유지 (재발급 안 함)
-- 단, AI 벤더 약관 확인 필요 (PB-006)
```

### C. 계정 유지 (특수)
```sql
action_type = 'retain_account'
request_data = '{"account_id": "...", "reason": "..."}'

-- 처리 시
-- 변경 없음. 단 감사 로그 기록 (Super 승인 필수)
-- 예: 프리랜서가 퇴사 후에도 프로젝트 마감까지 계속 사용
```

## PB-011-05. 7일 유예 기간의 이유

즉시 `revoked` 하면:
- 진행 중 결제 실패 가능
- 벤더 측 서비스 즉시 중단 → 데이터 접근 불가 (퇴사자가 회수 안 한 데이터 손실)

**7일 `suspended` 단계**:
- 신규 결제 차단 (추가 비용 방지)
- 기존 결제 정상 처리
- 퇴사자가 데이터 다운로드 가능 (회사 인수인계 완료)
- D+7 자동 `revoked`

## PB-011-06. 고객 포털 UI (3단계 wizard)

### Step 1 — 영향 미리보기
```
┌────────────────────────────────────────────────┐
│ Alice 퇴사 처리 - 영향 분석                     │
├────────────────────────────────────────────────┤
│ Alice 가 현재 사용 중인 AI 계정: 7개            │
│                                                  │
│ 1. Claude Team          ****4521   ₩30,000/월   │
│ 2. ChatGPT Team         ****7823   ₩35,000/월   │
│ 3. Cursor Business      ****9102   ₩22,000/월   │
│ 4. Anthropic API        ****3344    변동 (월 ~₩150k) │
│ 5. Lovable              ****1200   ₩29,000/월   │
│ 6. v0                   ****8877   ₩20,000/월   │
│ 7. Perplexity Pro       ****4455   ₩27,000/월   │
│                                                  │
│ 월 예상 절감: ₩163,000 + 사용량 기반            │
│                                                  │
│ [다음] 각 계정 처리 방법 선택 →                 │
└────────────────────────────────────────────────┘
```

### Step 2 — 계정별 액션
```
각 계정에 대해 [즉시 해지] / [다른 멤버로 이관] / [유지 (관리자 승인)] 선택
```

### Step 3 — 최종 확인
```
┌────────────────────────────────────────────────┐
│ Alice 퇴사 처리 확인                            │
│                                                  │
│ 즉시 해지: 5개                                  │
│ 이관 (팀장 Bob): 1개 (Anthropic API)            │
│ 유지 (관리자 승인 요청): 1개 (Lovable)          │
│                                                  │
│ 예상 완료: 약 7일 (유예 후 자동 해지)           │
│                                                  │
│ ⚠️ 이 작업은 담당 AM 승인이 필요합니다.          │
│                                                  │
│ [제출]  [이전]  [취소]                          │
└────────────────────────────────────────────────┘
```

## PB-011-07. AM 콘솔 처리

`/console/requests/[bulk_terminate_id]` 에서:
- 부모 요청 요약
- 자식 요청 N개 테이블 (각각의 상태 실시간 반영)
- [일괄 승인] 버튼 (모든 자식 한 번에)
- 개별 반려 가능 (재검토 필요 시)

## PB-011-08. 실패 복구

자식 중 일부 실패 시:
- 부모 `status = 'in_progress'` 유지
- 실패한 자식만 재시도 큐로 이동
- AM 에게 알림 ("Alice 오프보딩 3/7 실패, 재시도 필요")
- 전체 완료까지 members.status = 'offboarding' 유지

부분 완료 허용 안 함 — 원자성 보장 or 전체 복구.

## PB-011-09. 자동 검증 체크리스트

- [ ] 부모 `bulk_terminate` 없이 자식 terminate 직접 생성?
- [ ] 7일 유예 없이 즉시 `revoked`?
- [ ] Owner 를 오프보딩 대상으로 설정? (Owner 양도 먼저 필요, PB-001)
- [ ] offboarding_events 기록 없이 members.status 변경?
- [ ] Supabase Auth 비활성화 누락?
- [ ] 이관 시 AI 벤더 약관 검증 (PB-006) 누락?

## PB-011-10. 통계 / KPI

```sql
-- 월별 오프보딩 처리
SELECT 
  date_trunc('month', initiated_at) AS month,
  COUNT(*) AS offboardings,
  SUM(affected_accounts_count) AS total_accounts,
  AVG(EXTRACT(EPOCH FROM (completed_at - initiated_at)) / 86400) AS avg_days
FROM offboarding_events
WHERE org_id = $1
GROUP BY month
ORDER BY month DESC;
```

고객 포털 `/app/org/members` 에 "올해 오프보딩 처리 N명" 표시 가능 (CSM 가치 어필).

## 참조

- Service-First: `rules/service_first.md` (PB-008)
- `action_requests` parent/child: `schemas/tables/action_requests.md`
- `offboarding_events`: `schemas/tables/offboarding_events.md` (v0.21+ 작성)
- VCN 폐기 7일 유예: `rules/vcn.md § PB-002-07`
- 고객 포털 오프보딩 wizard: `screens/customer/org_members_offboarding.md` (v0.22)
- 원본: `02_시스템_아키텍처.md § 6-4 F7 멤버 오프보딩`
