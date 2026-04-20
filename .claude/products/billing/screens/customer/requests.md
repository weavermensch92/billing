# Billing / Screens / Customer / requests — `/app/requests`

> 요청 내역 리스트 + 상세 드로어 (메시지 스레드 + 타임라인 + 액션 완료 UX).

---

## 목적

본인 (or 조직 전체) 이 제출한 요청의 진행 상황 확인 + AM 과 스레드 대화 + `awaiting_customer` 단계에서 "완료" 확인 처리.

## 레이아웃

```
┌──────────────────────────────────────────────┐
│ 요청 내역                 [+ 신규 요청]        │
├──────────────────────────────────────────────┤
│ 필터: [전체]  진행 중  완료  반려              │
├──────────────────────────────────────────────┤
│ 리스트 (최신순)                                │
│ ┌──────────────────────────────────────────┐ │
│ │ 🔵 신규 계정 · Claude Team             ↗ │ │
│ │    Alice 님 대상 · 2시간 전 제출          │ │
│ │    🟡 AM 검토 중                         │ │
│ │    예상 완료: 오늘 오후 중               │ │
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ ⚠️ 신규 계정 · Cursor Business         ↗ │ │
│ │    본인 대상 · 어제 제출                  │ │
│ │    🟠 VCN 발급 완료, 등록 대기            │ │
│ │    → [교체 완료 확인]                    │ │
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ ✅ 한도 증액 · ChatGPT Team             ↗ │ │
│ │    Bob 님 대상 · 3일 전 완료              │ │
│ │    ₩30,000 → ₩50,000                     │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

## 상태 표시

| 상태 | 아이콘 | 문구 |
|---|---|---|
| `pending` | 🔵 | "접수 완료, 검토 대기" |
| `approved` | 🟡 | "AM 검토 중" or "처리 준비 중" |
| `in_progress` | 🟡 | "처리 중" |
| `awaiting_customer` | 🟠 | "등록 대기 — 완료 확인 필요" |
| `completed` | ✅ | "완료" |
| `rejected` | ❌ | "반려" |
| `cancelled` | ⚫ | "취소됨" |

## 상세 드로어 (`/app/requests/[requestId]`)

우측 슬라이드 드로어 900px. 3 섹션 탭:

### 탭 1: 진행 상황 (기본)
```
┌────────────────────────────────────────────┐
│ 신규 계정 요청 · Claude Team       [× 닫기]  │
├────────────────────────────────────────────┤
│ 📋 진행 상황                                 │
│                                              │
│ 타임라인 (체크리스트)                        │
│ ✅ 요청 접수              어제 14:23         │
│ ✅ AM 검토 완료           어제 14:45         │
│ ✅ VCN 발급 (신한)         오늘 09:12         │
│ 🟠 고객 등록 대기 (7일)    진행 중            │
│ ⏳ 첫 결제 후 활성화       대기               │
│                                              │
│ ───────────────────────────────────────────  │
│ VCN 정보 (수신)                             │
│                                              │
│ ⚠️ 1Password 링크: ~~~~~~~~                 │
│ 유효기간: 7일                                │
│ 카드 번호 last4: ****4521                    │
│                                              │
│ 등록 완료 후 [교체 완료] 버튼을 눌러주세요.   │
│                                              │
│           [교체 완료 확인]                   │
└────────────────────────────────────────────┘
```

### 탭 2: 메시지 스레드
```
┌────────────────────────────────────────────┐
│ 💬 대화                                      │
│                                              │
│ [Luna · Gridge AM] 어제 14:45               │
│   신규 계정 요청 잘 받았습니다.              │
│   한도 ₩30,000 으로 처리하겠습니다.          │
│                                              │
│ [You] 어제 14:50                            │
│   네 감사합니다!                             │
│                                              │
│ [Luna · Gridge AM] 오늘 09:12               │
│   VCN 발급 완료했습니다. 1Password 링크는    │
│   별도 이메일로 보내드렸습니다.              │
│                                              │
│ ┌────────────────────────────────────────┐ │
│ │ 메시지 입력...                          │ │
│ └────────────────────────────────────────┘ │
│                         [전송]              │
└────────────────────────────────────────────┘
```

### 탭 3: 요청 상세
원본 wizard 입력 내용 읽기 전용 표시.

## "교체 완료 확인" UX (중요)

`status = 'awaiting_customer'` 일 때만 노출. 고객이 VCN 을 외부 서비스에 등록 후 누르는 버튼:

```sql
UPDATE action_requests 
SET status = 'completed', 
    completed_at = now()
WHERE id = $1 AND status = 'awaiting_customer';

-- 관련 accounts / VCN 활성화 확인
UPDATE accounts SET status = 'active' WHERE id = $account_id;
UPDATE virtual_cards SET status = 'active', activated_at = now() WHERE account_id = $account_id;

-- audit_logs
INSERT INTO audit_logs (action_type, visibility, ...) 
VALUES ('customer_confirmed_vcn_registration', 'both', ...);
```

## 데이터 소스

```sql
-- 리스트
SELECT ar.*,
  s.display_name AS service_name,
  m_requester.name AS requester_name,
  m_target.name AS target_name,
  COALESCE(
    (SELECT re.event_data->>'estimated_completion'
     FROM request_events re
     WHERE re.action_request_id = ar.id
     ORDER BY re.created_at DESC LIMIT 1),
    '대기 중'
  ) AS estimated_completion,
  sp.sla_hours,
  (SELECT COUNT(*) FROM request_messages WHERE action_request_id = ar.id) AS message_count,
  (SELECT COUNT(*) FROM request_messages 
    WHERE action_request_id = ar.id 
      AND created_at > ar.viewed_by_customer_at) AS unread_count
FROM action_requests ar
LEFT JOIN services s ON s.id = (ar.request_data->>'service_id')::uuid
LEFT JOIN members m_requester ON m_requester.id = ar.requested_by
LEFT JOIN members m_target ON m_target.id = ar.target_member_id
LEFT JOIN sla_policies sp ON sp.action_type = ar.action_type
WHERE ar.org_id = $1
  AND ar.parent_id IS NULL  -- 자식 요청 (bulk_terminate) 숨김
ORDER BY ar.updated_at DESC
LIMIT 50;
```

## 권한

- Member: 본인이 제출한 요청 (`requested_by = auth.uid()`)
- Owner/Admin: 조직 전체 요청

## 실시간 갱신 (Supabase Realtime)

- `action_requests.status` 변경 → 카드 배지 + 타임라인 갱신
- `request_events` INSERT → 타임라인 추가
- `request_messages` INSERT → 메시지 스레드 신규 메시지 알림 + unread 증가

## 필터

- **상태**: 전체 / 진행 중 / 완료 / 반려
- **타입**: 전체 / 신규 / 해지 / 한도 변경 / 재발급 / 거절 대응
- **기간**: 최근 30일 / 3개월 / 전체
- **멤버**: (Owner/Admin 만) 전체 / 특정 멤버

## 빈 상태

```
요청이 없습니다.
[+ 새 요청 제출]
```

## Sprint 우선순위

**Sprint 2 필수**. Alpha 온보딩 직후 신규 계정 요청의 추적 화면.

## 참조

- `action_requests`: `schemas/tables/action_requests.md`
- 5유형 wizard: `screens/customer/services_new.md`
- Service-First: `rules/service_first.md` (PB-008)
- VCN 라이프사이클: `rules/vcn.md` (PB-002)
- 처리 플로우: `playbook/phase0-day1-runbook.md § Go-Live 첫 VCN`
