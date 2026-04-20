# Billing / Playbook / Decline Response — 결제 거절 대응 SOP

> VCN 결제 거절 발생 시 24시간 내 해결. Ops / AM 주관. 5분 내 10건 초과 → Super 에스컬레이션.

---

## 거절 카테고리 (카드사 코드 매핑)

| 코드 | 의미 | 일반 원인 | 대응 |
|---|---|---|---|
| `OVERSEAS_BLOCK` | 해외 결제 차단 | VCN 해외결제 허용 미설정 | VCN `allow_overseas = TRUE` 변경 |
| `LIMIT_EXCEEDED` | 한도 초과 | 월 한도 / 건당 한도 초과 | 한도 증액 요청 (AM or Super) |
| `MCC_BLOCK` | MCC 차단 | 화이트리스트 밖 가맹점 | MCC 확인 후 화이트리스트 추가 |
| `EXPIRED` | 유효기간 만료 | 갱신 누락 | 신규 VCN 발급 + 고객 재등록 |
| `FRAUD_SUSPECTED` | 이상 거래 감지 | 카드사 자체 판단 | 카드사 긴급 문의 |
| `INSUFFICIENT_FUNDS` | Gridge 법인카드 한도 초과 | Gridge 대지급 한도 도달 | 즉시 Super 알림 (대형 이슈) |
| `UNKNOWN` | 원인 불명 | — | Ops 수동 분석 |

## 거절 감지 → 알림 플로우 (자동)

```
[카드사 웹훅] 결제 거절 수신 (Phase 1) / 일일 CSV import 감지 (Phase 0)
      ↓
[Billing] transactions INSERT (status='declined', decline_reason=...)
      ↓
[anomaly_detector] 룰 평가
      ├─ 일반 거절 → Ops 큐 배치 (24시간 SLA)
      └─ 5분 내 10건+ → 긴급 알림 (Super + Slack)
      ↓
[action_requests] INSERT (type='decline_response', parent 연결)
      ↓
[Slack 알림] #gridge-ops 채널
      ↓
[고객 포털 /app/services] 계정 상태 배지 🔴
```

## 24시간 SLA 대응 (일반 거절)

### 1단계: 원인 파악 (30분 내)

Ops 가 `/console/payments/declined/[txnId]` 접속:

```
┌──────────────────────────────────────────────────┐
│ 거절 건 #txn_abc123                                │
│                                                    │
│ 🔴 OVERSEAS_BLOCK                                  │
│                                                    │
│ 고객사: Alpha Inc.                                 │
│ VCN:    신한 ****1234                              │
│ 계정:   Alice / Lovable                            │
│ 가맹점: LOVABLE.DEV (USD $30)                      │
│ 시각:   2026-05-15 14:23:45                        │
│                                                    │
│ [카드사 원본 로그]                                 │
│ {...raw_payload...}                                │
└──────────────────────────────────────────────────┘
```

Ops 판단: VCN 해외결제 허용 설정 누락 → **빠른 승인**.

### 2단계: 조치 실행 (30분~2시간 내)

#### Case A — VCN 설정 변경

```sql
UPDATE virtual_cards
SET allow_overseas = TRUE,
    updated_at = now()
WHERE id = '{vcn_id}';
-- audit_logs 자동 기록
```

카드사 포털에서 실제 설정 변경 (Phase 0 수동):
- 신한 V-Card 포털 → VCN 상세 → "해외결제 허용" 토글
- 반영 지연 10~30분

#### Case B — 한도 증액

AM 판단 범위 (× 2배 까지):
```sql
UPDATE virtual_cards
SET monthly_limit_krw = monthly_limit_krw * 2
WHERE id = '{vcn_id}';
```

초과 증액 → Super 승인 필요 (`/console/super/danger`):
```sql
-- 2단계 승인 필요
UPDATE virtual_cards
SET monthly_limit_krw = 5000000  -- 5배 증액
WHERE id = '{vcn_id}';
-- approved_by (1) + counter_signed_by (2) 기록
```

#### Case C — MCC 추가

```sql
UPDATE virtual_cards
SET allowed_mcc = array_append(allowed_mcc, '5734')
WHERE id = '{vcn_id}';
```

