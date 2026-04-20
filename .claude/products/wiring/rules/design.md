# Wiring / Design — 규칙 본문

> PW-001 본문. Wiring UI의 디자인 시스템 정의.
> 다크 모드 글래스모피즘 + 타이포 + 색상 토큰 + 노드/엣지 스타일.

---

## PW-001 — 디자인 시스템 (MUST)

### 철학

**"개발 과정을 시각화하되, 산만하지 않게."**
- 다크 모드 기본 (개발자 장시간 사용 고려)
- 글래스모피즘 (레이어드 깊이감으로 계층 구조 시각화)
- 색상은 의미 전달용으로만 (과도한 데코 금지)

---

## PW-001-01 — 색상 토큰 (MUST)

### 배경

```css
--bg-primary:        #0A0B10;   /* 최하단 배경 */
--bg-secondary:      #12131A;   /* 카드 배경 */
--bg-elevated:       #1A1C25;   /* 팝오버 / 모달 */
--bg-glass:          rgba(26, 28, 37, 0.6);   /* 글래스 레이어 */
--bg-glass-stronger: rgba(26, 28, 37, 0.85);

/* 글래스 블러 */
--backdrop-blur:     12px;
```

### 브랜드 컬러

```css
--brand-primary:     #1722E8;   /* 그릿지 브랜드 블루 */
--brand-primary-10:  rgba(23, 34, 232, 0.1);
--brand-primary-20:  rgba(23, 34, 232, 0.2);
```

### 의미 색상 (상태 / 우선순위)

```css
/* HITL / 상태 */
--status-active:     #10B981;   /* 초록 — 활성, 승인 */
--status-idle:       #6B7280;   /* 회색 — 대기 */
--status-error:      #EF4444;   /* 빨강 — 에러 */
--status-hitl:       #F59E0B;   /* 주황 — HITL 대기 */

/* HITL 노드 타입 */
--node-business:     #F59E0B;   /* 🔶 비즈니스 결정 */
--node-technical:    #3B82F6;   /* 🔷 기술 결정 */
--node-pattern:      #F59E0B;   /* 🔶 코드 패턴 */
--node-ontology:     #3B82F6;   /* 🔗 온톨로지 (점선) */

/* 우선순위 */
--priority-high:     #EF4444;
--priority-medium:   #F59E0B;
--priority-low:      #6B7280;
```

### 텍스트

```css
--text-primary:      #F9FAFB;   /* 주요 텍스트 */
--text-secondary:    #9CA3AF;
--text-tertiary:     #6B7280;
--text-disabled:     #4B5563;
```

### 경계선

```css
--border-subtle:     rgba(255, 255, 255, 0.08);
--border-default:    rgba(255, 255, 255, 0.12);
--border-strong:     rgba(255, 255, 255, 0.2);
```

---

## PW-001-02 — 타이포그래피 (MUST)

### 폰트 패밀리

- **본문**: `Pretendard` (한국어 / 영문 공용)
- **모노**: `Geist Mono` (숫자 / 코드 / ID)
- **강조 숫자**: Geist Mono (KPI 카드의 큰 숫자 등)

### 사이즈 스케일

| 토큰 | 크기 | 용도 |
|---|---|---|
| `text-xs` | 11px | 배지 / 라벨 |
| `text-sm` | 13px | 본문 보조 |
| `text-base` | 14px | 본문 기본 |
| `text-md` | 16px | 섹션 타이틀 |
| `text-lg` | 20px | 페이지 서브타이틀 |
| `text-xl` | 28px | KPI 숫자 |
| `text-2xl` | 40px | 대시보드 핵심 수치 |

### 행간

- 본문: 1.5
- 타이틀: 1.2
- 모노 (숫자): 1.0

### 자간

- 한국어 본문: `-0.01em` (약간 좁게)
- 영문 모노: `0` (기본)
- 대제목: `-0.02em`

---

## PW-001-03 — 간격 (Spacing, MUST)

8px 그리드:

```css
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  24px;
--space-6:  32px;
--space-8:  48px;
--space-10: 64px;
```

### 컴포넌트별 기본

