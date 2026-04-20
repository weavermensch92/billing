# Billing / Rules / VCN — Virtual Card Number 라이프사이클

> **PB-002** — VCN 발급·한도·MCC·해외결제·폐기 전 과정 규칙. Phase 0 수동 vs Phase 1 API 분기.

---

## PB-002-01. VCN 상태 머신

```
pending ──▶ approved ──▶ issuing ──▶ issued ──▶ delivered ──▶ active
                               │        │                         │
                               │        └──▶ revoked/expired      │
                               ▼                                  │
                            failed                                │
                               │                                  │
                        retry or escalate                         ▼
                                                              suspend ──▶ revoked
```

상태 전이 규칙:
- `pending → approved`: AM 콘솔 승인 액션
- `approved → issuing`: 카드사 API 호출 시작 (또는 Phase 0 수동 모드 진입)
- `issuing → issued`: 카드사 발급 완료, `issuer_token` / `last4` 수신
- `issued → delivered`: 1Password 공유 링크 전달 완료
- `delivered → active`: 첫 결제 authorized 성공 이벤트
- `active → suspend`: 일시 중지 (해지 유예 기간)
- `suspend → revoked`: 영구 폐기
- `failed`: issuing 실패 → 재시도 (최대 3회) → 에스컬레이션

역순 전이 절대 금지. `audit_logs` 에 모든 전이 기록.

## PB-002-02. Phase 0 수동 워크플로 (Alpha 고객 전용)

```
[Luna] 콘솔 요청 상세 → [승인]
       │
       ▼
[콘솔] "VCN 발급 대기" 상태 + Luna 작업 체크리스트
       │
       ▼
[Luna] 별도 브라우저 → 신한 V-Card 포털 로그인 (IP 화이트 체크)
       │  1. 신규 VCN 발급
       │  2. 한도 설정 (요청 한도 × 1.2)
       │  3. 유효기간 1년
       │  4. 발급 번호 → 1Password 공유 볼트 저장
       ▼
[콘솔] "발급 완료" 입력 폼
       │  - issuer_token (카드사 내부 ID)
       │  - last4
       │  - expires_at
       │  - monthly_limit_krw
       │  - per_txn_limit_krw
       ▼
[L2] virtual_cards INSERT + accounts INSERT
     action_requests.status = 'awaiting_customer'
       ▼
[L3 1Password] 공유 링크 생성 → 고객 담당자 이메일
       ▼
[7일 유효] 고객이 VCN 을 AI 서비스에 등록
       ▼
[첫 결제 발생] accounts.status = 'active' 자동 전환
```

## PB-002-03. Phase 1 자동 워크플로

카드사 VCN API 계약 후:
- 자동 발급 API 호출
- 웹훅 수신으로 `issuing → issued` 자동 전환
- 1Password Connect 서버로 공유 링크 자동 생성
- 정상 케이스 평균 30초 이내 완료

## PB-002-04. 한도 정책

`virtual_cards` 컬럼:
- `monthly_limit_krw` — 월 한도 (요청가 × 1.2 버퍼 기본)
- `per_txn_limit_krw` — 건당 한도 (월 한도의 50%)
- `role` — `primary` / `backup`

**한도 변경 권한**:
- 증액: AM 직접 (한도 × 2배까지) / Super (그 이상)
- 감액: AM 직접
- 고객 요청 시에는 `action_requests` 경유 (PB-008 Service-First)

## PB-002-05. MCC 제한 (가맹점 업종 코드)

VCN 발급 시 허용 MCC 화이트리스트 설정.

AI 서비스 일반 MCC:
- `5734` Computer Software
- `7372` Computer Services
- `5817` Digital Goods

잘못 설정 시 결제 거절 → 거절 대응 SOP (v0.20 playbook).

카드사별 MCC 지원 범위 상이:
- 신한 V-Card: 허용 MCC 목록 설정 가능
- KB SmartPay: 일부만

## PB-002-06. 해외결제 정책

**기본 차단** → VCN 별 허용 신청 필요.

해외 SaaS 사용 시 허용 필수:
- Lovable, Manus, Replit, v0 등 해외 에이전트 서비스
- Anthropic API (USD 결제)
- OpenAI API (USD 결제)

Phase 0 Alpha 고객 Lovable 사용 시 사전 허용 확인 필수.

## PB-002-07. 폐기 (Revoke) 정책

**즉시 폐기**: 진행 중 결제도 실패 가능 → 위험
**유예 폐기** (권장):
1. `status = 'suspend'` 전환 (신규 결제 차단, 기존 유지)
2. 7일 유예
3. `status = 'revoked'` 영구 폐기

폐기 트리거:
- 멤버 오프보딩 (PB-011, v0.19)
- 고객 해지 (D+0 시점)
- 보안 이슈 (즉시 폐기)
- 유효기간 만료 (자동)

## PB-002-08. 카드사 선택 정책

| 카드사 | 우선순위 | 이유 |
|---|---|---|
| 신한 V-Card | 1순위 | 해외결제 승인률 ↑, VCN API 지원 |
| KB SmartPay | 2순위 (백업) | 신한 장애 시 fallback |
| 해외 VCN (Wise Business / Airwallex) | Phase 2 검토 | 2차 레일 |

Primary·Backup 구조:
```sql
virtual_cards.role  TEXT CHECK (role IN ('primary','backup'))
```

결제 거절 시 `anomaly_rules` 에 따라 backup VCN 자동 전환 (Phase 1 구현).

## PB-002-09. 일일 발급 한도 (신한 기본)

- 일일 20장 (초과 시 신한 담당자 승인 필요)
- 월초 조정 신청 가능

Phase 0 Alpha 고객 1개사 기준 월 평균 계정 10~15개 → 여유 충분.
Phase 2 고객 20개사 돌파 시 일일 한도 상향 협상 필요.

## PB-002-10. 전체 번호 취급 절대 규칙

```sql
virtual_cards 테이블에 VCN 전체 번호 저장 금지
```

저장 가능 필드만:
- `issuer_token` (카드사 내부 ID)
- `last4` (마지막 4자리)
- `expires_at`
- 한도·MCC·role

VCN 전체 번호는:
- 카드사 API 호출로만 임시 조회 (Super 역할 + 감사 로그 필수)
- 1Password 공유 링크 (DB 에 링크 URL 저장하지 않음)
- 고객 전달 후 즉시 메모리에서 제거

## PB-002-11. 자동 검증 체크리스트

- [ ] DB 스키마에 VCN 전체 번호 저장 필드 신설?
- [ ] 해외결제 허용 없이 해외 SaaS 계정 등록?
- [ ] MCC 화이트리스트 누락?
- [ ] 폐기 시 `suspend` 거치지 않고 바로 `revoked`?
- [ ] 한도 증액이 Super 권한 필요 레벨인데 AM 직접 실행?

## 참조

- 카드사 API 설계: `playbook/card-issuer-ops.md` (v0.20)
- 1Password 볼트 구조: `playbook/1password.md` (v0.20)
- VCN 관리 콘솔 UI: `screens/console/vcn.md` (v0.19)
- `virtual_cards` 테이블: `schemas/tables/virtual_cards.md` (v0.19)
- Service-First 경계: `rules/reseller.md` (PB-001) + PB-008
- 원본 기획: `02_시스템_아키텍처.md § 7 VCN 발급 워크플로`
