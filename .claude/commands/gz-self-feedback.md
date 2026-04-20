# `/gz-self-feedback` — 세션 종료 자가 피드백

## 목적
`/gz-self-improve` (Knowledge 추출) + `/gz-feedback` (룰북 개선 제안) 통합 실행. 세션에서 발견한 룰북 자체의 누락/모순을 Feedback 파일로 기록.

## 트리거
- **수동**: 사용자가 `/gz-self-feedback` 입력
- **자동**: 세션 종료 시 (`CLAUDE.md § 5`)
- **자동**: "오늘은 여기까지" / "마무리" 등 종료 시그널 감지 (`92_transition § G-195`)

## 입력
없음.

## 실행
```
1. /gz-self-improve 실행 (Knowledge 추출)
   - 사용자 결정 / 패턴 / 해결 방식 추출
2. 룰북 자체 개선 포인트 스캔:
   - 본문 파일 부재로 추측한 경우
   - 규칙이 실전 케이스를 커버 못 한 경우
   - 규칙 간 모호한 경계
   - 용어/표현 불일치
3. 각 개선 포인트를 Feedback 파일로 기록
4. Knowledge + Feedback 통합 요약 출력
5. /gz-send-issue 일괄 실행 권고
```

## 출력
```
세션 자가 피드백:

Knowledge 추출: N건
  [1] ...
  [2] ...

Feedback (룰북 개선): M건
  [1] 규칙 본문 부재 — <규칙 ID>: 작성 요구
  [2] 규칙 간 모호 — <A> vs <B>: 경계 명시 필요
  [3] 용어 불일치 — 문서 3곳에서 서로 다른 표현

전체 파일: .context/issue/ 에 (N+M)개 생성됨

다음:
  /gz-send-issue 로 일괄 GitHub Issue 전송
  세션 종료
```

## 예시
```
사용자: "오늘 여기까지. 정리해줘"

Claude Code:
→ /gz-self-feedback 자동 발동

Knowledge 추출 2건:
  [1] kanban-filter-pattern
  [2] api-retry-policy

Feedback 3건:
  [1] 07_coding_standard.md G-124에 병렬화 감지 자동 툴 언급 없음
  [2] 04_stage.md § 9 Stage 하락 자동 트리거 있었으면 좋겠음
  [3] 90_execution_chain.md § F 검증 체크리스트에 성능 항목 누락

전체 5개 파일 생성. /gz-send-issue 실행 권고.
```

## 금기
- 세션 종료 감지 실패 시 강제 실행 금지 (사용자가 계속 쓸 의사 있을 수 있음)
- Knowledge/Feedback 둘 다 0건이면 파일 생성 금지 (빈 파일 방지)
- 사용자 명시 중단 후에 추가 턴 늘리기 금지

## 참조
- `/gz-self-improve` Knowledge 추출
- `/gz-feedback` Feedback 3단계
- `99_protocol.md § 2~3` Knowledge/Feedback 조건
- `92_transition.md § G-195` 세션 종료
