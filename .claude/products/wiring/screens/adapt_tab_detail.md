# Wiring / Screens / adapt_tab_detail — `/app/adapt`

> 적합화 탭. PW-006. HITL 카드 4종 (온톨로지 / 규칙 / 패턴 / 예외) + 규칙 타임라인 + 관계 그래프.

---

## 목적

조직 고유 규칙 · 온톨로지를 인간 결정 (TL+) 과 AI 추천의 루프로 확정. Gridge 가 "표준 라이브러리 감지 + 추천" / 고객이 "받아들임 / 거부 / 수정" 을 결정.

## 레이아웃

```
┌──────────────────────────────────────────────────┐
│ 적합화 (Adaptation)                                │
│ 📊 상태: 온톨로지 v2026-05-01 · 확정 규칙 142개   │
├──────────────────────────────────────────────────┤
│ [카드 대기] [타임라인] [관계 그래프] [온톨로지]   │
├──────────────────────────────────────────────────┤
│ 🟡 HITL 대기 카드 (8)                              │
│                                                    │
│ ┌────────────────────────────────────────────┐│
│ │ 🏷️ 온톨로지 · MEDIUM                          ││
│ │                                                ││
│ │ "payments" 도메인 감지: Alpha/결제 팀 담당    ││
│ │ 근거: 최근 3건 아이템이 토스페이먼츠 연동     ││
│ │       + users.role = 'payments' TL 존재      ││
│ │                                                ││
│ │ [승인]  [수정]  [거부]  [3일 보류]           ││
│ └────────────────────────────────────────────┘│
│                                                    │
│ ┌────────────────────────────────────────────┐│
│ │ 📏 규칙 · HIGH                                ││
│ │                                                ││
│ │ "모든 외부 API 응답은 Zod 검증"                ││
│ │ 근거: 최근 12개 아이템 중 8건이 API 호출       ││
│ │       6건에 Zod 이미 적용 중 (일관성)          ││
│ │                                                ││
│ │ 적용 범위:                                      ││
│ │ ☑ 백엔드 API 라우트                           ││
│ │ ☑ Next.js Server Action                       ││
│ │ ☐ 클라이언트 컴포넌트                          ││
│ │                                                ││
│ │ [승인]  [수정]  [거부]  [보류]                ││
│ └────────────────────────────────────────────┘│
│                                                    │
│ ┌────────────────────────────────────────────┐│
│ │ 🔁 패턴 · LOW                                 ││
│ │                                                ││
│ │ "Supabase RLS 정책: SELECT 에 org_id 필터"    ││
│ │ 근거: 6/12 테이블에 동일 패턴 적용됨          ││
│ │                                                ││
│ │ [전체 적용]  [제외 목록 설정]  [거부]         ││
│ └────────────────────────────────────────────┘│
│                                                    │
│ ┌────────────────────────────────────────────┐│
│ │ ⚠️ 예외 · HIGH                                 ││
│ │                                                ││
│ │ "Alpha Inc. 는 TypeScript strict 제외"         ││
│ │ 근거: tsconfig strict=false 장기 유지         ││
│ │                                                ││
│ │ [예외 인정]  [표준 준수 요청]                  ││
│ └────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

## 4종 HITL 카드 상세

### A. 온톨로지 카드 (Ontology)
- 도메인 경계 결정 (예: `payments`, `observability`)
- 팀 소유권 연결 (`teams.ontology_domains`)
- 영향: 어떤 팀 TL 에게 이후 HITL 카드가 자동 배정되는지

### B. 규칙 카드 (Rule)
- 코딩 표준, 아키텍처 패턴, 보안 요구 등
- 적용 범위 체크박스 (백엔드 / 프론트 / 인프라 등)
- 확정 시 `rule_timeline` INSERT + 이후 B3 코드 생성 시 자동 적용

### C. 패턴 카드 (Pattern)
- 반복 감지된 코드 패턴
- RLS 정책, 에러 핸들링, 로깅 포맷 등
- [전체 적용] 클릭 → 기존 코드 일괄 마이그레이션 제안 생성

### D. 예외 카드 (Exception)
- 일반 규칙에서 이탈된 부분 감지
- "여기는 왜 다른가?" 질문 → 예외 명문화 OR 정비
- 예외 승인 시 다른 카드 생성 시 참조

## 카드 처리 액션

```typescript
// 공통 액션
async function handleHitlCard(cardId: string, action: 'approve'|'modify'|'reject'|'defer') {
  const card = await db.selectOne('hitl_cards', cardId);
  
  switch (action) {
    case 'approve':
      await db.update('hitl_cards', cardId, {
        status: 'approved',
        decided_at: new Date(),
        decided_by: currentUser.id,
      });
      
      // 카드 타입별 후속 처리
      if (card.card_type === 'ontology') {
        await applyOntologyUpdate(card);
      } else if (card.card_type === 'rule') {
        await db.insert('rule_timeline', {
          org_id: card.org_id,
          rule_content: card.proposed_content,
          scope: card.proposed_scope,
          source_card_id: cardId,
        });
      }
      break;
      
    case 'modify':
      // 모달: 내용 수정 후 저장 + status='pending' 유지
      break;
      
    case 'reject':
      await db.update('hitl_cards', cardId, {
        status: 'rejected',
        decided_at: new Date(),
        rejection_reason: $reason,
      });
      break;
      
    case 'defer':
      await db.update('hitl_cards', cardId, {
        deferred_until: new Date(Date.now() + 3*24*3600*1000),
      });
      break;
  }
}
```

## 타임라인 탭

```
┌────────────────────────────────────────────────┐
│ 📅 규칙 타임라인 (최근 30일)                      │
├────────────────────────────────────────────────┤
│ 2026-05-15                                       │
│ ├ 🆕 R-142 "Next.js ISR 30초 이하 금지"         │
│ │   승인: Alice (TL) · payments 도메인          │
│ │                                                │
│ 2026-05-14                                       │
│ ├ 🔄 R-098 "Zod 검증 범위 확장"                 │
│ │   수정: Bob (PM) · 서버 액션 포함             │
│ │                                                │
│ 2026-05-10                                       │
│ ├ ❌ R-102 "React.memo 기본 사용" 거부          │
│ │   사유: 성능 측정 우선                         │
│ │                                                │
│ ├ 🆕 R-104 "Supabase Realtime 구독 cleanup"    │
└────────────────────────────────────────────────┘
```

## 관계 그래프 탭

```
React Flow 기반 시각화:
┌────────────────────────────────────────┐
│    payments                              │
│    ┌──────┐                              │
│    │ R-045│ Zod 검증                      │
│    └──┬───┘                              │
│       │                                   │
│       ├──→ R-067 API 응답 타입 export    │
│       └──→ R-089 에러 핸들링 통일         │
│                                            │
│    observability                         │
│    ┌──────┐                              │
│    │ R-110│ 구조화 로깅                    │
│    └──────┘                              │
└────────────────────────────────────────┘
```

## 온톨로지 탭

조직의 도메인 계층 전체 뷰:
```
Alpha Inc.
├── payments (TL: Alice Kim)
│   ├── 토스페이먼츠 연동
│   ├── 카드결제 API
│   └── 환불 처리
├── observability (TL: Bob Lee)
│   ├── Sentry 연동
│   └── 커스텀 메트릭
└── infrastructure (TL: Charlie)
    ├── Supabase
    ├── Vercel
    └── GitHub Actions
```

## 실시간 갱신

```typescript
supabase.channel('hitl_cards_wiring')
  .on('postgres_changes', 
    { event: '*', schema: 'wiring', table: 'hitl_cards' },
    (payload) => {
      if (payload.eventType === 'INSERT') {
        prependCard(payload.new);
        showNotification('새 HITL 카드 감지');
      }
    })
  .subscribe();
```

## 권한

- **L1 (Jr. Dev)**: 카드 열람만
- **L2 (SE)**: 카드 열람 + 의견 달기
- **L3 (TL)**: 승인 / 거부 / 수정 (주 담당)
- **L4+ (PM, Director, CTO)**: 전체 권한 + 정책 override

## 참조

- 적합화 규칙: `rules/adapt_tab.md` (PW-006)
- `hitl_cards`: `schemas/tables/hitl_cards.md`
- `rule_timeline`: `schemas/tables/rule_timeline.md`
- `teams.ontology_domains`: `schemas/tables/teams.md`
- React Flow 사용: `skills/react-flow/CLAUDE.md`
