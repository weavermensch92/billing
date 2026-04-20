# Billing / Screens / Console / request_detail — `/console/requests/[requestId]`

> 요청 처리 워크플로. 5유형 (new_account / terminate / limit_change / vcn_replace / decline_response / bulk_terminate). Fast Path vs Full Path. 진행 상태 체크리스트.

---

## 목적

AM 이 고객 요청을 **단일 화면에서 승인·반려·처리 완료**. 모든 처리 단계 추적 + 고객과 메시지 스레드.

## 레이아웃 (3 컬럼)

```
┌───────────────────┬─────────────────────────────┬──────────────────┐
│ 좌: 요청 정보       │ 중: 처리 워크플로            │ 우: 메시지 스레드  │
│ ───────────────   │ ───────────────────────     │ ─────────────── │
│ Alpha Inc.        │ 체크리스트 UI (유형별)       │ 고객 ↔ AM 대화    │
│ Alice Kim 대상    │                              │                  │
│ 신규 계정         │ ▼ Fast Path / Full Path     │ 메시지 입력       │
│ Claude Team       │ 선택 버튼                    │                  │
│ 한도 ₩30,000      │                              │                  │
│                    │ ───────────────────────     │                  │
│ 상태 🟡 pending    │ 단계별 체크:                 │ 빠른 반응:        │
│ 제출 2h 전         │ ☐ VCN 발급 (카드사)          │ [승인]           │
│ SLA 6h 남음        │ ☐ 1Password 저장            │ [반려 with 사유]  │
│                    │ ☐ 고객에 공유 링크 발송      │ [메시지 보내기]   │
│                    │                              │                  │
└───────────────────┴─────────────────────────────┴──────────────────┘
```

## 유형별 처리 워크플로

### 1. 신규 계정 (`new_account`) — Full Path 기본

**체크리스트**:
1. ☐ **요청 검토** — 한도 적정성 / 약관 확인 / 멤버 자격
2. ☐ **VCN 발급** (카드사 포털 or API)
   - 입력: issuer, issuer_token, last4, expires_at, 한도 설정
3. ☐ **1Password 저장** (전체 번호)
   - 볼트: `Gridge-VCN-Alpha`
4. ☐ **공유 링크 생성** (7일 유효, 1회 조회)
5. ☐ **고객 이메일 발송** (링크 포함)
6. ☐ **상태 전환**: `status = 'awaiting_customer'`
7. ☐ **알림 전송** (고객 포털 + Slack Connect)

각 단계 완료 시 `progress_state` JSONB 에 기록:
```json
{
  "vcn_issued": true,
  "vcn_issuer_token": "shinhan-vc-abc123",
  "vcn_last4": "4521",
  "1password_saved": true,
  "share_link_sent_at": "2026-05-15T10:15:00Z"
}
```

### 2. 해지 (`terminate_account`)

1. ☐ **검토** (대체 멤버로 이관 옵션 재확인)
2. ☐ **VCN suspend** (즉시)
3. ☐ **고객 공지** (7일 유예 안내)
4. ☐ **D+7 자동 revoke** (배치)
5. ☐ **accounts.status = 'terminated'**

### 3. 한도 변경 (`limit_change`)

**Fast Path** (현재 × 1.5배 이내 증액):
- AM 즉시 승인 → 카드사 포털 한도 변경 → 완료
- SLA 30분

**Full Path** (× 2배+ 증액 or 감액):
- Super 승인 필요 (2단계 승인)
- SLA 2~24시간

### 4. VCN 재발급 (`vcn_replace`)

1. ☐ **신규 VCN 발급** (동일 설정)
2. ☐ **1Password 신규 저장**
3. ☐ **공유 링크 발송** (7일)
4. ☐ **구 VCN suspend** (즉시, 진행 결제 보호)
5. ☐ **고객 "교체 완료" 클릭 대기** (awaiting_customer)
6. ☐ **고객 확인 후** → 구 VCN `revoked`

### 5. 거절 대응 (`decline_response`)

SOP 참조 (`playbook/decline-response.md`). 4단계 체크:
1. ☐ **원인 파악** (raw_payload 확인)
2. ☐ **조치 실행** (MCC 추가 / 해외결제 허용 등)
3. ☐ **고객 통지**
4. ☐ **재시도 확인**

