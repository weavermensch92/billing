# `/gz` — 메인 진입점

## 목적
사용자가 새 작업을 요청하면 Claude Code가 자동으로 내부 발동하여 4축 확정 + 체인 분기를 수행.

## 트리거
- **자동**: 모든 새 사용자 요청 시 Claude Code가 내부 호출 (명시 입력 불필요)
- **수동**: 사용자가 `/gz` 입력 시 현재 세션을 강제 재시작 (4축 재확정)

## 입력
사용자의 자연어 작업 요청. 예: "Wiring 칸반에 HITL 필터 기능 추가해줘"

## 실행
```
1. CLAUDE.md § 2.1 4축 확정
     - 불확실 → /gz-scope 자동 진입
2. CLAUDE.md § 2.2 작업 유형 감지 → 체인 선택 (F/R/S/D/V/M/I)
3. 90_execution_chain.md § <선택된 체인> 실행 (사전 로드 → 탐색 → 실행 → 검증 → 기록 → 산출물)
4. 체인 종료 → /gz-self-improve 자동 제안
```

## 출력
- 4축 확정 결과 (제품/모드/actor/target/Stage)
- 선택된 체인 ID (예: "F 체인 진입")
- 체인 실행 로그
- 산출물 (코드/문서) + 자동 기록된 Knowledge/Conflict/Feedback

## 예시
```
사용자: "Wiring 칸반에 HITL 필터 기능 추가해줘"

Claude Code (내부):
  [/gz 내부 발동]
  4축 감지: 제품=Wiring / 모드=? / actor=? / target=? / Stage=?
  불확실 3개 → /gz-scope 자동 진입

  "현재 어느 환경에서 작업하시나요?"
  [모드]   A 매니지드 / B 온프레 / C 고객키
  [actor]  L3 기술 리드 / L4 개발자
  [target] L2 PM / L3 기술 리드 / L4 개발자
  [Stage]  2 협업 / 3 주도

사용자: "A / L3 / [L2,L3] / 3"

Claude Code:
  4축 확정 완료.
  작업 유형 감지: F (Feature Implementation)
  실행 체인: 90_execution_chain.md § F 진입
  ...
```

## 금기
- 4축 확정 전 코드 작성 금지 (추측 금지, `CLAUDE.md § 2.1`)
- 체인 분기 건너뛰기 금지
- `/gz` 명시 입력 없이 사용자가 원하지 않는 "재시작" 수행 금지

## 참조
- `CLAUDE.md § 2` 4축 확정 + 작업 유형 감지
- `90_execution_chain.md` 체인 본문
- `/gz-scope` 단일 축 확정
- `/gz-self-improve` 세션 종료 자동 제안
