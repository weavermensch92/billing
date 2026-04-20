# Billing / Rules / Service-First — UX 경계

> **PB-008** — 고객 = 조회·요청 / AM = 실행. 셀프서비스 비중을 인위적으로 높이지 않는다. Phase 2 자동화 이전에도 원칙 유지.

---

## PB-008-01. 원칙

**"고객은 요청하고 AM 이 실행한다."**

Gridge 가 Brex·Ramp 와 다른 이유는 **전담 AM 서비스**. 이 가치를 UI 에서 유지:

- 고객 포털 (`app.gridge.ai`) — **조회 + 요청** 중심
- 운영 콘솔 (`console.gridge.ai`) — **실행 + 관리** 중심

## PB-008-02. 고객 UI 에서 금지된 직접 액션

다음은 모두 **`action_requests` 경유 필수** — 고객이 직접 실행하는 버튼을 UI에 두지 않는다:

| 액션 | 고객 UI | 실행 주체 |
|---|---|---|
| VCN 신규 발급 | ❌ 직접 / ✅ 요청 wizard | AM (승인 → 카드사 발급) |
| VCN 한도 증액 | ❌ 직접 / ✅ 요청 | AM (또는 Super) |
| VCN 폐기 | ❌ 직접 / ✅ 요청 | AM |
| MCC 변경 | ❌ 직접 / ✅ 요청 | Ops |
| 해외결제 허용 | ❌ 직접 / ✅ 요청 | Ops |
| 결제 거절 재시도 | ❌ 직접 | 자동 (백업 레일) or Ops |
| 청구서 수정 | ❌ 직접 / ✅ 요청 | Finance |
| 크레딧백 연장 | ❌ 직접 / ✅ 요청 | AM (CSM 협상) |

## PB-008-03. 고객이 직접 가능한 액션 (자기 영역)

**본인 것 + 정보성**만 허용:

- 본인 프로필 수정 (`members` 본인 row UPDATE)
- 본인 알림 설정 (`notification_preferences`)
- 본인 계정 사용 내역 조회
- 본인 세션 로그아웃
- 데이터 내보내기 (Owner 만, 감사 로그 기록)

**조직 레벨** (Owner 만):
- 조직 정보 수정 (`orgs` 일부 필드, 사업자번호 제외)
- 팀 생성·관리
- 멤버 초대 (`action_requests INSERT`, 아직 승인 필요 X — 고객 내부 결정)
- Owner 양도 (본인 → 다른 admin)

## PB-008-04. 운영 콘솔 UX 패턴

### AM 이 실행 주체 (Human-in-the-Loop)

```
[고객 요청 action_requests] 
      ↓
[AM 큐 /console/requests] 새 요청 알림
      ↓
[AM 검토] 승인 / 반려 / 메시지 요청
      ↓ 승인 시
[AM 실행 단계] VCN 발급 체크리스트 UI 안내
      ↓
[외부 시스템] 신한 V-Card 포털 (Phase 0 수동) or API (Phase 1)
      ↓
[AM 결과 입력] issuer_token, last4 등
      ↓
[시스템] virtual_cards INSERT
[action_requests] status='awaiting_customer'
      ↓
[고객 알림] 1Password 공유 링크
```

### "자동 처리" 가 가능한 요청 (Phase 1+)

일부 요청은 AM 승인만 받고 시스템이 실행:
- 한도 증액 (AM 승인 한도 내) → 카드사 API 자동 호출
- VCN 폐기 (suspend → revoke) → 예약된 일정 자동 실행

**자동 처리해도 AM 승인은 반드시 받는다**.

## PB-008-05. 빠른 승인 (Fast Path) vs 상세 승인 (Full Path)

AM 이 요청 검토 시 2가지 경로:

### Fast Path (빠른 승인, ~30초)
- 명백한 케이스: 기존 계정의 단순 한도 증액 (월 한도의 1.5배 이내)
- `approved_at` 만 설정, 바로 실행 단계
- `sla_policies.fast_path` 기준

### Full Path (상세 승인, ~5~30분)
- 신규 계정, 새 서비스, 큰 한도 변경
- 필요 시 고객에게 `request_messages` 로 추가 질문
- `progress_state` JSONB 에 중간 단계 기록

**Phase 0 목표**: Fast Path 비율 **30%+**
**Phase 1 목표**: Fast Path 비율 **50%+** (학습 기반)

## PB-008-06. 셀프서비스 유혹 금지

다음 UX 제안이 나오면 **거부**:

❌ "VCN 폐기를 고객이 직접 할 수 있게" — Service-First 위반
❌ "결제 거절 발생 시 고객이 카드사에 직접 문의" — AM 가치 파괴
❌ "한도 증액 자동 승인 (AI 기반)" — AM 책임 회피

✅ "요청 wizard 에 AI 추천 템플릿 제공" — 고객 편의 + AM 검토 유지
✅ "승인 완료 시 실시간 Realtime 알림" — 투명성 개선
✅ "과거 유사 요청 자동 참조" — AM 효율 ↑ 고객 속도 ↑

## PB-008-07. 고객 포털 자동화 가능 영역

Service-First 원칙을 지키면서 자동화 가능한 것:

- **알림**: 요청 상태 변경 → 실시간 반영 (Supabase Realtime)
- **진행 상황 표시**: `progress_state` 기반 체크리스트 UI
- **예상 시간**: SLA 기반 "예상 완료 시각" 표시
- **과거 이력**: 본인 요청 히스토리 전체 접근

## PB-008-08. 자동 검증 체크리스트

Claude Code 가 고객 포털 UI 를 작성할 때:

- [ ] VCN 한도 입력 필드가 직접 저장 (API PATCH)?
- [ ] "계정 해지" 버튼이 accounts UPDATE 직접 호출?
- [ ] 청구서 금액 수정 UI 존재?
- [ ] 약관 화이트리스트 없는 서비스 선택 가능?
- [ ] 감사 로그에 `actor_type = 'admin'` 자동 설정 우회?

## PB-008-09. 예외 케이스

Service-First 예외는 다음 3가지만:

1. **본인 프로필 수정** — 개인 정보 자기 결정권
2. **알림 설정** — 개인화, 실행 범위 없음
3. **데이터 내보내기** (Owner) — 데이터 주권 (감사 로그 필수)

그 외 모든 변경은 `action_requests` 경유.

## PB-008-10. Phase 2 자동화 전환 시

Phase 2 에서 일부 영역 자동화 가능:
- 단순 한도 증액 (기존 계정, ±20% 이내)
- VCN 만료 자동 재발급 (동일 설정)
- 연체 자동 알림 발송

자동화해도:
- **AM 은 실행 이력 가시** (`/console/home` 대시보드)
- **예외 감지 시 개입** (`anomaly_events`)
- **월간 리뷰에서 패턴 검토**

## 참조

- 리셀러 구조: `rules/reseller.md` (PB-001)
- `action_requests` 테이블: `schemas/tables/action_requests.md`
- `sla_policies`: `schemas/INDEX.md § 4 요청 워크플로`
- 고객 포털 권한 매트릭스: `screens/customer/INDEX.md`
- 운영 콘솔 권한: `screens/console/INDEX.md`
- 원본: `01_서비스_정의.md § 10-1 Service-First 원칙`
