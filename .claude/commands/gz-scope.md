# `/gz-scope` — 4축 단일 확정

## 목적
제품 / 모드 / 위계(actor·target) / Stage 4축 중 불확실한 축을 대화형으로 확정.

## 트리거
- **자동**: `/gz` 실행 중 불확실 축 감지 시
- **수동**: 사용자가 `/gz-scope` 또는 `/gz-scope <축>` 입력

## 입력
- 옵션 없음: 4축 전부 순차 확인
- `product` / `mode` / `actor` / `target` / `stage`: 단일 축만 확인

## 실행
```
1. 요청된 축 확인
2. .context/config.yml + session.yml 에서 기존 값 읽기
3. 값 없으면 사용자에게 선택지 제시 (ask_user_input_v0 스타일)
4. 답변 받으면 session.yml 에 기록
5. config.yml 값과 충돌 시 사용자에게 override 여부 확인
```

## 출력
각 축별 확정된 값 + session.yml 업데이트 로그.

## 예시
```
/gz-scope product
 → "현재 작업 대상 제품은?"
    [1] AiOPS  [2] LucaPus  [3] Wiring  [4] 제품 간 연동

/gz-scope mode
 → "인프라 모드는?"
    [A] 매니지드  [B] 온프레미스  [C] 고객 API 키

/gz-scope actor
 → "지금 작업을 수행하는 사람의 위계는?"
    [OA] 조직 관리자  [L1] 임원  [L2] PM  [L3] 기술 리드  [L4] 개발자

/gz-scope target
 → "이 기능이 적용될 대상 위계는? (복수 선택 가능)"
    [OA] [L1] [L2] [L3] [L4]

/gz-scope stage
 → "AI 도입 Stage는?"
    [0] 모니터링  [1] 보조  [2] 협업  [3] 주도
```

## 금기
- config.yml/session.yml 값 무시하고 매번 묻기 금지
- 답변 없이 진행 금지 (4축 확정은 작업 시작의 **필수 전제**)
- actor와 target을 한 축으로 통합 금지 (`CLAUDE § 2.1` 구분 원칙)

## 참조
- `CLAUDE.md § 2.1` 4축 정의
- `98_governance § 부록 A` config.yml 포맷
- `98_governance § 부록 B` session.yml 포맷
