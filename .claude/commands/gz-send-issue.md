# `/gz-send-issue` — GitHub Issue 전송

## 목적
`.context/issue/` 의 Conflict / Knowledge / Feedback 파일을 GitHub Issue로 일괄 전송. 팀 리뷰 경유 룰북 승격 흐름.

## 트리거
- **수동**: 사용자가 `/gz-send-issue` 입력
- **자동**: `/gz-self-feedback` 실행 후 권고

## 입력
없음 (또는 특정 파일 slug).

## 실행
`99_protocol.md § 4` 그대로.

```
1. .context/issue/ 전체 스캔
2. 파일별로 유형 판별 (파일명 접두어):
   - conflicts-* → label:conflict
   - knowledge-* → label:knowledge
   - feedback-*  → label:feedback
3. 각 파일을 GitHub Issue로 전환:
   - 제목: 파일 내 H1 헤더
   - 본문: 파일 내용 전체
   - 라벨: 위 매핑에 따라
4. 전송 성공 시 로컬 파일 삭제 (gh CLI 응답 204 Created 기준)
5. Issue URL 출력
```

### 사전 조건

```bash
# gh CLI 로그인
gh auth login

# 라벨 생성 (1회만)
gh label create conflict  --repo gridge-ai/gridge-aimsp-harness --color d73a4a
gh label create knowledge --repo gridge-ai/gridge-aimsp-harness --color 0075ca
gh label create feedback  --repo gridge-ai/gridge-aimsp-harness --color 0e8a16
```

## 출력
```
전송 완료 N건:
  [conflict]   #123: kanban-hitl-filter-routing
  [knowledge]  #124: api-retry-policy
  [feedback]   #125: stage-downgrade-auto-trigger

로컬 파일 삭제: 3건
남은 파일: .context/issue/ 에 M건
```

## 예시
```
$ ls .context/issue/
conflicts-2026-04-18_kanban-filter.md
knowledge-2026-04-18_api-retry.md
feedback-2026-04-18_stage-trigger.md

/gz-send-issue

→ 전송 중...
  [conflict]  #123 https://github.com/gridge-ai/gridge-aimsp-harness/issues/123
  [knowledge] #124 https://github.com/gridge-ai/gridge-aimsp-harness/issues/124
  [feedback]  #125 https://github.com/gridge-ai/gridge-aimsp-harness/issues/125

로컬 파일 삭제 완료. .context/issue/ 비어있음.
```

## 금기
- gh CLI 없거나 로그인 안 된 상태에서 강제 실행 금지 (사전 조건 체크 필수)
- Issue 생성 실패 시 로컬 파일 삭제 금지 (재시도 가능하도록 보존)
- 비밀 정보 포함된 파일 무검증 전송 금지 (`08_security.md § G-150` 자동 스캔)
- 개인 repo / fork 에 실수로 전송 금지 (repo 명시 확인)

## 참조
- `99_protocol.md § 4` GitHub Issue 전송 조건
- `/gz-self-feedback` 자동 권고 흐름
- `08_security.md § G-150` 비밀 정보 스캔
