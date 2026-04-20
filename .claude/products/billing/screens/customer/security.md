# Billing / Screens / Customer / security — `/app/settings/security`

> 보안 설정. 2FA + 세션 정책 (본인) + IP 화이트리스트 + SSO (Owner 전용).

---

## 목적

멤버 개인은 2FA 설정. Owner 는 조직 레벨 보안 정책 (세션 타임아웃, IP 제한, SSO 강제).

## 레이아웃 (멤버)

```
┌──────────────────────────────────────────────┐
│ 보안                                           │
├──────────────────────────────────────────────┤
│ 🔐 2FA (이중 인증)                              │
│                                                │
│ 상태: 🟢 활성 (Google Authenticator)           │
│ 설정: 2026-04-05                              │
│                                                │
│ [2FA 재설정]  [백업 코드 재발급]               │
│                                                │
├──────────────────────────────────────────────┤
│ 🕐 세션 타임아웃                                │
│                                                │
│ 본인 세션: 30분 비활성 시 자동 로그아웃         │
│                                                │
│ (조직 정책에 따라 변경 불가)                    │
│                                                │
├──────────────────────────────────────────────┤
│ 📍 로그인 이력 (최근 10건)                       │
│                                                │
│ 2026-05-15 14:22 · Chrome · 서울 · 현재 세션    │
│ 2026-05-14 09:30 · Chrome · 서울                │
│ 2026-05-13 18:45 · Safari iOS · 서울             │
│ 2026-05-12 10:15 · Chrome · 서울                │
│ ...                                            │
│                                                │
│ [전체 보기]                                    │
└──────────────────────────────────────────────┘
```

## Owner 전용 섹션 (조직 보안 정책)

```
┌──────────────────────────────────────────────┐
│ 🏢 조직 보안 정책 (Owner 전용)                   │
├──────────────────────────────────────────────┤
│ 2FA 강제                                        │
│ ○ 선택 사항                                     │
│ ● 모든 Admin 필수                                │
│ ○ 모든 멤버 필수 (권장)                          │
│                                                │
│ 세션 타임아웃                                  │
│ ○ 15분  ● 30분  ○ 1시간  ○ 4시간               │
│                                                │
│ 동시 세션 수 제한                               │
│ ○ 제한 없음  ● 최대 3개  ○ 최대 1개              │
│                                                │
├──────────────────────────────────────────────┤
│ 🌐 IP 화이트리스트 (Owner 전용)                  │
│                                                │
│ 비활성 (모든 IP 허용)                            │
│ ○ 활성화                                        │
│                                                │
│ 활성화 시 등록 IP 만 로그인 가능:                │
│ (현재 비활성화 상태)                            │
│                                                │
│ ⚠️ 설정 변경 전 본인 IP 먼저 등록 필수           │
├──────────────────────────────────────────────┤
│ 🔐 SSO (Phase 2 지원 예정)                       │
│                                                │
│ 현재: 🟡 Phase 2 에서 활성화 예정               │
│                                                │
│ 지원 예정:                                      │
│ ├ SAML 2.0 (Okta, Azure AD, OneLogin)           │
│ ├ OIDC (Google Workspace, Auth0)                │
│ └ SCIM 2.0 (멤버 자동 프로비저닝)                │
└──────────────────────────────────────────────┘
```

## 2FA 설정 플로우

### 최초 활성화
```
[2FA 설정] 클릭
      ↓
[TOTP 앱 선택 가이드]
  Google Authenticator / Authy / 1Password / Microsoft Authenticator
      ↓
[QR 코드 표시 + 시크릿 문자열]
  - 앱으로 QR 스캔
  - 또는 시크릿 수동 입력
      ↓
[6자리 코드 입력 검증]
      ↓
[백업 코드 10개 생성 + 다운로드]
  ⚠️ 안전한 곳에 보관
      ↓
[2FA 활성화 완료]
```

### 재설정 (분실 시)
1. 이메일 본인 확인
2. 기존 2FA 비활성화
3. 신규 QR 설정

백업 코드 전부 사용 시:
- 이메일 인증 + Owner 수동 리셋 필요 (Phase 0)
- Phase 1+ 자동 복구 프로세스

## 세션 타임아웃 적용

```typescript
// 미들웨어 (Next.js)
async function sessionTimeoutCheck(req) {
  const session = await getSession(req);
  const org = await getOrg(session.org_id);
  const timeoutMinutes = org.session_timeout_minutes || 30;
  
  if (Date.now() - session.last_activity > timeoutMinutes * 60 * 1000) {
    await invalidateSession(session.id);
    return redirect('/login?reason=timeout');
  }
  
  // 활동 갱신
  await updateSessionActivity(session.id);
}
```

## IP 화이트리스트

CIDR 표기 지원:
```
등록 IP:
├ 203.0.113.0/24    본사 네트워크
├ 198.51.100.5      VPN 서버
└ 192.0.2.0/28      원격 근무 서브넷
```

활성화 시 주의:
- Owner 가 먼저 본인 IP 등록 안 하면 자기 차단 위험
- 확인 다이얼로그: "현재 IP (xxx.xxx.xxx.xxx) 가 등록 목록에 없습니다. 계속하시겠어요?"
- 비상 복구: Super (Gridge 측) 에 연락 → 수동 해제 가능

## 로그인 이력 (전체 페이지)

`/app/settings/security/login-history`:
```
기간: 최근 30일
[CSV 내보내기]

시각              IP              브라우저        OS          위치    결과
2026-05-15 14:22  203.0.113.5    Chrome 125     macOS       서울   ✅
2026-05-15 02:00  198.51.100.20  Unknown        -           홍콩   🔴 실패 (IP 차단)
...
```

의심스러운 로그인 탐지:
- 이례적 위치 + 시간
- 반복 실패
- 신규 디바이스 → 이메일 알림 자동

## 데이터 모델

보안 설정 테이블 (v0.26+):
```sql
-- org_security_policies (조직 정책)
-- member_security_settings (개인 2FA)
-- login_attempts (로그인 이력)
-- ip_whitelist (화이트리스트 규칙)
```

## 권한

- **멤버**: 본인 2FA + 로그인 이력 조회
- **Owner**: + 조직 정책 수정 + IP 화이트리스트 + SSO 설정

## Sprint 우선순위

**Sprint 4 권장**. 2FA 는 Owner 권장 사항, Alpha 에서 강제는 아님. IP 화이트리스트는 엔터프라이즈 전환 시.

## 참조

- 개인 정보 (본인 영역): `rules/service_first.md § PB-008-03`
- 감사 가시성: `rules/audit_visibility.md` (로그인 이력 = `both`)
- Phase 2 SSO: `rules/phase_transition.md § PB-013-03`
- IP 화이트리스트 보안 경고 SOP: `playbook/legal-tax-review.md` (추가 예정)