- 버튼 padding: `var(--space-2) var(--space-4)`
- 카드 padding: `var(--space-4)`
- 섹션 간격: `var(--space-6)`
- 페이지 padding: `var(--space-8)` 양옆, `var(--space-6)` 위아래

---

## PW-001-04 — 그림자 / 경계 (SHOULD)

### 깊이 계층

```css
--shadow-sm:      0 1px 2px rgba(0,0,0,0.3);
--shadow-md:      0 4px 6px rgba(0,0,0,0.4);
--shadow-lg:      0 10px 24px rgba(0,0,0,0.5);
--shadow-glass:   0 8px 32px rgba(0,0,0,0.4),
                  inset 0 1px 0 rgba(255,255,255,0.05);
```

### Radius

```css
--radius-sm:  4px;    /* 배지 / 칩 */
--radius-md:  8px;    /* 버튼 / 인풋 */
--radius-lg:  12px;   /* 카드 */
--radius-xl:  16px;   /* 모달 / 패널 */
--radius-full: 9999px; /* 원형 아바타 */
```

---

## PW-001-05 — 글래스 표면 패턴 (MUST)

카드 / 패널의 기본 스타일:

```css
.glass-surface {
  background: var(--bg-glass);
  backdrop-filter: blur(var(--backdrop-blur));
  -webkit-backdrop-filter: blur(var(--backdrop-blur));
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-glass);
}
```

### 레이어 중첩 규칙

- 1단계: `--bg-glass` (일반 카드)
- 2단계 (카드 위 팝오버): `--bg-glass-stronger`
- 3단계 이상: 모달/다이얼로그 전용, `--bg-elevated` 고체 배경

3단 이상 중첩은 **가독성 저하** — Conflict 발동 대상.

---

## PW-001-06 — 아이콘 (MUST)

### 라이브러리

- **Lucide React** 단일 사용 (`lucide-react@0.383.0`)
- 이모지는 HITL 노드 타입 표시 (`🔶🔷🔗`) + 우선순위 (`⚡🔴🟡🔵`) 전용
- 기타 이모지 UI 텍스트로 쓰는 것 **금지** (제품 톤 일관성)

### 사이즈

```
xs: 12px  (배지 안)
sm: 16px  (인라인 텍스트)
md: 20px  (기본)
lg: 24px  (섹션 헤더)
xl: 32px  (빈 상태 일러스트)
```

### 스트로크

- Lucide 기본: `stroke-width={1.5}`
- 강조: `stroke-width={2}`

---

## PW-001-07 — 노드 스타일 (파이프라인, MUST)

### 3종 노드 시각 구분

| 노드 | 모양 | 테두리 | 배경 |
|---|---|---|---|
| 사람 | **둥근** (16px radius) | 1px subtle | glass |
| AI | **각진** (4px radius) | 2px default | glass |
| 하네스 | **각진** + ★ | **2px #09090B 굵게** | glass-stronger |

### 상태 배지 (노드 우측 상단 8px 점)

```css
.node-status-active { background: var(--status-active); }
.node-status-idle   { background: var(--status-idle); opacity: 0.5; }
.node-status-error  { background: var(--status-error); animation: pulse 1s infinite; }
.node-status-hitl   { background: var(--status-hitl); box-shadow: 0 0 12px var(--status-hitl); }
```

### 병목 시각화

- 사람 노드 ⚡ 2건+ → `glow` 효과 + 엣지 굵기 1.5→2.5px
- AI 노드 할당 5건+ → `scale(1.1)` + `font-weight: bold`

---

## PW-001-08 — 엣지 스타일 (파이프라인, MUST)

| 방향 | 색상 | 굵기 | 스타일 |
|---|---|---|---|
| AI → 사람 | `--status-hitl` (주황 ⚡) | 1.5px | solid |
| 사람 → AI | `--status-active` (초록 ✓) | 1.5px | solid |
| AI → AI | `--text-tertiary` (회색) | 1px | solid |
| 하네스 → AI | `--text-primary` (검정 흰) | 1px | **dashed** |

### 애니메이션

