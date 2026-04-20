# Wiring / Session Badge — 규칙 본문

> PW-010 본문. 칸반 카드 / 파이프라인 노드 / 활동 로그 등에 표시되는 세션 배지.
> 모드별 표시 내용이 다름 (G-083 정합).

---

## PW-010 — 세션 배지 (MUST)

### 표시 위치

| 위치 | 예시 |
|---|---|
| 칸반 카드 | AI 에이전트 담당 표시 |
| 파이프라인 AI 노드 | 노드 하단 |
| 실시간 로그 | 각 로그 행의 우측 |
| 에이전트 상세 패널 | 헤더 부분 |

---

## PW-010-01 — 모드별 텍스트 (MUST)

G-083 정합:

| 에이전트 | Mode A | Mode B | Mode C |
|---|---|---|---|
| 하네스 AI | `Claude Max` | `vLLM Llama-3` | `Claude Opus 4` |
| SSOT Master | `Claude Max` | `vLLM Llama-3` | `Claude Sonnet 4` |
| Scrum Master | `Claude Max` | `vLLM Llama-3` | `Claude Sonnet 4` |
| Tech Leader | `Claude Max` | `vLLM Llama-3` | `Claude Opus 4` |
| BE Developer | `ChatGPT Pro` | `Ollama CodeLlama` | `GPT-4o` |
| FE Developer | `ChatGPT Pro` | `Ollama CodeLlama` | `GPT-4o` |
| QA Verifier | `Claude Max` | `vLLM Llama-3` | `Claude Sonnet 4` |
| Doc Writer | `Claude Max` | `vLLM Llama-3` | `Claude Sonnet 4` |

### 원칙

- **Mode A**: 상품명 (Claude Max / ChatGPT Pro) — 고객이 세부 모델 신경 X
- **Mode B**: 모델 + 인프라 (vLLM / Ollama) — 내부 개발자 확인용
- **Mode C**: 구체 모델명 (Claude Sonnet 4 / GPT-4o) — 비용 breakdown 필요

### 금지 사항

- Mode A 에 버전 명시 (`Claude Sonnet 4 2026-04-15`) 금지
- Mode C 에 마이너 버전 (`claude-sonnet-4-6-20260101`) 노출 금지
- 모드 혼재 표시 금지 (한 화면에 A/B/C 섞임)

---

## PW-010-02 — 배지 시각 (MUST)

### 기본 스타일

```css
.session-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);   /* 11px */
  font-weight: 500;
  border-radius: var(--radius-sm);
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}
```

### 색상 변형

| 벤더 | 배경 틴트 | 아이콘 |
|---|---|---|
| Anthropic (Claude) | `rgba(204, 121, 90, 0.15)` | 🟠 |
| OpenAI (ChatGPT / GPT) | `rgba(16, 163, 127, 0.15)` | 🟢 |
| Google (Gemini) | `rgba(66, 133, 244, 0.15)` | 🔵 |
| Local (vLLM / Ollama) | `rgba(107, 114, 128, 0.15)` | ⚪ |
| Upstage (Solar) | `rgba(138, 43, 226, 0.15)` | 🟣 |

### 모드별 아이콘 (SHOULD)

모드 자체를 작은 아이콘으로 시각 구별:
- Mode A → 클라우드 ☁️
- Mode B → 서버 🖥️
- Mode C → 키 🔑

배지 우측에 12px 아이콘 추가.

---

## PW-010-03 — 구현 (MUST)

```tsx
// components/SessionBadge.tsx
interface SessionBadgeProps {
  agentId: string;           // 'ssot-master', 'be-developer', ...
  mode: 'A' | 'B' | 'C';
}

// 모드별 매핑 (중앙 관리)
import { SESSION_MAPPING } from '@/constants/agents';

export function SessionBadge({ agentId, mode }: SessionBadgeProps) {
  const label = SESSION_MAPPING[agentId]?.[mode];
  if (!label) return null;

  const vendor = detectVendor(label);
  const modeIcon = MODE_ICONS[mode];

  return (
    <span className={`session-badge vendor-${vendor}`}>
      {label}
      <span className="mode-icon">{modeIcon}</span>
    </span>
  );
}
```

### 중앙 매핑 (G-131 상수 관리 정합)

