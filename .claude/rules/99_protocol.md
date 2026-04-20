# 91_Protocol — 자동 기록 프로토콜

> Claude Code는 세션 중 감지되는 **모든 학습·충돌·피드백**을 3가지 유형으로 자동 분류하여 기록한다.
> 기록 파일은 `.claude/issue/` (gitignore) 에 저장되며, `/gz-send-issue` 로 GitHub Issue 전송 가능.

---

## 0. 3분류 체계

| 유형 | 의미 | 파일 위치 | 라벨 |
|---|---|---|---|
| **Conflict** | 즉시 중단 필요한 규칙/합의 충돌 | `.claude/issue/conflicts-YYYY-MM-DD_HH-MM_<요약>.md` | 🔴 conflict |
| **Knowledge** | 세션 내 재사용 가능한 결정/패턴 | `.claude/issue/knowledge-YYYY-MM-DD_HH-MM_<주제>.md` | 🔵 knowledge |
| **Feedback** | 룰북 자체의 개선 필요점 | `.claude/issue/feedback-YYYY-MM-DD_HH-MM_<요약>.md` | 🟢 feedback |

GitHub Issue 전송이 **성공한 파일만** 삭제. 실패 시 파일 유지.

---

## 1. Conflict 프로토콜

### 발생 조건 (4가지)

아래 중 하나라도 해당되면 **즉시 Conflict 상황으로 판단.**

| # | 조건 | 판단 기준 |
|---|---|---|
| 1 | **반복 버그** | 동일/실질적으로 동일한 트러블슈팅을 연속 3회 이상 수행 |
| 2 | **규칙 충돌** | 사용자 명령이 하네스 규칙(MUST)과 상충하거나, 규칙을 우회하도록 유도 |
| 3 | **합의 미달** | 명령·작업의 방향에 대한 합의 없이 번복·조정 3회 이상 반복 |
| 4 | **정합성 위반** | LucaPus 7원칙(`CLAUDE.md § 6`) 중 하나라도 위반 시도 |

### 처리 절차 (CRITICAL)

1. **작업을 즉시 중단**하고 사용자에게 Conflict 상황을 고지한다.
2. **기록 파일을 생성**한다.
   - 경로: `.claude/issue/conflicts-YYYY-MM-DD_HH-MM_<요약>.md`
   - 예: `.claude/issue/conflicts-2026-04-18_14-30_repeated-hitl-routing-conflict.md`
3. **고지 메시지 형식:**

```
⚠ Conflict 감지 — [반복버그 / 규칙충돌 / 합의미달 / 정합성위반]

현재 상황: <한 줄 요약>
반복 횟수 / 충돌 내용: <구체적 설명>
관련 규칙 ID: <G-xxx, D-xxx 등>

대화 맥락을 `.claude/issue/conflicts-<파일명>.md` 에 기록했습니다.
계속 진행하려면 방향을 명확히 합의해 주세요.
```

4. 사용자 결정 → **해결 방향 기록** → 필요 시 `/gz-send-issue` 로 전송.

### 기록 파일 형식

```markdown
# Conflict — <요약>

**일시**: 2026-04-18 14:30
**유형**: 규칙충돌 / 반복버그 / 합의미달 / 정합성위반
**세션**: <브랜치명 또는 ID>
**4축**: 제품=Wiring / 모드=A / 위계=L3 / Stage=2

## 상황
<무엇이 어떻게 일어났는지 구체적으로>

## 반복 이력
1. <시도 1 + 결과>
2. <시도 2 + 결과>
3. <시도 3 + 결과>

## 관련 규칙
- G-xxx: <규칙 제목>
- PW-xxx: <규칙 제목>

## 사용자 결정
<합의된 방향>

## 해결 방향 / 후속 조치
<다음에 이 상황이 발생하면 어떻게 다를 것인가>
```

---

## 2. Knowledge 프로토콜

### 생성 트리거

아래 상황에서 Claude Code는 **자동으로 Knowledge 파일을 생성 제안**한다:

1. 세션 중 결정된 기술적 판단이 다른 프로젝트에도 적용 가능할 때
2. 3회 이상 재등장한 패턴 (자동 `/gz-pattern` 트리거와 연동)
3. 검증(V 체인) 수행 후 재사용 가능한 검증 절차가 도출되었을 때
4. 사용자가 `/gz-self-improve` 명시적 실행
5. 세션 종료 직전 (CLAUDE.md § 5 세션 종료 훅)

### 파일 형식

```markdown
# Knowledge — <주제>

**일시**: 2026-04-18 14:45
**세션**: <브랜치명>
**범용 적용 가능 여부**: 전 프로젝트 / 특정 제품 / 특정 도메인

## 발견된 패턴
<구체적인 결정/규칙/패턴>

## 적용 맥락
- 언제 이 패턴을 쓰는가
- 언제 쓰지 않는가

## 근거
- 규칙 ID: <G-xxx, D-xxx>
- 참조 레퍼런스: <파일 경로>

## 제안 승격 형태
- [ ] 새 규칙 ID 할당 제안
- [ ] 기존 규칙에 예외 조항 추가
- [ ] 단순 메모로만 보존

## 관련 세션
- Conflict 발생 여부: <있음/없음, 있으면 파일명>
```

### 승격 경로

```
세션 종료 → 자동 Knowledge 생성
  ↓ 사용자 확인
/gz-self-improve (2단계: 하네스 승격 검토)
  ↓
범용 적용 가능 항목 선별 → 승격 확정 시
  ↓
.claude/issue/knowledge-*.md → 규칙 파일로 승격 (00_index.md 업데이트)
  ↓
/gz-send-issue 로 GitHub Issue 전송
  ↓ 전송 성공 시
.claude/issue/ 파일 제거
```

