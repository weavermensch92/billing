# Integrations / LucaPus → AiOPS — 규칙 본문

> I-003 본문. LucaPus AI 에이전트 호출을 AiOPS 에 자동 로깅.
> 통합 고객: Wiring 내부 에이전트 호출도 AiOPS 대시보드에 집계.

---

## I-003 — LucaPus → AiOPS 에이전트 호출 로깅 (SHOULD)

### 목적

**"외부 AI 도구 사용 + LucaPus 내부 AI 사용 = 통합 거버넌스."**

- 직원 개인 Claude / ChatGPT 사용 → AiOPS 로깅 (기존)
- LucaPus 내부 에이전트 (SSOT Master / BE Developer 등) → 추가 로깅
- 한 대시보드에서 전체 AI 사용 파악 가능

### 조건

- 통합 조직만 (Wiring + AiOPS 동시 구독)
- OA 명시 opt-in (설정 > 연동 > "LucaPus 에이전트 AiOPS 로깅")
- Default OFF (중복 / 노이즈 우려)

---

## I-003-01 — 로깅 대상 (MUST)

| 에이전트 | 로깅 | channel 값 |
|---|---|---|
| 하네스 AI | ✅ | `lucapus_harness` |
| SSOT Master | ✅ | `lucapus_ssot_master` |
| Scrum Master | ✅ | `lucapus_scrum_master` |
| Tech Leader | ✅ | `lucapus_tech_leader` |
| BE Developer | ✅ | `lucapus_be_developer` |
| FE Developer | ✅ | `lucapus_fe_developer` |
| QA Verifier | ✅ | `lucapus_qa_verifier` |
| Doc Writer | ✅ | `lucapus_doc_writer` |

PA-005 채널 목록 확장 시 `custom_sdk` 하위로 분류.

---

## I-003-02 — 로그 엔트리 형식 (MUST)

AiOPS `logs` 테이블의 일반 로그와 동일 구조 + 추가 메타:

```typescript
interface LucaPusLogEntry extends LogEntry {
  channel: `lucapus_${string}`;
  
  // LucaPus 특수 메타
  lucapus_meta: {
    project_id: string;
    item_id?: string;        // 관련 Wiring 아이템
    role: 'orchestrator' | 'executor';
    plane: 'policy' | 'spec' | 'dev' | 'ops';
    hitl_card_id?: string;   // HITL 생성한 호출이면
  };
}
```

### PII / 거버넌스 검사

PA-007 민감 정보 감지는 그대로 적용:
- 에이전트 프롬프트에 고객 데이터 유출 감지 시 alert
- 특히 **테스트 데이터 생성 시** 실데이터 사용 의심

---

## I-003-03 — Mode 별 동작 (MUST, G-087 정합)

### Mode A / C (매니지드)

- LucaPus 에이전트 호출 → 자동 AiOPS 로깅
- Gridge 인프라 내부 이벤트 전달

### Mode B (온프레미스)

- LucaPus + AiOPS 모두 고객 인프라
- 이벤트 전달은 **고객 내부 네트워크만**
- Gridge 서버 경유 절대 금지

### Mode B 에서 AiOPS 단독 운영

- Wiring 없이 AiOPS만 Mode B 로 운영 가능
- LucaPus 연동 없음 (해당 채널 비활성)

---

## I-003-04 — 비용 집계 분리 (MUST)

Wiring 비용과 AiOPS 비용은 **별도 집계**:

| 구분 | 관리 |
|---|---|
| Wiring 에이전트 비용 | `items.cost_usd` / `items.tokens_used` |
| AiOPS 외부 도구 비용 | `aiops.logs.cost_usd` |
| **통합 뷰** | Wiring "비용 관리" 탭에서 합산 표시 |

### 더블 카운팅 방지

LucaPus → AiOPS 로깅 시 `cost_usd` 을 AiOPS 에만 기록:
- Wiring `items.cost_usd` 는 Stage 2+ 작업 단위 집계 목적
- AiOPS `logs.cost_usd` 는 직원별 / 채널별 거버넌스 목적

**같은 금액이 두 곳 동시 표시될 때 UI 에서 구별 라벨 필수.**

```
Wiring 비용:  $8.40  (AI 에이전트 작업, Stage 2)
AiOPS 비용:   $4.20  (직원 개인 AI + LucaPus 내부 호출)
통합 총액:    $12.60 (비중복 집계)
```

