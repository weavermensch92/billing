# Billing / Screens / Customer / org_members_offboarding — `/app/org/members/[id]/offboarding`

> 멤버 오프보딩 3단계 wizard. PB-011 구현. 계정 일괄 처리 + 절감 금액 미리보기.

---

## 목적

Owner/Admin 이 퇴사 멤버의 모든 AI 계정을 원자적으로 정리. 누락 방지 + 비용 누수 방지.

## 3단계 흐름

```
Step 1: 영향 미리보기 (얼마나 절약?)
Step 2: 각 계정별 액션 선택
Step 3: 최종 확인 + 제출
```

## Step 1 — 영향 미리보기

```
┌────────────────────────────────────────────────┐
│ Alice Kim 퇴사 처리 - 영향 분석                 │
│                                                  │
│ 👤 Alice Kim (Member)                           │
│    가입: 2026-04-01 (D+45)                       │
│    팀: 개발팀                                    │
│                                                  │
│ 📊 현재 사용 중 AI 계정: 7개                    │
│                                                  │
│ ┌────────────────────────────────────────────┐│
│ │ 1. Claude Team      VCN ****4521 · ₩30k/월  ││
│ │ 2. ChatGPT Team     VCN ****7823 · ₩35k/월  ││
│ │ 3. Cursor Business  VCN ****9102 · ₩22k/월  ││
│ │ 4. Anthropic API    VCN ****3344 · 월 ~₩150k││
│ │ 5. Lovable          VCN ****1200 · ₩29k/월  ││
│ │ 6. v0               VCN ****8877 · ₩20k/월  ││
│ │ 7. Perplexity Pro   VCN ****4455 · ₩27k/월  ││
│ └────────────────────────────────────────────┘│
│                                                  │
│ 💰 예상 월 절감                                  │
│    고정 월정액:  ₩163,000                       │
│    사용량 기반:  ~₩150,000                      │
│    ─────────────────────                       │
│    총 예상 절감: ~₩313,000 /월                  │
│                                                  │
│                             [다음: 액션 선택 →] │
└────────────────────────────────────────────────┘
```

## Step 2 — 각 계정별 액션 선택

```
┌────────────────────────────────────────────────┐
│ 각 계정에 대해 처리 방법을 선택하세요.           │
│                                                  │
│ ┌────────────────────────────────────────────┐│
│ │ Claude Team · ****4521 · ₩30,000           ││
│ │                                              ││
│ │ ● 즉시 해지 (기본)                          ││
│ │ ○ 다른 멤버로 이관                          ││
│ │ ○ 유지 (관리자 승인 필요)                   ││
│ └────────────────────────────────────────────┘│
│                                                  │
│ ┌────────────────────────────────────────────┐│
│ │ Anthropic API · ****3344 · ~₩150k/월       ││
│ │                                              ││
│ │ ○ 즉시 해지                                  ││
│ │ ● 다른 멤버로 이관                          ││
│ │   이관 대상: [Bob Lee ▾]                    ││
│ │ ○ 유지                                       ││
│ └────────────────────────────────────────────┘│
│                                                  │
│ ┌────────────────────────────────────────────┐│
│ │ Lovable · ****1200 · ₩29,000                ││
│ │                                              ││
│ │ ○ 즉시 해지                                  ││
│ │ ○ 다른 멤버로 이관                          ││
│ │ ● 유지 (관리자 승인 필요)                   ││
│ │   사유: ┌──────────────────────────────┐   ││
│ │        │ 프로젝트 인수인계 완료까지 사용│   ││
│ │        └──────────────────────────────┘   ││
│ └────────────────────────────────────────────┘│
│                                                  │
│ 📌 일괄 선택: [전체 즉시 해지]                  │
│                                                  │
│ [← 이전]                          [다음: 확인 →]│
└────────────────────────────────────────────────┘
```

### 이관 시 주의사항 (UI 안내)

```
⚠️ 이관 주의:
벤더 약관에 따라 계정 이관이 제한될 수 있습니다.
(예: 개인 계정 기반 서비스는 이관 불가)

이관 후 AM 이 벤더 약관 재확인 후 처리합니다.
```

## Step 3 — 최종 확인

