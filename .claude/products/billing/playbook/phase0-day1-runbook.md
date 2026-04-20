# Billing / Playbook / Phase 0 Day-1 런북

> Alpha 고객 1개사 최초 온보딩 전수 절차. 계약 체결 → 첫 VCN 활성화까지. **Luna (AM) 주관**.

---

## 타임라인 개요

```
D-7   계약 체결 + 보안 심사
D-5   Slack Connect 채널 개설 + 킥오프 미팅
D-4   org 등록 + admin_users 배정 + 1Password 볼트 준비
D-3   서비스 카탈로그 최종 확정 + 벤더 약관 실사 (Alpha 사용 예정 서비스)
D-2   Owner/Admin 초대 발송 + 온보딩 가이드 공유
D-1   첫 계정 요청 wizard 리허설 (고객 담당자와 Zoom)
D+0   ★ Go-Live: 첫 VCN 발급 + 실결제
D+1~7 일일 운영 체크 + 이슈 대응
```

## D-7 — 계약 체결

### 필수 서명 문서
- [ ] 서비스 이용 약관 (Alpha 전용 템플릿, 법무 검토 완료)
- [ ] 크레딧백 프로그램 조건 명시
- [ ] 결제 사이클 티어 선택서 (Alpha 는 `monthly` 기본)
- [ ] 데이터 처리 동의서 (GDPR / 개인정보보호법)
- [ ] NDA

### 고객 정보 수집
- 사업자등록번호 (변경 불가 — PB-001 확인)
- 대표자명 / 주소 / 빌링 이메일
- Owner 예정자 (최초 초대 대상)
- 예상 사용 AI 서비스 목록
- 월 예상 결제액 → `monthly_credit_limit_krw` 산정 (× 1.3)

## D-5 — Slack Connect + 킥오프

### Slack 채널 생성
- 이름: `#gridge-{고객사}-billing`
- 참여자 (Gridge): Luna (AM) + 위버 (Super)
- 참여자 (고객): 기술 담당자 + 재무 담당자

### 킥오프 어젠다 (60분)
1. Gridge 서비스 설명 (10분)
2. 고객 현재 AI 사용 현황 인터뷰 (20분)
3. Alpha 전용 마일스톤 안내 (10분)
4. 질의응답 (20분)

### 고객 온보딩 가이드 전달
- VCN 사용 방법 (1페이지 PDF)
- 계정 요청 플로우 스크린샷
- 월간 리뷰 일정 예고

## D-4 — 시스템 준비

### org 등록 (`/console/orgs/new` — Super 전용)
```sql
INSERT INTO orgs (name, business_registration_no, representative_name,
                  address, billing_email, status)
VALUES ('Alpha Inc.', '123-45-67890', '홍길동',
        '서울 ...', 'accounting@alpha.co.kr', 'active');
-- audit_logs 자동 기록 (INSERT 트리거)
```

### org_contracts 생성
```sql
INSERT INTO org_contracts (
  org_id, contract_start_date, billing_tier,
  monthly_credit_limit_krw, creditback_rate, creditback_end_date
) VALUES (
  '{alpha_org_id}', CURRENT_DATE, 'monthly',
  10000000,   -- 월 1,000만 한도 (예상 ₩770만 × 1.3)
  0.100,
  CURRENT_DATE + interval '6 months'
);
```

### AM 배정
```sql
INSERT INTO am_assignments (org_id, admin_user_id, role)
VALUES ('{alpha_org_id}', '{luna_id}', 'primary');
```

### 1Password 볼트 준비
- 볼트 이름: `Gridge-VCN-Alpha`
- 접근자: Luna + 위버 (다른 운영자 접근 차단)
- 공유 링크 생성 규칙 문서화 (`1password.md` v0.20+)

## D-3 — 서비스 카탈로그 최종 확정

### Alpha 예정 서비스 10~15개 실사 (PB-006)
```sql
-- tos_review_status 검토
SELECT code, display_name, vendor, tos_review_status, is_active
FROM services
WHERE code IN (/* Alpha 예정 서비스 코드 리스트 */)
ORDER BY tos_review_status;
```

상태별 조치:
- `approved` → 즉시 사용 가능
- `conditional` → 고객 동의 체크박스 + customer_acknowledgment 기록
- `pending` → **Alpha 런칭 전 실사 완료 필수**
- `rejected` → 대체 서비스 제안 (예: ChatGPT Plus → ChatGPT Team)

### 신규 서비스 실사 프로세스
1. 공식 약관 URL 수집
2. "기업 대리 관리" 조항 확인
3. 필요 시 법무 자문 (playbook/legal-tax-review.md § 9-1)
4. `tos_review_status` + `tos_notes` 기록
5. `is_active = TRUE` 전환

## D-2 — Owner/Admin 초대

### 초대 이메일 발송 (Magic Link)
```typescript
// /console/orgs/[alpha_id]/members → [신규 초대]
await supabase.auth.admin.inviteUserByEmail('owner@alpha.co.kr', {
  data: { org_id: alphaOrgId, role: 'owner' },
  redirectTo: 'https://app.gridge.ai/onboarding',
});

// members INSERT
INSERT INTO members (org_id, email, name, role, status, invited_at, invited_by)
VALUES ('{alpha_id}', 'owner@alpha.co.kr', '홍길동', 'owner', 'invited',
        now(), '{luna_id}');
```

