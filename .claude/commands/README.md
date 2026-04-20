# Commands — `/gz-*` 명령어 스펙

> Claude Code가 실행하는 그릿지 하네스 명령어.
> 각 명령어 상세는 **개별 `.md` 파일**. 이 파일은 인덱스.

---

## 명령어 카탈로그

| 커맨드 | 용도 | 파일 | 자동 기록 |
|---|---|---|---|
| `/gz` | 작업 시작 (4축 확정 + 체인 분기) | `gz.md` | 해당 체인에 따름 |
| `/gz-scope <축>` | 단일 축 대화형 확정 | `gz-scope.md` | 없음 |
| `/gz-spec <ID>` | 규칙 단건 조회 | `gz-spec.md` | 없음 |
| `/gz-verify <대상>` | 3중 검증 (V 체인) | `gz-verify.md` | Knowledge |
| `/gz-impact <변경>` | 제품 간 임팩트 분석 | `gz-impact.md` | Knowledge |
| `/gz-pattern` | 반복 패턴 → 규칙 승격 후보 | `gz-pattern.md` | Knowledge |
| `/gz-conflict` | Conflict 수동 기록 | `gz-conflict.md` | 🔴 Conflict |
| `/gz-feedback` | 대화형 Feedback 입력 (3단계) | `gz-feedback.md` | 🟢 Feedback |
| `/gz-self-improve` | 세션 Knowledge 추출 | `gz-self-improve.md` | 🔵 Knowledge 다수 |
| `/gz-self-feedback` | 세션 종료 자가 피드백 | `gz-self-feedback.md` | Knowledge + Feedback |
| `/gz-send-issue` | 기록 파일 → GitHub Issue | `gz-send-issue.md` | 기록 파일 삭제 |

---

## 파일 구조 규칙

각 커맨드 .md 파일은 다음 7섹션 포함:

1. **목적** — 왜 존재하나
2. **트리거** — 언제 발동 (자동 / 수동)
3. **입력** — 필수 / 선택 인자
4. **실행** — 단계별 동작
5. **출력** — 결과 형식
6. **예시** — 실제 사용 케이스
7. **금기** — 하지 말아야 할 것
8. **참조** — 관련 규칙 ID / 다른 커맨드

---

## 자동 발동 매트릭스

| 시점 | 자동 발동 커맨드 |
|---|---|
| 사용자 새 요청 | `/gz` |
| 체인 내 4축 불확실 | `/gz-scope` |
| 체인 내 규칙 본문 확인 필요 | `/gz-spec` (내부) |
| "검증/대조/레퍼런스" 키워드 감지 | `/gz-verify` |
| 패턴 3회 반복 감지 | `/gz-pattern` |
| 91 § 1 4조건 감지 | `/gz-conflict` |
| 체인 완료 후 | `/gz-self-improve` |
| 세션 종료 시 | `/gz-self-feedback` |
| Knowledge/Conflict/Feedback 누적 | `/gz-send-issue` 권고 |

---

## 수동 전용

사용자가 명시적으로 입력할 때만 실행:
- `/gz-scope <단일축>` — 특정 축만 재확정
- `/gz-spec <ID>` — 특정 규칙 조회
- `/gz-impact <변경>` — 변경 영향 분석
- `/gz-feedback` — 피드백 입력
- `/gz-send-issue` — 전송 실행

---

## 참조
- 명령어 원칙: `CLAUDE.md § 4`
- 자동 기록 프로토콜: `99_protocol.md`
- 체인 본문: `90_execution_chain.md`
- 전환 트리거: `92_transition.md`
