# Billing / Screens / Customer / integrations — `/app/settings/integrations`

> 외부 도구 연동 관리. Slack Connect / Jira / Google Workspace / SSO 등. Owner/Admin 전용.

---

## 목적

고객이 Gridge Billing 을 기존 업무 도구와 연결. AM 과의 커뮤니케이션 채널 + 이벤트 외부 전파.

## 레이아웃

```
┌────────────────────────────────────────────────┐
│ 연동 관리                                        │
├────────────────────────────────────────────────┤
│ 🟢 Slack Connect (Alpha ↔ Gridge)                │
│    연결됨 · Alpha-Gridge 공유 채널                │
│    연결: 2026-04-01                              │
│                                                  │
│    [테스트 메시지]  [채널 설정]  [연결 해제]    │
│                                                  │
│    알림 전파 대상:                               │
│    ☑ 결제 거절                                   │
│    ☑ AM 메시지                                   │
│    ☑ 요청 승인 필요                              │
│    ☐ 일일 요약                                   │
│                                                  │
├────────────────────────────────────────────────┤
│ 🔌 연동 가능 (설치)                              │
│                                                  │
│ 💬 Slack (본인 워크스페이스 단일)                │
│    Gridge 이벤트를 본인 Slack 워크스페이스로    │
│    [연결]                                        │
│                                                  │
│ 🎫 Jira (Atlassian Cloud)                        │
│    결제 거절 → Jira 이슈 자동 생성              │
│    [연결]                                        │
│                                                  │
│ 📧 이메일 (CFO / Finance 별도 수신)              │
│    billing-alerts@alpha.co.kr                    │
│    [설정]                                        │
│                                                  │
│ 🔐 SSO (SAML / OIDC, Phase 2 지원)               │
│    단일 로그인 통합                              │
│    [Phase 2 지원]                                │
└────────────────────────────────────────────────┘
```

## Slack Connect 상세 설정 (가장 자주 사용)

```
┌────────────────────────────────────────────┐
│ Slack Connect 설정                           │
├────────────────────────────────────────────┤
│ 공유 채널명: #alpha-gridge                  │
│ 참여자:                                      │
│ ├ Alice Kim (Alpha Inc.)                    │
│ ├ Bob Lee (Alpha Inc.)                      │
│ └ Luna Song (Gridge AM)                     │
│                                              │
│ [추가 참여자 초대]  [Luna 에게 메시지]       │
│                                              │
│ 이벤트 전파 설정:                            │
│ ☑ 결제 거절 (실시간)                         │
│ ☑ VCN 발급 완료                              │
│ ☑ 월별 청구서 발행                           │
│ ☐ 일일 결제 요약 (09:00 KST)                 │
│ ☑ 크레딧백 종료 D-30                         │
│                                              │
│                            [저장]            │
└────────────────────────────────────────────┘
```

## 연동 설치 플로우 (일반)

```
[연결] 클릭
      ↓
[OAuth / API key 입력 모달]
  Slack: OAuth 콜백 (slack.com 으로 redirect)
  Jira: API token + Cloud URL 입력
  SSO: SAML metadata XML 업로드
      ↓
[백엔드 검증]
  - 토큰 유효성
  - 권한 범위 (scope) 확인
      ↓
[integrations UPSERT]
  config JSONB 저장 (민감 토큰은 Vault 별도)
  status = 'active'
      ↓
[테스트 메시지 / 핑 자동 발송]
      ↓
[완료 화면 + 설정 이어가기]
```

## 연동 해제

```
[연결 해제] 클릭 → 확인 다이얼로그

┌────────────────────────────────────┐
│ ⚠️ Slack Connect 연결 해제            │
│                                     │
│ 해제 후 더 이상 Slack 으로 알림이   │
│ 발송되지 않습니다. 복구하려면       │
│ 다시 연결해야 합니다.                │
│                                     │
│ 사유 (선택):                        │
│ [                                ]  │
│                                     │
│     [취소]     [연결 해제]          │
└────────────────────────────────────┘
```

해제 시:
- `integrations.status = 'disabled'`
- Vault 토큰 삭제
- `audit_logs INSERT (visibility='both', action='integration_removed')`

## 권한

- **Owner**: 모든 연동 추가 / 삭제 / 설정 변경
- **Admin**: 조회만, Owner 에게 요청
- **Member**: 접근 불가 (사이드바 숨김)

## 데이터 모델

Billing `integrations` 테이블 (AiOPS `integrations` 와 별개, G-091-06):
```sql
-- v0.26+ 별도 스키마 파일로 본문화
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
  integration_type TEXT CHECK (...),
  status TEXT,
  config JSONB,
  vault_ref TEXT,  -- Supabase Vault 참조
  last_verified_at TIMESTAMPTZ,
  enabled_by UUID REFERENCES members(id),
  ...
);
```

## Slack Connect 특별 처리

Slack Connect 는 **양측 동의** 필요:
- 고객 측: Owner 가 이 화면에서 [연결] 클릭 → 초대 URL 생성
- Gridge 측: Luna 가 초대 수락 → 공유 채널 생성 완료

AM 사이드에서 실패 시 고객에게 명확한 피드백:
```
⚠️ Gridge 측 승인 대기 중 (자동 진행)
  예상 10분 내 완료. 연락: luna@gridge.ai
```

## Phase 별 지원

| 연동 | Phase 0 | Phase 1 | Phase 2 |
|---|---|---|---|
| Slack Connect | ✅ 수동 | ✅ 자동 | ✅ |
| Slack 단일 | ❌ | ✅ | ✅ |
| Jira | ❌ | ✅ | ✅ |
| 이메일 CFO | ✅ | ✅ | ✅ |
| SSO SAML | ❌ | ❌ | ✅ |
| SSO OIDC | ❌ | ❌ | ✅ |

## 권한 재확인

연동 추가/해제는 모두 `audit_logs` 기록 (`visibility='both'`).

## Sprint 우선순위

**Sprint 3~4 권장**. Alpha 초기에 Slack Connect 만 있어도 충분. 나머지는 Phase 1 이후.

## 참조

- `integrations` 스키마 (v0.26+): `schemas/tables/integrations.md`
- Slack Connect SOP: `playbook/phase0-day1-runbook.md § D+0 온보딩`
- 알림 설정 연동: `screens/customer/notifications.md`
- Vault 토큰 관리: `07_coding_standard.md § G-100 Secret Management`