#### Case D — VCN 재발급

유효기간 만료 / 보안 이슈:
1. 신규 VCN 발급 (신한 V-Card 포털)
2. `virtual_cards` INSERT (role='primary')
3. 기존 VCN `status = 'suspended'` 전환 (7일 유예)
4. 1Password 공유 링크 재발송
5. 고객 "교체 완료" 체크 후 구 VCN `revoked`

### 3단계: 고객 통지 (Slack + 이메일)

```
Alpha Inc. 담당자님,

{가맹점명} 결제가 일시적으로 거절되어 조치를 완료했습니다.

원인: 해외 결제 허용 설정 누락
조치: VCN 해외 결제 허용 변경 (완료)

재시도는 약 30분 후 가능합니다.
다음 결제는 정상 처리될 예정입니다.

불편을 드려 죄송합니다.
Luna (Gridge AI Account MSP)
```

### 4단계: 재시도 및 확인 (2~4시간 내)

카드사 재시도 요청 또는 자연스러운 다음 청구 주기 도래:
- [ ] 재시도 결제 `authorized` 상태 확인
- [ ] `action_requests.status = 'completed'`
- [ ] `request_events INSERT (event_type='decline_resolved')`

## 긴급 에스컬레이션 (5분 내 10건 이상)

### 자동 트리거 (anomaly_rules)

```sql
-- anomaly_rules
INSERT INTO anomaly_rules (rule_name, trigger_condition, severity)
VALUES (
  'decline_burst',
  jsonb_build_object(
    'count_threshold', 10,
    'time_window_minutes', 5,
    'status', 'declined'
  ),
  'high'
);
```

감지 시 자동 액션:
1. **신규 VCN 발급 전면 중단** (추가 피해 방지):
   ```sql
   UPDATE service_flags SET vcn_issuance_paused = TRUE;
   ```
2. **Super 긴급 Slack 알림** (실시간 PagerDuty 역할):
   ```
   🚨 거절 급증 감지 (5분 내 15건)
   Alpha Inc. / 신한 V-Card
   자동 VCN 발급 중단됨
   → 즉시 카드사 문의 필요
   ```
3. **anomaly_events INSERT (severity='critical')**

### 대응 (Super 30분 내)

1. **카드사 긴급 문의**
   - 신한 V-Card 담당자 직접 전화 (연락처 `1password/gridge-ops-contacts`)
   - 상황 요약: "Gridge 발급 VCN 집단 거절, 사기 의심?"
2. **고객사 상황 공지 준비**
   - Slack Connect 채널에 상황 공유
   - "결제 지연 가능성" 사전 고지
3. **백업 레일 활성화 (Phase 1 이후)**
   - KB SmartPay VCN 자동 전환
   - `virtual_cards.role = 'backup'` 활성화

## 거절 로그 아카이브 (원인 분석)

매주 금요일 Ops 미팅:
- 이번 주 거절 건수 / 카테고리 분포
- Top 3 원인 + 재발 방지 조치
- 카드사 정책 변경 감지

## Phase 0 → 1 자동화

| 기능 | Phase 0 | Phase 1 |
|---|---|---|
| 거절 감지 | 일일 CSV import | 실시간 웹훅 |
| 원인 분류 | Ops 수동 | 룰 기반 자동 분류 |
| VCN 설정 변경 | 신한 포털 수동 | 카드사 API 자동 |
| 고객 통지 | Slack 수동 | 템플릿 자동 발송 |
| 백업 레일 | 없음 | KB SmartPay 자동 전환 |

## KPI

- **거절 대응 SLA**: 24시간 내 해결률 95%+
- **평균 해결 시간**: 4시간 이내
- **자동 분류 비율** (Phase 1): 70%+
- **재발 방지 조치 적용**: 동일 원인 재발 < 10%

## 참조

- `transactions` 상태: `schemas/tables/transactions.md`
- `anomaly_events` / `anomaly_rules`: `schemas/INDEX.md § 6`
- 카드사 실무: `playbook/card-issuer-ops.md`
- 원본: `07_운영_플레이북.md § 거절·장애 대응 SOP`
