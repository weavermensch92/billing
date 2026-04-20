# Skills — Next.js 14

> Wiring 프론트엔드 / Wiring 웹 UI / AiOPS 대시보드 공통 프레임워크.
> **가이드 문서** (규칙 아님). 최신 docs: https://nextjs.org

---

## 버전

- Next.js 14 (App Router 기본)
- React 18
- TypeScript strict

---

## 디렉토리 구조

```
app/
├── layout.tsx                  # 루트 레이아웃
├── page.tsx                    # /
├── (auth)/
│   ├── login/page.tsx
│   └── signup/page.tsx
├── (dashboard)/
│   ├── layout.tsx              # 사이드바 + 헤더
│   ├── projects/page.tsx       # /projects
│   └── projects/[id]/
│       ├── page.tsx            # /projects/:id
│       ├── adapt/page.tsx      # /projects/:id/adapt
│       ├── kanban/page.tsx
│       ├── pipeline/page.tsx
│       └── spec/page.tsx
├── org/                        # /org (OA 전용)
│   ├── dashboard/page.tsx
│   ├── rules/page.tsx
│   └── ...
└── api/
    ├── hitl/
    └── ...

components/
├── ui/                         # shadcn/ui 래퍼
├── kanban/
├── pipeline/
└── adapt/

lib/
├── supabase/                   # Supabase 클라이언트
├── store/                      # Zustand
├── hooks/
└── utils/
```

---

## 주요 패턴

### Server Component vs Client Component

- **Server (기본)**: 데이터 fetching, SEO, 무거운 로직
- **Client (`'use client'`)**: interactivity, 훅, 이벤트 핸들러

```tsx
// app/projects/[id]/adapt/page.tsx (Server)
import { AdaptTab } from './AdaptTab';
import { fetchHitlCards } from '@/lib/supabase/queries';

export default async function AdaptPage({ params }) {
  const initialCards = await fetchHitlCards(params.id);
  return <AdaptTab projectId={params.id} initialCards={initialCards} />;
}

// components/adapt/AdaptTab.tsx (Client)
'use client';
export function AdaptTab({ projectId, initialCards }) {
  const [cards, setCards] = useState(initialCards);
  // realtime 구독, 결정 핸들러 등
}
```

### Server Actions (form / mutation)

```tsx
// app/actions/resolveHitl.ts
'use server';
export async function resolveHitl(cardId: string, optionId: string) {
  const session = await getSession();
  assertLevel(session, 'L2');  // 서버 권한 검증 (G-052)
  
  await supabase.from('hitl_cards')
    .update({ status: 'resolved', resolved_option_id: optionId })
    .eq('id', cardId);
}
```

### 위계 검증 (G-052)

- **서버에서 반드시** (클라이언트 `if` 금지)
- Server Action / Route Handler 양쪽 다 검증

---

## 상태 관리

### Zustand (클라이언트 로컬)

```tsx
// lib/store/useAdaptStore.ts
import { create } from 'zustand';

export const useAdaptStore = create((set) => ({
  cards: [],
  resolveCard: (id, option) => set((state) => ({
    cards: state.cards.map(c => c.id === id ? { ...c, status: 'resolved' } : c)
  })),
}));
```

### React Query / SWR (서버 상태 캐싱)

선택적. Zustand 로 충분할 수 있음.

---

## WebSocket / Realtime

Supabase Realtime 또는 별도 WebSocket:

```tsx
useEffect(() => {
  const ch = supabase.channel('hitl_cards')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hitl_cards' }, 
      (payload) => useAdaptStore.getState().upsert(payload.new))
    .subscribe();
  return () => supabase.removeChannel(ch);
}, []);
```

---

## 성능

### 이미지

`next/image` 사용. remote patterns 허용 목록만.

### 번들 크기

- Tree shaking
- Dynamic import (`dynamic(() => import('./Heavy'))`)
- Barrel file 주의 (ES import 영향)

### 페이지 로딩 목표 (07_PRD.md § 5)

- 칸반: 2초 (100 아이템)
- 노드 에디터: 3초 (20 노드)
- 로그 지연: 1초

---

## SEO / 메타

다크 테마 + `theme-color` 메타 + OpenGraph.

---

## 참조

- Wiring 디자인 토큰: `products/wiring/rules/design.md` (PW-001)
- 위계 분기 원칙: `03_hierarchy.md § 10` (G-052)
- 코딩 표준: `07_coding_standard.md` (G-120~135)
- Supabase 연동: `skills/supabase/CLAUDE.md`