- 데이터 흐름 방향 → dashed 이동 애니메이션 (`stroke-dashoffset`)
- 라벨: "⚡ HITL 2건" / "✓ 승인 3건" (엣지 중간 배치)

---

## PW-001-09 — HITL 카드 색상 (적합화 탭, MUST)

4종 HITL 노드의 좌측 3px 컬러 바:

| 노드 | 색상 | 테두리 |
|---|---|---|
| 🔶 비즈니스 결정 | `--node-business` | solid |
| 🔷 기술 결정 | `--node-technical` | solid |
| 🔶 코드 패턴 | `--node-pattern` | solid |
| 🔗 온톨로지 추천 | `--node-ontology` | **dashed** (추천이므로) |

온톨로지 추천이 dashed인 이유: 강제 아닌 권고임을 시각적으로 구별 (G-105 정합).

---

## PW-001-10 — 접근성 (MUST)

G-135 정합:

- 색상 대비: WCAG AA 이상 (본문 4.5:1, 큰 텍스트 3:1)
- 색상만으로 의미 전달 금지: 상태 배지에 **색 + 텍스트** 병기
- 키보드 포커스: 2px outline `--brand-primary`
- `aria-label` 필수: 아이콘 버튼, 노드

### 색약자 배려

빨강/초록 의존 표현에는 **아이콘 추가**:
- 성공: `--status-active` + ✓ 아이콘
- 실패: `--status-error` + ✗ 아이콘
- HITL: `--status-hitl` + ⚡ 아이콘

---

## PW-001-11 — 모션 (SHOULD)

### 지속 시간

```css
--duration-fast:   150ms;  /* 호버 / 포커스 */
--duration-normal: 250ms;  /* 트랜지션 */
--duration-slow:   400ms;  /* 페이지 전환 */
```

### 이징

```css
--ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### Framer Motion 권장

- 노드 상태 전환: `animate` + `transition: { duration: 0.25 }`
- 데이터 흐름: Framer `motion.svg` + `pathLength`
- 페이지 전환: `AnimatePresence` 사용, 깜빡임 금지

### 모션 민감 사용자 (SHOULD)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## PW-001-12 — 브랜드 일관성 (MUST)

### Wiring vs AiOPS 구별

- **Wiring**: 다크 모드 글래스모피즘 (이 문서)
- **AiOPS**: 화이트 / `#0D1B3E` 네이비 + `#2E7FFF` 블루 (별도 제품 룩)

통합 고객사라도 **두 제품은 시각적으로 분리**. 헤더 로고로 구별.

### 외부 노출 금지 컴포넌트 (G-004)

UI 문자열에 다음 단어 노출 **금지**:
- "LucaPus" / "하네스" (내부)
- "Paperclip" (오케스트레이션 엔진)
- "voyage" / "IR" / "DevPlane"

대신:
- "AI 에이전트" / "오케스트레이션 엔진" / "개발 규칙"

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] Lucide 외 다른 아이콘 라이브러리 사용?
- [ ] 이모지가 상태 표시 이외 UI 문구에 사용?
- [ ] 글래스 레이어 3단 이상 중첩?
- [ ] 색상만으로 의미 전달 (아이콘/텍스트 없음)?
- [ ] Wiring UI에 `LucaPus` / `Paperclip` / `하네스` 문자열 노출?
- [ ] 색 대비 WCAG AA 미달?
- [ ] `prefers-reduced-motion` 무시?
- [ ] 노드 3종 시각 구분 없음 (사람/AI/하네스 혼용)?

---

## 참조

- Frontend 전반 스킬: `skills/frontend-design/SKILL.md` (작성 예정)
- 노드 구조 상세: `products/wiring/rules/pipeline_view.md` (PW-002~005)
- 적합화 카드 상세: `products/wiring/rules/adapt_tab.md` (PW-006~007)
- 칸반 카드 상세: `products/wiring/rules/kanban.md` (PW-008)
- 접근성 규칙: `07_coding_standard.md § G-135`
- 외부 노출 금지어: `01_product.md § 4` (G-004)
- 모드 분기 (세션 배지): `05_infra_mode.md § 3` (G-083)
