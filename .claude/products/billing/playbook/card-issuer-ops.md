# Billing / Playbook / Card Issuer Ops — 카드사 실무

> 신한 V-Card (1순위) + KB SmartPay (백업). Phase 0 수동 포털 → Phase 1 B2B API 전환.

---

## 신한 V-Card (1순위)

### 계약 구조
- 신한카드 법인카드 발급 (Gridge 명의)
- V-Card 서비스 추가 (VCN 발급 기능)
- Phase 1 진입 시 별도 **B2B API 계약** (유료)

### 일일 발급 한도

| 구분 | 기본 | 확장 |
|---|---|---|
| 일일 | 20장 | 신한 담당자 승인 후 증액 |
| 월초 | 조정 신청 가능 | — |

Phase 0 Alpha 1개사 기준 월 평균 VCN 10~15장 발급 → 여유 충분.
Phase 2 고객 20개사 돌파 시 일일 한도 상향 협상 필요.

### MCC (가맹점 업종 코드) 제한

AI 서비스 일반 MCC:
- `5734` Computer Software
- `7372` Computer Services
- `5817` Digital Goods

VCN 발급 시 허용 MCC 목록 설정. 잘못 설정 시 결제 거절.

추가 MCC 필요 시 (ex. Manus 의 Agent 서비스):
1. 해당 가맹점 MCC 조회 (카드사 문의)
2. VCN 발급 시 화이트리스트 추가
3. 기존 VCN 수정 (Phase 0 포털 수동 / Phase 1 API)

### 해외결제 차단 정책

**기본 차단** → VCN 별 허용 신청 필요.

Alpha 고객 사용 시:
- Lovable (USD) — 허용 필수
- Manus (USD) — 허용 필수
- Anthropic API (USD) — 허용 필수
- OpenAI API (USD) — 허용 필수

**주의**: 허용 신청 반영 지연 10~30분.

### VCN 폐기 처리

**즉시 폐기의 위험**: 진행 중 결제도 실패 가능.

권장 유예 처리:
```
Step 1: status = 'suspended'  (신규 결제 차단, 기존 유지)
        (7일 유예)
Step 2: status = 'revoked'  (영구 폐기)
```

트리거:
- 멤버 오프보딩 (PB-011)
- 고객 해지 (D+0 시점)
- 보안 이슈 (즉시 폐기)
- 유효기간 만료 (자동)

### Phase 1 B2B API 전환

**계약 요소**:
- HMAC 키 관리 (서버 환경변수 or Supabase Vault)
- IP 화이트리스트 (Gridge API 서버 IP)
- Sandbox 환경 먼저 충분히 검증 (최소 2주)

**주요 엔드포인트** (예상):
- `POST /vcn/issue` — 신규 VCN 발급
- `PATCH /vcn/:token/limit` — 한도 변경
- `POST /vcn/:token/suspend` — 일시 중지
- `POST /vcn/:token/revoke` — 영구 폐기
- `GET /vcn/:token` — 상태 조회
- 결제 웹훅: `POST /your-endpoint/transactions` — 실시간 이벤트

**웹훅 서명 검증**:
```typescript
// 모든 웹훅은 HMAC-SHA256 서명 필수
const signature = req.headers['x-shinhan-signature'];
const expected = hmacSha256(req.rawBody, SHINHAN_WEBHOOK_SECRET);
if (signature !== expected) throw new Error('Invalid signature');
```

**Phase 1 전환 전 검증 항목**:
- [ ] 테스트 VCN 100건 발급 / 해지 성공
- [ ] 웹훅 처리 평균 지연 < 3초
- [ ] 장애 시 fallback 경로 검증 (polling)
- [ ] 일일 API 호출 한도 확인

## KB SmartPay (2순위, 백업)

### 신한 대비 차이
| 항목 | 신한 V-Card | KB SmartPay |
|---|---|---|
| 해외결제 허용률 | 높음 | 약간 낮음 |
| 일일 발급 한도 | 20장 | 15장 |
| API 지원 범위 | 넓음 | 제한적 |
| 웹훅 지원 | 실시간 | 10분 지연 |

### 용도
- **Alpha 기간**: 신한 100% 사용. KB 는 비상용.
- **Phase 1 이후**: 고객별 Primary=신한 + Backup=KB 구조.
- **장애 대응**: 신한 다운 시 자동 KB 전환.

### Phase 1 백업 레일 자동 전환

```
[신한 결제] 거절 (OVERSEAS_BLOCK 이외 에러)
      ↓
[anomaly_rules] auto_fallback_backup 룰 매칭
      ↓
[Billing] 같은 account_id 의 role='backup' VCN 조회
      ↓ 발견
[재시도] KB SmartPay VCN 으로 결제 재시도
      ↓
[transactions INSERT] 성공 기록 + sourced_from='backup_retry'
```

## 해외 VCN — Phase 2 검토

**Wise Business** / **Airwallex**:
- USD 원가 직접 결제 → 환차 감소
- 신한/KB 대비 해외 승인률 ↑
- 부가세 처리 복잡 (국내 매입 아님)

Phase 2 고객 확장 시 검토 포인트:
- 해외 SaaS 비중 > 40% 고객사 대상
- 세무 자문 재검토 필수

## 1Password 볼트 구조

고객사별 분리:
- `Gridge-VCN-Alpha` — Alpha 고객 전용
- `Gridge-VCN-Beta` — Beta 고객 전용
- ...

### 공유 링크 생성 규칙
- 1Password 앱 → 해당 아이템 → Share
- **유효기간 7일**
- **1회 조회 후 자동 만료** 옵션
- 공유 URL 을 DB 에 저장하지 않음 (이메일만)

### 접근 권한
- **Luna**: Gridge-VCN-* 전체 볼트 접근
- **다른 운영자**: 담당 고객 볼트만

### Phase 1 1Password Connect
- Connect 서버 배포 (Docker or Fly.io)
- 자동 아이템 생성 + 공유 링크 API 호출
- VCN 발급 → 1Password 저장 → 공유 링크 → 고객 이메일 = 자동

## 카드사 정기 소통

### 월간 카드사 담당자 체크인
- 이번 달 VCN 발급·폐기 건수
- 거절 이슈 요약
- 정책 변경 사전 고지 수신

### 분기 리뷰
- Gridge 월 매출 대비 Primary/Backup 비율
- 발급 한도 상향 필요 여부
- 새 기능 (신규 MCC, API 엔드포인트) 정보

## 비상 연락망

`1password/gridge-ops-emergency-contacts` 에 저장:
- 신한 V-Card 담당자 (이름 / 전화 / 이메일)
- KB SmartPay 담당자
- Gridge 내부 에스컬레이션 (위버 / Luna)

## 참조

- VCN 규칙: `rules/vcn.md` (PB-002)
- 거절 대응: `playbook/decline-response.md`
- 1Password Connect: `playbook/1password.md` (향후)
- 원본: `07_운영_플레이북.md § 7-1 신한 V-Card 실무`