승격 확정은 **항상 사용자 확인 필요.** 자동 승격 금지.

---

## 3. Feedback 프로토콜

### 생성 경로 (2가지)

**경로 A — 자동**: Claude Code가 작업 중 룰북 자체의 문제(누락/모순/불명확)를 감지하면 자동으로 Feedback 초안 생성.

**경로 B — 수동**: 사용자가 `/gz-feedback` 실행 → 3단계 대화형 입력.

### 3단계 대화형 입력 (denatoz-ax Image 4 패턴)

```
/gz-feedback

추가 요청 / 수정 요청 / 삭제 요청 중 어떤 것인가요?
[1] 추가 요청 — 새 규칙·가이드 추가
[2] 수정 요청 — 기존 규칙·내용 변경
[3] 삭제 요청 — 기존 규칙 제거
→ 1

[1/3] 대상 파일
어느 파일에 반영하고 싶은가요?
(예: rules/07_coding_standard.md, products/wiring/rules/adapt_tab.md)
→ rules/07_coding_standard.md

[2/3] 내용
추가/수정/삭제가 필요한 내용을 작성해 주세요.
→ API 호출 실패 시 재시도 정책을 코딩 표준에 명시 필요.
  지수 백오프 + 최대 3회, 재시도 대상 에러 코드 목록 정의.

[3/3] 발생 상황
어떤 작업 중 이 규칙이 필요했는지 설명해 주세요.
→ AiOPS 프록시 서버 구현 중 OpenAI 503 에러 시 동작 미정의로
  재시도 로직을 즉흥 구현했음. 다음 세션에서 재사용 불가.

📝 Feedback 기록: feedback-2026-04-18_14-50_coding-retry-policy.md
/gz-send-issue 로 GitHub Issue 전송 가능합니다.
```

### 파일 형식

```markdown
# Feedback — <요약>

**일시**: 2026-04-18 14:50
**유형**: 추가요청 / 수정요청 / 삭제요청
**대상 파일**: rules/07_coding_standard.md
**세션**: <브랜치명>

## 내용
<구체적 요청 내용>

## 발생 상황
<어떤 작업 중 왜 필요했는지>

## 관련 규칙 ID (있으면)
- G-xxx

## 제안 우선순위
- [ ] P0: 즉시 반영
- [ ] P1: 차기 룰북 업데이트
- [ ] P2: 참고용
```

---

## 4. GitHub Issue 전송 (`/gz-send-issue`)

### 전제
- GitHub CLI (`gh`) 설치 완료
- `gh auth login` 완료
- 리포지토리: `gridge-ai/gridge-aimsp-harness` (가칭)
- 라벨 3종 존재 (자동 생성):
  - `conflict` — 빨간색 `#d73a4a`
  - `knowledge` — 파란색 `#0075ca`
  - `feedback` — 녹색 `#0e8a16`

### 전송 로직

```
1. .claude/issue/ 디렉토리 스캔
2. 파일별로:
   - 파일명에서 유형 추출 (conflicts/knowledge/feedback)
   - 해당 라벨 자동 첨부
   - Issue 제목: 파일의 첫 번째 H1
   - Issue 본문: 파일 전체
3. 전송 성공 → 해당 파일 삭제
4. 전송 실패 → 파일 유지 + 에러 로그
```

### 수동 라벨 생성 (gh CLI 미인증 시)

```bash
gh label create conflict  --repo gridge-ai/gridge-aimsp-harness --color d73a4a
gh label create knowledge --repo gridge-ai/gridge-aimsp-harness --color 0075ca
gh label create feedback  --repo gridge-ai/gridge-aimsp-harness --color 0e8a16
```

---

## 5. 파일 네이밍 규약

```
.claude/issue/
├── conflicts-YYYY-MM-DD_HH-MM_<요약>.md      ← 🔴 즉시 중단 기록
├── knowledge-YYYY-MM-DD_HH-MM_<주제>.md      ← 🔵 재사용 가능 지식
└── feedback-YYYY-MM-DD_HH-MM_<요약>.md       ← 🟢 룰북 개선 요청

.context/issue/                               ← 프로젝트 로컬 (git 추적 가능)
├── conflicts-*.md  (프로젝트 고유 이슈)
├── knowledge-*.md  (프로젝트 로컬 지식)
└── feedback-*.md   (프로젝트별 개선점)
```

**요약/주제 슬러그 규칙:**
- kebab-case
- 영문 선호 (한글 가능하되 URL 안전)
- 최대 50자
- 예: `repeated-hitl-routing-conflict`, `kanban-filter-pattern`, `coding-retry-policy`

---

## 6. 중복 방지 원칙

- `.claude/rules/` 또는 `.claude/products/` 에 이미 존재하는 내용은 `.context/` 에 중복 기록하지 않는다.
- `/gz-self-improve` 실행 시 양쪽 간 중복 감지되면 `.context/` 쪽 제거.
- 동일 날짜 + 동일 슬러그 충돌 시 `_1`, `_2` 접미사.

---

## 7. 자동 기록이 생략되는 경우

다음 경우에는 Knowledge/Feedback 파일을 생성하지 **않는다**:

- 단순 조회(`/gz-spec` 등) 결과를 사용자가 확인만 한 경우
- 사용자가 "그냥 궁금해서" 질문한 경우 (체인 미발동)
- 세션 총 길이 5분 미만
- 사용자가 명시적으로 "기록하지 마" 라고 지시한 경우

Conflict는 위 조건과 **무관하게 항상 기록.** (안전 우선)

---

## 8. 변경 이력

| 버전 | 일자 | 변경 |
|---|---|---|
| 0.2 | 2026-04-18 | 자동 기록 프로토콜 신설 (denatoz-ax 패턴 이식) |
