# Skills — Frontend Design

> Wiring 글래스모피즘 (PW-001) / AiOPS 대시보드 (PA-001) / 공통 컴포넌트.
> Tailwind CSS + shadcn/ui + Framer Motion.

---

## 제품별 기본 테마

### Wiring (다크 글래스모피즘)

- 배경: `#0A0B10` → `#12131A` → `#1A1C25` (레이어)
- 브랜드: `#1722E8` 그릿지 블루
- 폰트: Pretendard + Geist Mono

### AiOPS (밝은 네이비)

- 배경: 화이트 `#FFFFFF`
- 헤더 / 사이드바: `#0D1B3E` 다크 네이비
- 액센트: `#2E7FFF` 블루

### Wiring vs AiOPS 구별

통합 고객사라도 **두 제품 시각적 분리**. 헤더 로고 / 색상으로 즉시 구별 (PW-001-12).

---

## Tailwind 설정

### `tailwind.config.ts`

```typescript
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // CSS 변수 참조 (디자인 토큰, PW-001)
        'bg-primary': 'var(--bg-primary)',
        'brand-primary': 'var(--brand-primary)',
        // ...
      },
      fontFamily: {
        sans: ['Pretendard', 'system-ui'],
        mono: ['Geist Mono', 'ui-monospace'],
      },
    },
  },
};
```

### Global CSS

```css
/* globals.css */
:root {
  --bg-primary: #0A0B10;
  --bg-secondary: #12131A;
  /* ... PW-001 전체 토큰 */
}

.glass-surface {
  background: var(--bg-glass);
  backdrop-filter: blur(var(--backdrop-blur));
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}
```

---

## shadcn/ui 컴포넌트

### 설치

```bash
npx shadcn@latest init
npx shadcn@latest add button card badge dialog dropdown-menu
```

### 커스터마이징

shadcn 기본 → 디자인 토큰 연결:
```tsx
// components/ui/card.tsx (커스터마이징)
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<HTMLDivElement>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('glass-surface p-4', className)}
    {...props}
  />
));
```

---

## Framer Motion

### 기본 패턴

```tsx
import { motion, AnimatePresence } from 'framer-motion';

// HITL 카드 입장 애니메이션
<AnimatePresence>
  {cards.map(card => (
    <motion.div
      key={card.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      <HitlCard card={card} />
    </motion.div>
  ))}
</AnimatePresence>
```

### 접근성

```tsx
// prefers-reduced-motion
import { useReducedMotion } from 'framer-motion';

function AnimatedCard() {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.div
      animate={{ opacity: 1 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.25 }}
    />
  );
}
```

---

## 공통 컴포넌트 카탈로그

| 컴포넌트 | 용도 | 위치 |
|---|---|---|
| `<SessionBadge>` | 모드별 에이전트 모델 표시 | PW-010 |
| `<HitlCard>` | 적합화 4종 카드 | PW-006 |
| `<KanbanCard>` | 칸반 아이템 | PW-008 |
| `<PipelineNode>` | 파이프라인 3종 노드 | PW-003 |
| `<CostDisplay>` | 모드별 비용 포맷 | PW-011 |
| `<RuleNodeBadge>` | 규칙 출처 라벨 (🔒/팀/프로젝트) | PW-012 |

---

## 아이콘

**Lucide React 단일 사용** (`lucide-react@0.383.0`).

```tsx
import { CheckCircle2, AlertTriangle, Zap, Lock } from 'lucide-react';

<Zap className="w-4 h-4 text-[var(--status-hitl)]" />
```

- 기본 stroke: 1.5
- 강조: 2
- 다른 라이브러리 혼용 금지 (PW-001-06)

---

## 이모지 사용 규칙

UI 텍스트에 이모지 사용 **금지** (PW-001-06). 예외:
- HITL 노드 타입 (🔶🔷🔗)
- 우선순위 (⚡🔴🟡🔵)
- 상속 출처 라벨 (🔒)

---

## 반응형

Tailwind breakpoints:
- `sm:` 640px
- `md:` 768px
- `lg:` 1024px — 주 대상
- `xl:` 1280px

Wiring 은 데스크톱 우선 (PM / 개발자 업무용). 모바일 최소 지원.

---

## 참조

- Wiring 디자인 토큰: `products/wiring/rules/design.md` (PW-001)
- AiOPS 데모 프론트: `Gridge_Logging_System___데모_프론트_개발_프롬프트.md` (프로젝트 knowledge)
- 추천 레퍼런스 레포: `최종_PRD_수정_가이드.md` (Kiranism/next-shadcn-dashboard-starter 등)