```
┌────────────────────────────────────────────────┐
│ Alice Kim 오프보딩 확인                          │
│                                                  │
│ 처리 요약:                                      │
│ ├ 즉시 해지:  5개 (Claude Team, ChatGPT Team,  │
│ │              Cursor, v0, Perplexity)         │
│ ├ 이관:       1개 (Anthropic API → Bob Lee)    │
│ └ 유지:       1개 (Lovable, 관리자 승인 필요)  │
│                                                  │
│ 📅 예상 완료: 약 7일 후                         │
│    (VCN suspended → 7일 유예 → revoked 자동)     │
│                                                  │
│ 💰 월 예상 절감: ~₩284,000 (유지 1개 제외)      │
│                                                  │
│ 👤 Alice 계정 처리:                             │
│    - 로그인 차단 (D+7 이후)                    │
│    - 프로필 데이터 유지 (해지 후 30일)          │
│                                                  │
│ ⚠️ 담당 AM Luna 가 승인 후 진행합니다.          │
│    Lovable 유지 건은 별도 승인 필요.             │
│                                                  │
│ 본인 확인: 비밀번호 입력                        │
│ ┌──────────────────────────────────────────┐ │
│ │                                            │ │
│ └──────────────────────────────────────────┘ │
│                                                  │
│         [← 이전]           [오프보딩 시작]      │
└────────────────────────────────────────────────┘
```

## 제출 트랜잭션

```sql
BEGIN;
-- 1. 부모 action_request
INSERT INTO action_requests (
  org_id, requested_by, target_member_id,
  action_type, request_data, status
) VALUES (
  $org, $requester, $target,
  'bulk_terminate',
  jsonb_build_object(
    'total_accounts', 7,
    'action_summary', '{"terminate": 5, "transfer": 1, "retain": 1}'::jsonb
  ),
  'pending'
) RETURNING id AS parent_id;

-- 2. offboarding_events
INSERT INTO offboarding_events (
  org_id, member_id, initiated_by, parent_request_id,
  affected_accounts_count, affected_accounts_summary
) VALUES (
  $org, $target, $requester, $parent_id,
  7, $accounts_json
);

-- 3. 자식 action_requests × 7
INSERT INTO action_requests (parent_id, org_id, requested_by, target_member_id, 
                              target_account_id, action_type, request_data, status)
VALUES 
  ($parent_id, $org, $requester, $target, $acc1, 'terminate_account', {...}, 'pending'),
  ($parent_id, $org, $requester, $target, $acc2, 'terminate_account', {...}, 'pending'),
  -- ...
  ($parent_id, $org, $requester, $target, $acc4, 'transfer_account', 
    jsonb_build_object('new_member_id', $bob_id), 'pending'),
  ($parent_id, $org, $requester, $target, $acc5, 'retain_account', 
    jsonb_build_object('reason', '...'), 'pending');

-- 4. members 상태
UPDATE members SET status = 'offboarding' WHERE id = $target;

-- 5. audit_logs
INSERT INTO audit_logs (..., action_type='bulk_terminate_initiated', visibility='both');

COMMIT;

-- 비동기: 담당 AM Slack 알림
```

## 진행 상태 추적 (Step 3 제출 이후)

이 페이지는 제출까지만. 이후 진행 상황은:
- `/app/requests/[parent_id]` — 부모 요청 상세 + 자식 테이블
- `/app/org/members/[id]` — 멤버 드로어에 "오프보딩 진행 D+2/7" 표시

## Supabase Auth 비활성화 시점

모든 자식 `completed` 후 자동:
```sql
-- 비동기 배치 (자식 상태 변경 트리거)
IF (SELECT COUNT(*) FROM action_requests 
    WHERE parent_id = $parent AND status != 'completed') = 0 THEN
  -- members 상태
  UPDATE members SET status = 'offboarded', offboarded_at = now() 
  WHERE id = $target;
  
  -- offboarding_events 완료
  UPDATE offboarding_events SET completed_at = now() 
  WHERE parent_request_id = $parent;
  
  -- Supabase Auth 비활성
  -- (supabase.auth.admin.updateUserById({ banned: true }))
  
  -- 부모 action_request 완료
  UPDATE action_requests SET status = 'completed', completed_at = now()
  WHERE id = $parent;
END IF;
```

## 권한

- **Owner/Admin 만**. Member 는 접근 불가.
- **Owner 자신의 오프보딩은 금지** — Owner 양도 후 Admin 이 된 뒤 가능.

## Sprint 우선순위

**Sprint 3~4 필수** (실제 퇴사 케이스 발생 전 준비). Alpha 에서 첫 오프보딩은 보통 가입 후 3~6개월 뒤.

## 참조

- 오프보딩 규칙: `rules/offboarding.md` (PB-011)
- `offboarding_events`: `schemas/tables/offboarding_events.md`
- 부모/자식 action_requests: `schemas/tables/action_requests.md`
- Owner 양도 (오프보딩 전 필수): `screens/customer/org_members.md § Owner 양도`
- AM 콘솔 처리: `screens/console/request_detail.md § 6 오프보딩`