### 6. 오프보딩 (`bulk_terminate`) — 부모

자식 N개 요약 테이블:
```
├ Alice-Claude Team          ✅ 해지 완료
├ Alice-ChatGPT Team          🟡 suspended (D+3/7)
├ Alice-Cursor Business       ✅ Bob 이관 완료
├ Alice-Anthropic API         🟠 고객 확인 대기
└ ...
```

[일괄 승인] 버튼 또는 자식별 개별 처리.

## Fast Path / Full Path 선택

화면 상단:
```
[🟢 Fast Path 승인] (SLA 30분 / 조건 충족 시)
[🟡 Full Path 검토] (SLA 2~24h / 기본)
```

조건 자동 감지:
```typescript
function suggestFastPath(req: ActionRequest): boolean {
  if (req.action_type !== 'limit_change') return false;
  const current = getCurrent Limit(req.target_account_id);
  const requested = req.request_data.new_limit_krw;
  if (requested > current * 1.5) return false; // Full
  if (requested > org.monthly_credit_limit_krw * 0.2) return false; // Full
  return true; // Fast
}
```

## 승인 / 반려

### [승인]
- `approved_at = now()`
- `assigned_to = $me`
- `status = 'approved'` → `in_progress`

### [반려]
- 모달: 반려 사유 입력 (고객에 전달)
- `status = 'rejected'`
- `rejection_reason = $reason`
- 고객 이메일 자동 발송

### [추가 질문] (메시지)
- `request_messages INSERT`
- 고객 포털에 실시간 알림

## 진행 상황 체크리스트 저장

각 체크박스 클릭 → `progress_state` UPDATE + `request_events INSERT`:
```sql
UPDATE action_requests
SET progress_state = jsonb_set(progress_state, '{vcn_issued}', 'true')
WHERE id = $1;

INSERT INTO request_events (action_request_id, event_type, event_data, actor_id)
VALUES ($1, 'progress_step_completed', 
  jsonb_build_object('step', 'vcn_issued'),
  $me);
```

## 고객 포털 동기화

모든 `status` / `progress_state` 변경은 고객 포털 `/app/requests/[id]` 에 **실시간 반영** (Supabase Realtime).

## 권한

- **Super / AM**: 모든 요청 처리
- **Ops**: 거절 대응 전용 (VCN 설정 변경)
- **Finance**: 청구서 관련 요청만
- **Fast Path**: Super / AM
- **Full Path (한도 ×2배 이상)**: Super 만

## 데이터 소스

```sql
SELECT ar.*, o.name AS org_name,
  m_req.name AS requester_name,
  m_tgt.name AS target_name,
  au.name AS assigned_to_name,
  sp.sla_hours,
  (SELECT json_agg(re.* ORDER BY re.created_at)
    FROM request_events re WHERE re.action_request_id = ar.id) AS events,
  (SELECT json_agg(rm.* ORDER BY rm.created_at)
    FROM request_messages rm WHERE rm.action_request_id = ar.id) AS messages
FROM action_requests ar
JOIN orgs o ON o.id = ar.org_id
JOIN members m_req ON m_req.id = ar.requested_by
LEFT JOIN members m_tgt ON m_tgt.id = ar.target_member_id
LEFT JOIN admin_users au ON au.id = ar.assigned_to
LEFT JOIN sla_policies sp ON sp.action_type = ar.action_type
WHERE ar.id = $1;
```

## 실시간 갱신

- 고객이 메시지 추가 → 우측 스레드 즉시 갱신
- 고객이 "교체 완료" 클릭 → status 변경 알림 (중앙 패널)

## Sprint 우선순위

**Sprint 2 필수**. `console/home.md` + `org_detail.md § 요청 탭` 에서 진입.

## 참조

- `action_requests`: `schemas/tables/action_requests.md`
- `request_events` / `request_messages`: 추후 P2 테이블
- `sla_policies`: `schemas/INDEX.md § 4 요청 워크플로`
- Fast/Full Path: `rules/service_first.md § PB-008-05`
- 거절 SOP: `playbook/decline-response.md`
- 오프보딩 PB-011: `rules/offboarding.md`
- 고객 포털 대응: `screens/customer/requests.md`