### 온보딩 가이드 체크리스트 (고객 측)
- [ ] Magic Link 수신 확인
- [ ] 초대 수락 → `/onboarding` 완료
- [ ] 프로필 설정 (이름, 전화)
- [ ] 알림 채널 확인 (이메일 + Slack)
- [ ] 첫 로그인 2FA 설정

## D-1 — 첫 계정 요청 리허설

### Zoom 미팅 (30분)
1. 고객 포털 로그인 확인 (Owner 계정)
2. `/app/services/new` 화면 투어
3. 샘플 요청 wizard 진행 (실제 생성 X, dry run)
4. 질의응답

### 리허설 시나리오
"Alice 가 Claude Team 을 쓰고 싶다":
1. Owner 가 `/app/services/new` 접속
2. 서비스 선택: Claude Team
3. 사용자 선택: Alice
4. 한도 설정: ₩30,000 / 월
5. 사유 입력: "AI 개발 리서치"
6. 요청 제출 → `action_requests INSERT`
7. Luna 에게 Slack 알림 전송 확인

## D+0 — Go-Live ★

### 최종 점검 (Luna 오전 9시)
- [ ] `/console/home` 정상 로드 (Alpha 고객사 표시)
- [ ] Supabase Realtime 구독 연결 확인
- [ ] 1Password 볼트 접근 테스트
- [ ] 신한 V-Card 포털 로그인 확인 (IP 화이트 체크)
- [ ] Smart Bill 계정 활성 확인

### 첫 실제 VCN 발급 (Day 1 주요 이벤트)
고객이 첫 요청 제출 → Luna 처리:
```
[Luna] 콘솔 요청 상세 → [승인]
  ↓
[Luna] 신한 V-Card 포털:
  1. 신규 VCN 발급 (한도 × 1.2)
  2. 유효기간 1년
  3. 해외결제 허용 (필요 시)
  4. MCC 화이트리스트 설정
  ↓
[Luna] 1Password 볼트에 VCN 전체 번호 저장
  ↓
[콘솔] 발급 완료 폼 입력 (issuer_token, last4, expires_at, 한도)
  ↓
[L2] virtual_cards INSERT + accounts INSERT
     action_requests.status = 'awaiting_customer'
  ↓
[1Password 공유 링크] 고객 담당자 이메일
  ↓
[고객] 7일 유효 링크로 VCN 수신 → AI 서비스에 등록
  ↓
[첫 결제 발생] accounts.status = 'active' 자동 전환
```

### Go-Live 직후 확인사항
- [ ] `audit_logs` 에 VCN 발급 이벤트 기록 확인
- [ ] 고객 포털 `/app/services` 에 신규 계정 표시 확인
- [ ] Supabase Realtime 으로 실시간 상태 업데이트 확인
- [ ] 위버 (Super) Slack 알림 수신 확인

## D+1 ~ D+7 — 일일 운영

### Luna 매일 아침 (09:00) 체크
- [ ] 요청 큐 확인 (`/console/requests?filter=pending`)
- [ ] 거절 알림 확인 (`/console/payments/declined`)
- [ ] 결제 이상 감지 확인 (`anomaly_events`)
- [ ] VCN 만료 임박 (`/console/vcn/expiring`)

### 일일 CSV Import (Phase 0 수동)
매일 18:00 신한 V-Card 포털 → 거래 내역 CSV 다운로드:
```bash
# /home/ops/import_transactions.sh
python ingest_shinhan_csv.py --file=transactions_$(date +%Y%m%d).csv --org=alpha
# → billing.transactions INSERT (is_anthropic_passthrough 자동 판정)
```

### 주간 리뷰 (금요일 15:00, 30분)
- Alpha 고객 Slack Connect 채널에서 짧은 체크인
- 이번 주 VCN 발급·해지 건수 요약
- 다음 주 예정 변경사항 확인

## D+30 — 첫 월말 마감

`playbook/month-end-close.md` 참조.

## 성공 기준 (Phase 0 Day-1~30)

- [ ] Alpha 첫 VCN 활성화 성공률 100%
- [ ] 일일 CSV import 빠짐 없음
- [ ] 요청 SLA 95% 준수
- [ ] 고객 NPS ≥ 8 (D+30 설문)
- [ ] 월말 정산 오차 < 0.5%

## 문제 발생 대응

### 첫 VCN 결제 거절
→ `playbook/decline-response.md`

### VCN 발급 실패
→ `playbook/card-issuer-ops.md § 7-1 신한 V-Card 실무`

### 약관 이슈 발견 (서비스 변경 필요)
→ Super 에스컬레이션 + `/console/super/services` 업데이트

## 참조

- 고객 포털 구조: `screens/customer/INDEX.md`
- 운영 콘솔 구조: `screens/console/INDEX.md`
- org / members / VCN 테이블: `schemas/tables/*.md`
- 원본: `07_운영_플레이북.md § Phase 0 Day-1 런북`
