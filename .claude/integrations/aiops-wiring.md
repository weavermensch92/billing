# Integrations / AiOPS → Wiring — 규칙 본문

> I-001 본문. AiOPS 로그 데이터를 Wiring 대시보드에 노출하는 파이프라인.
> 통합 고객사 (Wiring + AiOPS 동시 사용) 대상. 로그/비용/거버넌스 단일 뷰.

---

## I-001 — AiOPS → Wiring 로그 파이프라인 (SHOULD)

### 전제

- 통합 고객사: Wiring 도입 후 AiOPS 활성화한 조직
- Wiring의 "보고서" / "로그" / "비용 관리" 탭에서 AiOPS 데이터 함께 표시
- AiOPS 단독 고객에게는 Wiring 연동 탭 자체 숨김

---

## I-001-01 — 통합 조건 (MUST)

### 동일 org_id 매칭

```sql
-- Wiring org 와 AiOPS org 는 동일 UUID 공유 (서로 다른 org 불허)
SELECT * FROM wiring.orgs WHERE id = $org_id;
SELECT * FROM aiops.orgs  WHERE id = $org_id;
```

조직 생성 시 한 번에 양쪽 org 생성:
```typescript
async function createOrg(input: OrgInput) {
  const orgId = uuid();
  await db.transaction(async (trx) => {
    await wiring.orgs.insert({ id: orgId, ... }, trx);
    if (input.aiops_enabled) {
      await aiops.orgs.insert({ id: orgId, ..., api_token: genToken() }, trx);
    }
  });
  return orgId;
}
```

### Mode 일치

Wiring / AiOPS 의 Mode 설정이 **일치해야 함**:
- Wiring Mode A → AiOPS Mode A (SaaS)
- Wiring Mode B → AiOPS 온프레미스 (PA-011)
- Mode 불일치 감지 시 → 통합 연동 비활성 + OA 경고

---

## I-001-02 — 데이터 공유 범위 (MUST)

| 데이터 | AiOPS 제공 | Wiring 사용 |
|---|---|---|
| 로그 메타 (채널/모델/토큰) | ✅ | 대시보드 집계 |
| 프롬프트 요약 | ✅ (`prompt_summary`) | 로그 탭 표시 |
| 프롬프트 원문 | 옵션 (`prompt_storage='full'`) | 제한적 (권한별) |
| PII 감지 이벤트 | ✅ | 알림 인박스 |
| AI 성숙도 점수 | ✅ | 조직 보고서 |
| users / 팀 매핑 | 양방향 | SSO 기반 통일 |

### 금지 사항

- Wiring 의 `hitl_cards` / `rule_timeline` 이 AiOPS 로 흘러가면 안 됨 (역방향 I-003 참조)
- AiOPS 의 `api_token` 은 Wiring UI 에 **원문 노출 절대 금지** (G-150)

---

## I-001-03 — 이벤트 전달 방식 (MUST)

### 1. 실시간 (WebSocket)

- AiOPS 로그 적재 시 Wiring 로그 탭에 즉시 반영
- 이벤트 타입: `aiops:log_insert`, `aiops:pii_detected`, `aiops:cost_spike`

```typescript
// Wiring 클라이언트
socket.on('aiops:log_insert', (log) => {
  useLogStore.getState().prepend(log);
});

// AiOPS → Wiring 이벤트 발행 (동일 org_id)
publishToWiring(org_id, 'aiops:log_insert', {
  log_id, channel, model, latency_ms, cost_usd
});
```

### 2. 배치 (집계)

- 주간 성숙도 / 비용 집계는 배치 처리
- Wiring 의 "보고서" 탭이 AiOPS API 호출 (Server-side cached)

---

## I-001-04 — Wiring UI 통합 지점 (MUST)

### 보고서 탭

- 주간 보고서에 AiOPS 섹션 추가
- "AI 도구 사용 현황" / "채널별 비율" / "팀별 성숙도"
- 단, AiOPS 미활성 조직은 섹션 숨김

### 로그 탭

- 기존 Wiring 로그 (AI 에이전트 활동) + AiOPS 로그 (외부 AI 도구 사용) 양쪽 표시
- 필터: `source: wiring | aiops | all`

### 비용 관리 탭

- Wiring 비용 (LucaPus 에이전트) + AiOPS 비용 (직원 개인 AI 도구) 통합
- Mode별 분기 (PW-011 정합)

---

## I-001-05 — 권한 경계 (MUST)

### 위계 매핑

