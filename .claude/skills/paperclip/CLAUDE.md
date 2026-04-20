# Skills — Paperclip (오케스트레이션 엔진)

> **외부 노출 절대 금지 (G-004)**. 내부 개발 문서에만 사용.
> LucaPus 엔진의 기반 오케스트레이션 레이어. Node.js + PostgreSQL + Redis.

---

## ⚠ 보안

- UI / API / 고객 문서 / 블로그 / 오픈소스 / 파트너 발표 등 **어디에도 노출 금지**
- 외부 노출 시 "오케스트레이션 엔진" / "AI 엔진" 으로만 표현

---

## 구조

```
Paperclip/
├── agents/              # 에이전트 정의
├── events/              # 이벤트 정의
├── state/               # DB 상태
├── scheduler/           # 작업 스케줄링
└── runtime/             # 실행 런타임
```

### Gridge 확장 레이어

```
LucaPus/
├── planes/              # 4-Plane (Gridge 고유)
├── orchestrators/       # 3 Orchestrator (Gridge 고유)
├── rules/gate.md        # SSOT Verifier + 4-Tier Gate (Gridge 고유)
└── adapters/
    └── paperclip.ts     # Paperclip 인터페이스 구현
```

---

## 이벤트 포맷

Paperclip 기본 + Gridge 확장 필드:

```typescript
interface PaperclipEvent {
  id: string;                  // uuid
  type: string;                // 'hitl.created', 'r_stage.progress', ...
  payload: any;
  emitted_at: Date;
  // Gridge 확장
  org_id: string;
  project_id: string;
}
```

### Wiring ↔ LucaPus 이벤트 (I-002)

- `products/wiring/rules/pipeline_view.md` 의 WebSocket 이벤트와 호환
- `integrations/wiring-lucapus.md` 의 이벤트 타입과 매핑

---

## 에이전트 등록

```typescript
// lucapus/agents/ssot-master.ts
import { defineAgent } from '@gridge/paperclip-adapter';

export const ssotMaster = defineAgent({
  id: 'ssot-master',
  plane: 'spec',
  role: 'orchestrator',
  
  // 하네스가 모델 배정
  model: () => getAssignedModel('ssot-master'),
  
  // 처리 가능한 이벤트
  handlers: {
    'spec.analyze.request': async (event, ctx) => {
      // R1~R7 파이프라인 킥오프
    },
  },
});
```

---

## State Persistence (PostgreSQL)

Paperclip 은 기본으로 이벤트 / 상태를 PG 에 저장:

```sql
CREATE TABLE paperclip_events (...)
CREATE TABLE paperclip_agents (...)
CREATE TABLE paperclip_runs (...)
```

Gridge 자체 테이블 (items / hitl_cards 등) 과 별도. 조인 필요 시 `org_id` + `project_id` 로.

---

## Mode 별 배포

| Mode | Paperclip 위치 |
|---|---|
| A | Gridge 클러스터 (Redis + PG managed) |
| B | 고객 클러스터 (self-hosted) |
| C | Gridge 클러스터 |

Mode B 는 Paperclip 버전 호환성 중요 (고객이 수동 업그레이드).

---

## 성능

- 이벤트 처리: 초당 100~500 건 (vertical scale)
- 에이전트 동시 실행: 3 Orchestrator + N Executor (병렬)
- 상태 폴링: 100ms (Wiring UI 실시간 성능)

---

## 참조 (외부 비공개)

- 공식 docs (내부 접근만)
- `integrations/wiring-lucapus.md` (I-002) 이벤트 포맷
- `products/lucapus/orchestrators/*.md` (PL-002~004)
- G-004 외부 노출 금지어: `01_product.md § 4`
