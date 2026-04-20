# `/gz-self-improve` — Knowledge 추출

## 목적
세션 중 발견한 사용자 결정·패턴·해결 방식을 Knowledge로 추출하여 룰북에 승격 후보로 누적.

## 트리거
- **수동**: 사용자가 `/gz-self-improve` 입력
- **자동**: 체인 완료 후 (모든 체인 공통 원칙)
- **자동**: 세션 종료 훅 (`CLAUDE.md § 5`)

## 입력
없음. 현재 세션 히스토리 + `.context/session.yml` 전체 스캔.

## 실행
```
1. 세션 히스토리 전수 스캔 (사용자 결정, 에러 해결, 패턴 반복)
2. 2단계 필터 통과 여부 판정:
   - 범용 적용 가능? (전 프로젝트)
   - 특정 제품·도메인 한정?
3. 후보마다 Knowledge 파일 생성 (.context/issue/knowledge-*.md)
4. 중복 스캔 — 이미 규칙으로 존재하는 내용은 자동 제외
   - .claude/rules/ 검색
   - .claude/products/ 검색
5. 사용자에게 승격 후보 목록 제시
6. 선택된 후보 → rules/ 승격 제안 + /gz-send-issue 권고
```

## 출력
```
세션 종료 요약:

Knowledge 추출 후보 N건:
  [1] <slug-1> — 설명
       범용: YES/NO | 중복: 없음
  [2] <slug-2> — 설명
       범용: NO (Wiring 전용) | 중복: 없음
  [3] <slug-3> — 설명
       범용: YES | 중복: G-044 이미 존재 → 자동 제외

승격할 항목: [1,2]
→ .claude/issue/knowledge-*.md 파일 각각 생성
→ /gz-send-issue 자동 실행 권고
```

## 예시
```
/gz-self-improve

→ 세션 분석 중...

Knowledge 추출 후보 3건:
  [1] kanban-filter-pattern — 칸반 필터 + 서버 필터링 패턴
       범용: NO (Wiring 전용) | 중복: 없음
  [2] hitl-routing-rule — 위계별 HITL 자동 라우팅
       범용: YES | 중복: G-044 이미 존재 → 자동 제외
  [3] api-retry-policy — API 재시도 공통 정책
       범용: YES | 중복: 없음

승격할 항목을 선택하세요: [1, 3]

→ .context/issue/knowledge-2026-04-18-15-30_kanban-filter-pattern.md 생성
→ .context/issue/knowledge-2026-04-18-15-30_api-retry-policy.md 생성
→ /gz-send-issue 실행을 권고합니다.
```

## 금기
- 세션 끝나기 전 자동 실행 금지 (사용자 의도 확인 없이)
- 중복 체크 생략 금지 (룰북 비대화 방지)
- 개인 정보·비밀 정보 포함된 결정을 Knowledge로 기록 금지 (`08_security.md § G-150`)
- 사용자 의식의 흐름 / 감정적 발화 Knowledge 기록 금지

## 참조
- `99_protocol.md § 2` Knowledge 조건 + 포맷
- `/gz-send-issue` GitHub Issue 전송
- `/gz-self-feedback` 세션 종료 통합
- `92_transition.md § G-195` 세션 종료 흐름