```typescript
// constants/agents.ts
export const SESSION_MAPPING = {
  'harness':       { A: 'Claude Max',   B: 'vLLM Llama-3',        C: 'Claude Opus 4' },
  'ssot-master':   { A: 'Claude Max',   B: 'vLLM Llama-3',        C: 'Claude Sonnet 4' },
  'scrum-master':  { A: 'Claude Max',   B: 'vLLM Llama-3',        C: 'Claude Sonnet 4' },
  'tech-leader':   { A: 'Claude Max',   B: 'vLLM Llama-3',        C: 'Claude Opus 4' },
  'be-developer':  { A: 'ChatGPT Pro',  B: 'Ollama CodeLlama',    C: 'GPT-4o' },
  'fe-developer':  { A: 'ChatGPT Pro',  B: 'Ollama CodeLlama',    C: 'GPT-4o' },
  'qa-verifier':   { A: 'Claude Max',   B: 'vLLM Llama-3',        C: 'Claude Sonnet 4' },
  'doc-writer':    { A: 'Claude Max',   B: 'vLLM Llama-3',        C: 'Claude Sonnet 4' },
} as const;
```

### 하드코딩 금지

컴포넌트 내부에 모델명 하드코딩 **금지**. 항상 `SESSION_MAPPING` 참조.

위반 예:
```tsx
// ❌ 금지
<span>Claude Max</span>

// ✅ 올바름
<SessionBadge agentId="ssot-master" mode={currentMode} />
```

---

## PW-010-04 — 서버 응답 기반 (MUST)

`G-090` 정합. 클라이언트가 mode 조건 분기 **금지**. 서버가 이미 모드-aware 응답:

```typescript
// ❌ 금지
const label = mode === 'A' ? 'Claude Max' : mode === 'B' ? 'vLLM' : 'Claude Opus';

// ✅ 올바름
// 서버 API 응답:
// { agent_id: 'ssot-master', session_label: 'Claude Max', vendor: 'anthropic' }
const { session_label } = agentData;
```

예외: 단순 아이콘/색상 같은 **표현 계층**만 클라이언트 분기 OK (G-090 예외 조항).

---

## PW-010-05 — 로딩 / 에러 상태 (SHOULD)

### 세션 정보 로딩 중

```tsx
<span className="session-badge-skeleton">
  <Skeleton width={80} height={14} />
</span>
```

### 모델 정보 누락

서버 응답에 `session_label` 없을 경우:
```
[세션 정보 없음]
```
작은 크기 / 회색 / 툴팁: "하네스 AI 설정을 확인하세요"

---

## PW-010-06 — 배지 클릭 동작 (SHOULD)

- 기본: 동작 없음 (정보 표시만)
- L3 이상 에이전트 상세 패널 호출 가능 (배정 이유 / 히스토리 확인)
- **모델 변경 옵션 노출 절대 금지** (G-025 / PW-005-01)

---

## PW-010-07 — 외부 노출 금지 표현 (MUST, G-004 정합)

세션 배지에 다음 단어 **사용 금지**:

- `LucaPus` (엔진 이름, 외부 비공개)
- `Paperclip` (오케스트레이션 엔진)
- 내부 코드명 (`voyage#008` 등)

허용:
- 상품명 (`Claude Max`, `ChatGPT Pro`)
- 공개 모델명 (`GPT-4o`, `Claude Sonnet 4`)
- 인프라 표시 (`vLLM Llama-3`, `Ollama`)

---

## PW-010-08 — 접근성 (SHOULD)

- `aria-label` 필수: "Session: Claude Max"
- 스크린 리더 대응: 배지 내 아이콘은 `aria-hidden="true"`
- 키보드 포커스: 클릭 가능한 배지에만 포커스 스타일

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] Mode A 배지에 버전 문자열 (`2026-04-15`) 포함?
- [ ] Mode B 배지에 `$` 기호 / USD 표시?
- [ ] 모델명을 컴포넌트 내부 하드코딩?
- [ ] `SESSION_MAPPING` 외부 파일 대신 inline?
- [ ] 클라이언트 `if (mode === ...)` 로 label 결정?
- [ ] 배지 클릭에 모델 변경 드롭다운 노출 (G-025 위반)?
- [ ] 외부 노출 금지어 포함?
- [ ] aria-label 누락?

---

## 참조

- 모드별 세션 원칙: `05_infra_mode.md § 3` (G-083)
- 서버 분기 원칙: `05_infra_mode.md § 9` (G-090)
- 모델 변경 금지: `02_architecture.md § 5` (G-025)
- 외부 노출 금지어: `01_product.md § 4` (G-004)
- 상수 관리: `07_coding_standard.md § G-131`
- 접근성: `07_coding_standard.md § G-135`
- 파이프라인 노드 통합: `products/wiring/rules/pipeline_view.md § PW-003`
- 칸반 카드 통합: `products/wiring/rules/kanban.md`
