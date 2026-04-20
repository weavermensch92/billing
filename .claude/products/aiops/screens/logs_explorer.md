# AiOPS / Screens / logs_explorer — `/app/logs`

> 로그 탐색 + 필터 + 상세. 역할별 가시 범위 자동 적용.

---

## 목적

- **super_admin**: 전체 조직 로그, 민감 정보 감지 건 조사
- **admin_teams**: 담당 팀 로그, 멤버 코칭 근거 확인
- **member**: 본인 로그, 과거 프롬프트 검색

## 레이아웃

```
┌──────────────────────────────────────────────────────┐
│ 로그 탐색                                             │
│ 총 2,345건 (오늘) · 월 68,000건                       │
├──────────────────────────────────────────────────────┤
│ 필터                                                  │
│ ├ 기간: [오늘 ▾]                                      │
│ ├ 채널: [전체 ▾] (11개)                               │
│ ├ 사용자: [전체 ▾] (87명) ← super_admin 만 사용자 선택│
│ ├ 팀: [전체 ▾]                                        │
│ ├ 벤더: [전체 ▾] (Anthropic/OpenAI/Google/Local)      │
│ ├ 민감: ☐ 민감 정보 포함만 표시                        │
│ └ 세션: ☐ 세션별 그룹화                               │
│                                                        │
│ 검색: 🔍 프롬프트 / 응답 내 키워드                     │
├──────────────────────────────────────────────────────┤
│ 리스트 (50건 / 페이지)                                 │
│                                                        │
│ 14:23  Alice  🟠 Claude Code  claude-opus-4           │
│        "게시글 CRUD API 작성 요청..."                   │
│        입력 850 tokens · 응답 2,400 · ₩450             │
│        🟡 민감: 이메일 주소 감지                       │
│        [상세 ↗]                                        │
│                                                        │
│ 14:22  Bob    ⚫ ChatGPT Web  gpt-4o                   │
│        "마케팅 카피 5종 생성..."                        │
│        입력 120 · 응답 1,800 · ₩120                    │
│        [상세 ↗]                                        │
│                                                        │
│ ...                                                    │
│                                                        │
│ [더 보기 (50건 더)]  [CSV 내보내기]                   │
└──────────────────────────────────────────────────────┘
```

## 필터 권한

```typescript
function getFilterOptions(role: Role, user: User) {
  return {
    userFilter: role === 'super_admin',
    teamFilter: role !== 'member',
    channelFilter: true,
    vendorFilter: true,
    sensitiveFilter: role !== 'member',
    canSearchContent: role === 'super_admin' || (role === 'member' && filterByOwn(user)),
  };
}
```

## 로그 상세 드로어

```
┌──────────────────────────────────────────────┐
│ Log Detail #log_xyz                      [×]  │
├──────────────────────────────────────────────┤
│ 시각:    2026-05-15 14:23:45                  │
│ 사용자:  Alice Kim · 개발팀                   │
│ 채널:    Claude Code                           │
│ 모델:    claude-opus-4                         │
│ 벤더:    Anthropic                             │
│ 세션:    sess_abc123 (14번째 호출)             │
│                                                │
│ 토큰: 입력 850 · 응답 2,400                    │
│ 비용: ₩450 · 응답 시간: 3.2초                  │
│                                                │
│ ────── 프롬프트 ──────                        │
│ "다음 스펙대로 Next.js API route 작성 필요:    │
│                                                │
│ POST /api/posts                                │
│ - Body: { title, content, authorId }           │
│ - Supabase 테이블 저장                         │
│ - alice@alpha.co.kr ← 🟡 이메일 감지           │
│ ..."                                           │
│                                                │
│ ────── 응답 ──────                            │
│ "Next.js App Router + tRPC 기반으로            │
│  API route 를 구현했습니다...                   │
│                                                │
│ ```typescript                                  │
│ ..."                                           │
│                                                │
│ ────── 메타데이터 ──────                      │
│ IP: 203.0.113.5                                │
│ User Agent: Claude Code v1.0                   │
│ 민감 감지: email                               │
│                                                │
│ [유사 로그 보기]  [원본 복사]  [알림 생성]    │
└──────────────────────────────────────────────┘
```

## 민감 정보 감지 UI

프롬프트/응답 내 민감 영역 하이라이트:
```html
<span class="bg-yellow-100 border-b-2 border-yellow-400">
  alice@alpha.co.kr
</span>
<sup class="text-yellow-700">🟡 email</sup>
```

마우스 오버 시 tooltip:
```
감지 유형: 이메일 주소
위치: 프롬프트 line 3, col 12
정책: 민감 (감사 필요)
```

## 세션별 그룹화

체크박스 ON 시:
```
📁 sess_abc123 (Alice · 14개 호출, 14:00~14:30)
  ├ 14:23 · 게시글 CRUD 첫 요청
  ├ 14:25 · 에러 처리 추가 요청
  ├ 14:27 · 타입 정의 수정
  └ ...

📁 sess_def456 (Bob · 5개 호출, 13:45~14:10)
  └ ...
```

각 세션 클릭 → 연속 흐름 뷰 (전후 맥락 포함).

## 내보내기

- CSV: 현재 필터 결과
- JSON: 상세 (구조 보존)
- 감사용 ZIP: 프롬프트 / 응답 / 메타 모두

## 실시간 갱신

```typescript
// 실시간 새 로그 추가 (오늘 필터 시만)
supabase.channel('logs_stream')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'aiops', table: 'logs', filter: `org_id=eq.${orgId}` },
    (payload) => {
      if (currentFilter.includes('today') && passesFilter(payload.new)) {
        prependLog(payload.new);
      }
    })
  .subscribe();
```

## 권한 재확인 (RLS 위에서 추가 검증)

- member: 본인만 + 별칭 필터 강제
- admin_teams: WHERE team IN managed_team_ids 강제
- super_admin: 제한 없음

## Sprint 우선순위

**Sprint 2 필수**. 문제 발생 시 (민감 정보 감지, 이상 사용 등) 근거 확인 필수.

## 참조

- `logs`: `schemas/tables/logs.md`
- 규칙 PA-001 (데이터 모델): `rules/data_model.md`
- 민감 정보 PA-007: `rules/governance.md`
- 권한 PA-004: `rules/auth.md`