---

## I-003-05 — 성능 고려 (MUST)

### AiOPS 로깅이 LucaPus 에이전트 속도 영향 X

- 비동기 로깅 (PA-003 공통)
- 에이전트 응답 먼저 → 로그 큐에 enqueue → 배치 insert
- 로깅 실패가 에이전트 작동 차단 금지

### 배치 크기

- 기본: 100건 / 500ms
- 고부하 시: 증가 (최대 500건 / 1s)

---

## I-003-06 — 권한 범위 (MUST)

### Wiring 위계 × AiOPS 권한

| 위계 | LucaPus 로그 조회 범위 |
|---|---|
| OA | 전 프로젝트 |
| L1 | 담당 프로젝트들 |
| L2 | 담당 프로젝트 내 에이전트 로그 |
| L3 | 담당 프로젝트 + 본인 관련 작업 |
| L4 | 본인 담당 아이템 관련만 |

### 프롬프트 원문 접근

- OA / L3+ 만 (관련 업무 맥락 있어야)
- 그 외는 `prompt_summary` 만

---

## I-003-07 — 이중 로그 중복 감지 (SHOULD)

외부 AI 도구를 LucaPus 내부에서도 호출하면 중복 로깅 가능:

```
LucaPus BE Developer (Mode C) → 고객 OpenAI API 키로 호출
  ├── AiOPS 프록시 경유 (기존 외부 로깅 경로)
  └── LucaPus 내부 → AiOPS 로깅 (신규 I-003)
```

### 감지 로직

```typescript
// dedupe by session_id + request_body hash
async function deduplicateLog(log) {
  const fingerprint = hashRequestBody(log.prompt);
  const recent = await findLogInWindow(
    log.org_id, fingerprint, 5_000  // 5초 윈도우
  );
  if (recent) {
    // 병합: lucapus_meta 를 기존 log 에 추가
    return updateLog(recent.id, { 
      lucapus_meta: log.lucapus_meta,
      dedupe_count: (recent.dedupe_count ?? 0) + 1,
    });
  }
  return insertLog(log);
}
```

---

## I-003-08 — 외부 노출 금지 (MUST, G-004)

AiOPS UI 에 LucaPus 내부 용어 표시 금지:

❌ "LucaPus Orchestrator 호출"
❌ "Plane: spec, Role: orchestrator"

✅ "AI 에이전트 (SSOT Master)"
✅ "채널: Gridge 내부 에이전트"

`lucapus_*` 채널명은 DB 레벨만, UI 표시 시 "Gridge 내부 에이전트" 로 번역.

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] opt-in 없이 LucaPus 로그가 AiOPS 에 전송?
- [ ] Mode B 에서 Gridge 서버 경유 전달?
- [ ] Wiring `items.cost_usd` 과 AiOPS `logs.cost_usd` 더블 카운팅?
- [ ] L4 에게 타 사용자 에이전트 프롬프트 노출?
- [ ] 동일 호출 중복 로깅 (dedupe 실패)?
- [ ] AiOPS UI 에 "LucaPus" / "Plane" / "Orchestrator" 노출?
- [ ] 에이전트 응답 전에 로깅 대기 (latency 영향)?
- [ ] PII 감지 룰이 LucaPus 로그에는 적용 안 됨?

---

## 참조

- AiOPS 채널 목록: `products/aiops/rules/channels.md` (PA-005)
- AiOPS 로그 모델: `products/aiops/rules/data_model.md` (PA-001)
- AiOPS 비동기 로깅: `products/aiops/rules/proxy.md` (PA-003)
- AiOPS PII 감지: `products/aiops/rules/governance.md` (PA-007)
- LucaPus 오케스트레이터: `products/lucapus/orchestrators/roles.md` (PL-002~003)
- LucaPus 하네스 감사: `products/lucapus/orchestrators/harness.md § PL-004-04`
- 통합 조직 조건: `integrations/aiops-wiring.md` (I-001)
- Wiring 비용 표시: `products/wiring/rules/cost_display.md` (PW-011)
- Mode B 격리: `05_infra_mode.md § 7` (G-087)
- 외부 노출 금지: `01_product.md § 4` (G-004)