| Wiring 위계 | AiOPS 권한 | 볼 수 있는 AiOPS 데이터 |
|---|---|---|
| OA / L1 | super_admin | 전사 AI 사용 |
| L2 PM | member 또는 admin_teams | 본인 팀 통계 (admin_teams인 경우) |
| L3 | member | 본인 사용 현황만 |
| L4 | member | 본인 사용 현황만 |

### SSO 단일 로그인

- 사용자가 Wiring 로그인 → AiOPS 자동 로그인
- SAML / OIDC 세션 공유 (PW-014)
- 로그아웃 시 양쪽 세션 무효화

---

## I-001-06 — PII 알림 공유 (MUST)

AiOPS PA-007 에서 감지된 PII → Wiring 알림 인박스:

```typescript
// AiOPS 측
onPIIDetected(log) {
  // 자체 alerts 테이블에도 저장
  createAlert({ rule_id: 'AL-005', log_id: log.id, ... });
  
  // Wiring 에도 전달 (통합 조직만)
  if (org.wiring_integrated) {
    publishToWiring(org.id, 'aiops:pii_detected', {
      log_id: log.id,
      pii_types: log.flag_reasons,
      channel: log.channel,
    });
  }
}
```

### Wiring 알림 표시

- 벨 아이콘 배지 + 인박스 카드
- 카드 클릭 → AiOPS 대시보드로 이동 (컨텍스트 유지)

### 민감 내용 노출 원칙

- Wiring 알림 카드에는 **pii_type만 표시** (실제 값 X)
- 상세 조회는 AiOPS 대시보드에서 (권한 재확인)

---

## I-001-07 — Mode B 특수 처리 (MUST, G-087 정합)

Mode B 통합 조직:
- **서로 다른 물리 인프라 가능** (Wiring = 고객 서버 A, AiOPS = 고객 서버 B)
- 이벤트 전달은 내부 네트워크 경유만 (Gridge 서버 경유 금지)
- 통합 UI 는 Wiring 인스턴스에서 AiOPS 인스턴스 API 직접 호출

### Air-gapped 환경

- 실시간 WebSocket 불가 → 배치 파이프라인만 (5분 주기)
- 이벤트 파일 드롭 (NFS / shared volume) 방식 지원

---

## I-001-08 — 실패 / 네트워크 단절 대응 (SHOULD)

### AiOPS → Wiring 전달 실패

- 이벤트 큐에 보관 (Redis Streams)
- 3회 재시도 + exponential backoff
- 지속 실패 시 OA 알림 + Wiring 에서 "AiOPS 연동 장애" 배너

### 과거 이벤트 복구

- Wiring 이 AiOPS API 로 `since=<timestamp>` 호출
- 놓친 이벤트 일괄 재수신

---

## I-001-09 — 외부 노출 금지 (MUST, G-004)

Wiring UI 에 AiOPS 내부 용어 노출 금지:
- ❌ "AI 옵저버" (내부 이름)
- ❌ "proxy.gridge.ai" 같은 내부 도메인
- ❌ `prompt_storage` / `admin_teams` 같은 DB 필드명

허용:
- "AiOPS 로그" / "AI 사용 현황"
- "AiOPS 대시보드로 이동"

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] Wiring org_id ≠ AiOPS org_id 상태로 통합 시도?
- [ ] AiOPS `api_token` 이 Wiring UI 에 평문 노출?
- [ ] Mode B 에서 Gridge 서버 경유 이벤트 전달?
- [ ] L4 사용자에게 타인의 AiOPS 로그 노출?
- [ ] PII 원문이 Wiring 알림 카드에 표시?
- [ ] SSO 세션 공유 안 됨 (이중 로그인 요구)?
- [ ] 모드 불일치 (Wiring A + AiOPS B) 상태로 작동?
- [ ] AiOPS 내부 용어 Wiring UI 노출?

---

## 참조

- AiOPS 데이터 모델: `products/aiops/rules/data_model.md` (PA-001)
- AiOPS 권한: `products/aiops/rules/auth.md` (PA-004)
- AiOPS PII 감지: `products/aiops/rules/governance.md` (PA-007)
- AiOPS 이상 감지: `products/aiops/rules/alerts.md` (PA-009)
- AiOPS 성숙도: `products/aiops/rules/maturity.md` (PA-010)
- Wiring 비용 표시: `products/wiring/rules/cost_display.md` (PW-011)
- Wiring SSO: `products/wiring/rules/sso.md` (PW-014)
- Mode B 데이터 격리: `05_infra_mode.md § 7` (G-087)
- 외부 노출 금지: `01_product.md § 4` (G-004)
- 역방향 연동: `integrations/lucapus-aiops.md` (I-003)
