# Billing / Rules / Audit Visibility — 감사 로그 3분할 가시성

> **PB-010** — `audit_logs.visibility` 3값 (`customer_only` / `internal_only` / `both`) 운영 규칙. 어떤 이벤트를 어느 쪽에 노출할지 결정하는 기준.

---

## PB-010-01. 3분할 의미

| visibility | 고객 포털 | 운영 콘솔 | 용도 |
|---|---|---|---|
| `customer_only` | ✅ 표시 | ❌ 숨김 | 고객 내부 액션 (내부 감사에 불필요) |
| `internal_only` | ❌ 숨김 | ✅ 표시 | 민감 운영 액션 (고객에 노출 부적절) |
| `both` | ✅ 마스킹 표시 | ✅ 전체 표시 | 공유 사건 (다른 시선) |

## PB-010-02. 가시성 결정 플로우차트

```
액션 발생
    ↓
누가 주체인가?
    ├─ 고객 (member/owner/admin) → 기본 'both' or 'customer_only'
    └─ 운영자 (admin_users) → 기본 'both' or 'internal_only'
    
세부 판단:
    ├─ 고객이 자기 정보 변경 (프로필 등) → 'customer_only'
    ├─ 고객 요청 → AM 처리 → 'both' (양쪽 모두)
    ├─ AM 내부 판단 (CSM 메모 등) → 'internal_only'
    ├─ 민감 데이터 조회 (VCN 전체 번호, margin 등) → 'internal_only'
    └─ 시스템 자동 이벤트 (배치 등) → 'both' or 'internal_only'
```

## PB-010-03. 액션 타입별 기본 가시성 카탈로그

### 고객 액션 (고객 주체)

| action_type | 기본 visibility | 비고 |
|---|---|---|
| `INSERT:members` (멤버 초대) | `both` | AM 도 추적 필요 |
| `UPDATE:members` (본인 프로필 수정) | `customer_only` | 고객 내부 결정 |
| `UPDATE:members` (role 변경) | `both` | 권한 변경은 공유 |
| `INSERT:action_requests` | `both` | AM 처리 대상 |
| `transfer_owner` | `both` | Gridge 도 추적 필요 |
| `UPDATE:orgs` (billing_email 등) | `both` | 청구 영향 |
| `data_export` (ZIP 다운로드) | `both` | 데이터 주권 감사 |

### 운영 액션 (AM/Ops/Finance/Super 주체)

| action_type | 기본 visibility | 비고 |
|---|---|---|
| `INSERT:virtual_cards` (VCN 발급) | `both` | 고객도 알 권리 |
| `UPDATE:virtual_cards` (한도 변경) | `both` | 고객 통지 |
| `view_full_card_number` | `internal_only` | 민감 조회 (Super만) |
| `UPDATE:transactions.gridge_margin_krw` | `internal_only` | 내부 회계만 |
| `INSERT:csm_notes` | `internal_only` | CSM 내부 메모 |
| `UPDATE:services.tos_review_status` | `internal_only` | 카탈로그 관리 |
| `INSERT:invoices` (청구서 발행) | `both` | 고객 수신 |
| `approve:action_requests` | `both` | 고객도 상태 변경 확인 |
| `reject:action_requests` | `both` | 사유 포함 공유 |

### 시스템 자동 이벤트

| action_type | 기본 visibility | 비고 |
|---|---|---|
| `invoice_generation_batch` | `internal_only` | 배치 운영 |
| `cross_check:aiops_billing_gap` (I-004) | `internal_only` | 내부 이상 감지 |
| `anomaly_detected:decline_burst` | `internal_only` | Ops 대응 |
| `creditback_applied` | `both` | 고객 크레딧백 내역 |

## PB-010-04. 마스킹 (both 이면서 민감 필드 포함)

`both` 감사 로그가 민감 정보 포함 시 고객 측 표시에서 마스킹:

