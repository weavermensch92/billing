# Billing / Screens / Customer / notifications — `/app/settings/notifications`

> 알림 설정. 채널별 (이메일 / Slack / SMS) × 유형별 on/off + 조직 Owner 가 전체 기본값 설정.

---

## 목적

멤버가 본인이 받을 알림 세밀하게 제어. Owner 는 조직 전체 기본값도 설정.

## 레이아웃

```
┌────────────────────────────────────────────────┐
│ 알림 설정                                        │
├────────────────────────────────────────────────┤
│ 📧 이메일 알림                                   │
│    alice@alpha.co.kr                            │
│                                                  │
│    VCN 발급 완료          ● ON   ○ OFF          │
│    결제 거절              ● ON   ○ OFF          │
│    요청 상태 변경         ● ON   ○ OFF          │
│    월별 청구서 발행       ● ON   ○ OFF          │
│    크레딧백 종료 경고     ● ON   ○ OFF          │
│    멤버 초대 완료         ○ ON   ● OFF          │
│    주간 사용량 리포트     ● ON   ○ OFF          │
│                                                  │
├────────────────────────────────────────────────┤
│ 💬 Slack Connect 알림                            │
│    Alpha Inc. ↔ Gridge 채널                     │
│                                                  │
│    결제 거절 (긴급)        ● ON   ○ OFF          │
│    AM 메시지               ● ON   ○ OFF          │
│    요청 승인 필요          ● ON   ○ OFF          │
│                                                  │
│    [Slack 연결 테스트]                           │
│                                                  │
├────────────────────────────────────────────────┤
│ 📱 SMS 알림 (선택, 전화번호 등록 시)             │
│    +82-10-1234-5678                              │
│                                                  │
│    결제 거절 (긴급)        ○ ON   ● OFF          │
│    VCN 중지 (D+14+)        ● ON   ○ OFF          │
│    연체 D+30 (Owner 만)    ○ ON   ● OFF          │
│                                                  │
│    ⚠️ SMS 는 요금이 부과될 수 있습니다.          │
└────────────────────────────────────────────────┘
```

## 알림 유형 (event_type) 카탈로그

### 🟢 정보 (기본 ON, 중요)
- `vcn_issued` — VCN 발급 완료
- `vcn_delivered` — 1Password 공유 링크 수신
- `invoice_issued` — 월별 청구서 발행
- `invoice_paid` — 납부 확인

### 🟡 액션 필요 (기본 ON)
- `request_awaiting_customer` — 교체 완료 확인 필요
- `message_from_am` — AM 새 메시지
- `creditback_ending_d30` — 크레딧백 D-30 경고

### 🔴 긴급 (기본 ON, 끄기 어려움 UX)
- `payment_declined` — 결제 거절
- `vcn_suspended` — VCN 중지
- `overdue_warning_d14` — 연체 D+14

### ⚪ 정보성 (기본 OFF, 선택)
- `member_invited` — 다른 멤버 초대 완료
- `weekly_usage_report` — 주간 사용량 요약
- `service_tos_changed` — 사용 중 서비스 약관 변경

## Owner 조직 기본값 설정

Owner 전용 섹션:
```
┌────────────────────────────────────────────────┐
│ 🏢 조직 전체 기본값 (신규 멤버 적용)             │
│                                                  │
│ 신규 멤버 가입 시 기본 알림 설정:                │
│ ● 모든 알림 ON (권장)                            │
│ ○ 긴급만 ON                                      │
│ ○ 커스텀 세트                                    │
│                                                  │
│ 기존 멤버에게 일괄 적용:                         │
│ [일괄 적용]  (선택 사항)                         │
└────────────────────────────────────────────────┘
```

## 데이터 모델

`notification_preferences` 테이블 (v0.26+ 작성):

```sql
CREATE TABLE notification_preferences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID REFERENCES orgs(id) ON DELETE CASCADE,
  member_id    UUID REFERENCES members(id) ON DELETE CASCADE,
  
  -- 키: 채널 × 이벤트 타입
  channel      TEXT CHECK (channel IN ('email','slack','sms')),
  event_type   TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Owner 조직 기본값 (member_id NULL 가능)
  is_org_default BOOLEAN DEFAULT FALSE,
  
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE (org_id, member_id, channel, event_type)
);
```

## 변경 즉시 반영

- 토글 변경 → 자동 저장 (debounce 500ms)
- Toast 알림: "설정이 저장되었습니다"
- `audit_logs INSERT (visibility='customer_only', action='notification_preference_changed')`

## Slack Connect 연결 테스트

```
[Slack 연결 테스트] 클릭
  → 테스트 메시지 발송
  → "연결이 정상입니다 ✅" or "연결 실패, IT 담당자에게 문의"
```

실패 시 `integrations` 테이블 (`schemas/tables/integrations.md`, v0.26+) 상태 확인 안내.

## SMS 사전 동의

SMS 토글 처음 ON 시 모달:
```
⚠️ SMS 요금 안내
국내 SMS 는 건당 ~20원, 국제 SMS 는 건당 ~150원의 
요금이 발생할 수 있으며, 가입하신 월 서비스에 포함되어
청구됩니다.

□ 확인했습니다
[취소]  [활성화]
```

## 권한

- **본인**: 모든 설정
- **Owner**: 본인 설정 + 조직 기본값
- **Admin / Member**: 본인만

## Sprint 우선순위

**Sprint 4 선택**. 기본값으로 충분히 사용 가능, 개인 맞춤은 여유 시 개발.

## 참조

- `notification_preferences` (v0.26+): 추후 작성
- Slack 연동: `schemas/tables/integrations.md` (v0.26+)
- 감사 기본값 (본인 설정 = customer_only): `rules/audit_visibility.md` § PB-010-03
- Service-First 예외 (알림 = 본인 결정권): `rules/service_first.md § PB-008-09`