```typescript
// 고객 포털 표시 함수
function renderAuditLog(log: AuditLog, viewerType: 'customer' | 'admin') {
  if (viewerType === 'customer') {
    return {
      ...log,
      before_data: maskSensitive(log.before_data),
      after_data: maskSensitive(log.after_data),
    };
  }
  return log;  // admin 은 그대로
}

function maskSensitive(data: any) {
  if (!data) return null;
  const masked = { ...data };
  // 민감 필드 마스킹
  if ('gridge_margin_krw' in masked) masked.gridge_margin_krw = '***';
  if ('raw_payload' in masked) masked.raw_payload = '[redacted]';
  if ('full_card_number' in masked) masked.full_card_number = '***';
  if ('internal_notes' in masked) masked.internal_notes = '[internal]';
  return masked;
}
```

## PB-010-05. 강제 가시성 (경고 / 오류)

특정 액션은 visibility 변경 금지:

**절대 `customer_only` 금지** (반드시 `internal_only` 이상):
- `view_full_card_number`
- `UPDATE:transactions` (임의 수정)
- `INSERT:csm_notes`

**절대 `internal_only` 금지** (반드시 고객에 공개):
- `INSERT:invoices` (발행)
- `data_deletion_confirmation` (해지 확인서)
- `transfer_owner` (고객 내부 통지 필요)

## PB-010-06. RLS 정책 (가시성 기반 SELECT)

```sql
-- 고객 포털 (Supabase Auth JWT)
CREATE POLICY "audit_logs_customer_view"
  ON audit_logs FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM members
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
    AND visibility IN ('customer_only', 'both')
  );

-- 운영 콘솔 (admin Auth 별도, 서버 미들웨어)
-- visibility='customer_only' 는 숨김
-- 나머지 전체 표시
```

## PB-010-07. 구현 체크리스트 (개발 시)

감사 로그 INSERT 코드 작성 시:

```typescript
// ❌ 잘못된 예 (visibility 누락)
await db.insert('audit_logs', {
  org_id, actor_type, actor_id, action_type,
  target_table, target_id, before_data, after_data,
  // visibility 빠뜨림 → DEFAULT 'both' 로 들어가지만 의도 불명확
});

// ✅ 올바른 예 (명시)
await db.insert('audit_logs', {
  org_id, actor_type, actor_id, action_type,
  target_table, target_id, before_data, after_data,
  visibility: 'internal_only',  // 명시적 지정
  description: 'AM viewed full VCN for account xxx (rare operation)',
});
```

## PB-010-08. 정기 감사 (분기별)

Super 가 분기마다 가시성 분포 체크:

```sql
SELECT visibility, action_type, COUNT(*)
FROM audit_logs
WHERE created_at >= now() - interval '3 months'
GROUP BY visibility, action_type
ORDER BY COUNT(*) DESC;
```

이상 패턴 감지:
- `customer_only` 이면 안 되는 액션이 그 값으로 분류?
- `internal_only` 인데 고객 통지 필요한 경우?

## PB-010-09. 자동 검증 체크리스트

- [ ] `view_full_card_number` 가 `customer_only` 또는 `both` 로 기록?
- [ ] `INSERT:invoices` 가 `internal_only` 로 기록 (고객에 숨김)?
- [ ] `csm_notes` INSERT 가 `customer_only` 로 기록?
- [ ] `gridge_margin_krw` 변경이 마스킹 없이 고객 포털 노출?
- [ ] `audit_logs` 에 visibility 필드 누락 (NULL)?

## PB-010-10. 참조

- Immutable 원칙: `rules/immutable_ledger.md` (PB-005)
- audit_logs 테이블: `schemas/tables/audit_logs.md`
- RLS 정책 상세: `schemas/tables/audit_logs.md § RLS`
- 고객 포털 감사 로그 UI: `screens/customer/audit_log.md` (v0.22)
- 콘솔 감사 로그 UI: `screens/console/audit_log.md` (v0.22)
- 해지 후 보존: `playbook/termination.md § D+30 완전 삭제`
