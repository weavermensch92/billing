# Gridge AIMSP Harness

> Claude Code rulebook for the **Gridge AIMSP** — AiOPS + LucaPus + Wiring AI + **Billing MSP** 4제품 통합 플랫폼용 자동 실행 하네스.
>
> 개발자가 Claude Code에서 목적만 지시하면, 이 하네스가 **4축 확정 → 작업 유형 감지 → 체인 실행 → 자가 검증 → 기록**을 자동으로 흘려보낸다.

[![npm version](https://img.shields.io/npm/v/@gridge-ai/aimsp-harness.svg)](https://www.npmjs.com/package/@gridge-ai/aimsp-harness)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-blue)](https://docs.claude.com/en/docs/claude-code)

---

## 무엇인가

Claude Code에 설치되어 작동하는 **하네스(harness)**. 개별 프롬프트가 아니라, 팀 규칙·제품 규칙·개발 프로세스 전체를 구조화한 메타 레이어.

```
당신:   "Wiring 칸반에 HITL 필터 기능 추가해줘"
      ↓
Claude Code:
  ① 이 요청의 제품·모드·위계·Stage 4축을 자동 확정
  ② 키워드 감지 → F 체인 선택
  ③ ALWAYS_LOAD + 제품 규칙 + 스키마 자동 로드
  ④ 결정 필요 시 자동 핸드오프 (L3 기술 리드에게)
  ⑤ 코드 생성 후 규칙 위반 자가 검증 (16개 표준 + 제품 규칙)
  ⑥ 감사 로그 immutable + Knowledge 후보 추출
  ⑦ PR draft 자동 생성
```

---

## 누구를 위한 것인가

- Gridge AIMSP 제품(AiOPS / LucaPus / Wiring AI)을 개발하는 내부 팀
- Claude Code 기반으로 **팀 전체가 일관된 규칙을 따라 개발**하고 싶은 환경
- 외주 확장 시에도 코드 품질·보안·감사가 자동으로 지켜져야 하는 엔터프라이즈 프로젝트

---

## 설치

### 신규 프로젝트

```bash
# 1. 프로젝트 루트에서
cd your-gridge-project

# 2. 하네스 설치
npm install --save-dev @gridge-ai/aimsp-harness

# 3. 초기 설정
npx gridge-harness init
```

`init` 커맨드가 수행하는 것:

1. `.claude/` 디렉토리 생성 (CLAUDE.md / rules/ / products/ / commands/)
2. `.context/config.yml` 대화형 생성 (제품·모드·Stage·기술 스택)
3. `.gitignore` 머지 (기존 항목 보존)
4. `.context/session.yml` 초기화

### 기존 프로젝트에 추가

```bash
npx gridge-harness add
```

기존 `.claude/` / `.context/` 가 있으면 **충돌 항목은 보존**하고 새 규칙만 추가.

### 버전 업그레이드

```bash
npm update @gridge-ai/aimsp-harness
npx gridge-harness upgrade
```

upgrade 스크립트:
- 기존 로컬 규칙 수정은 유지 (diff 표시 후 사용자 승인 필요)
- 새 버전의 신규 파일은 자동 추가
- Breaking change 있으면 마이그레이션 가이드 출력

---

## 사용법

### 기본 사용

Claude Code를 프로젝트 루트에서 열면 `.claude/CLAUDE.md` 가 자동 로드됩니다. 이후:

```
> Wiring 칸반에 HITL 필터 기능을 추가해줘
```

하네스가 자동으로 4축을 확정하고 F 체인을 실행합니다.

### 명시적 명령어

| 명령어 | 용도 |
|---|---|
| `/gz <목적>` | 자동 라우팅 (권장) |
| `/gz-scope` | 4축 (제품/모드/위계/Stage) 확정 |
| `/gz-spec <규칙ID>` | 특정 규칙 본문 조회 (예: `/gz-spec PW-008`) |
| `/gz-verify` | 변경 사항이 규칙 준수하는지 자가 검증 |
| `/gz-impact <변경>` | 변경이 영향 미치는 규칙·파일 분석 |
| `/gz-pattern` | 반복 수정 패턴 감지 및 규칙 승격 제안 |
| `/gz-conflict` | 수동 Conflict 발동 (규칙 충돌 감지 시) |
| `/gz-feedback <내용>` | 룰북 개선 제안 |
| `/gz-self-improve` | 세션 종료 시 Knowledge 추출 + PR 생성 |
| `/gz-self-feedback` | 세션 종료 시 Feedback 수집 |
| `/gz-send-issue` | GitHub Issue 로 자동 전송 |

상세: [`.claude/commands/README.md`](.claude/commands/README.md)

---

## 구조

```
your-project/
├── .claude/                        ← 하네스 (이 패키지)
│   ├── CLAUDE.md                   라우터
│   ├── rules/                      공통 규칙 (10개 ALWAYS_LOAD)
│   │   ├── 00_index.md             규칙 ID 카탈로그
│   │   ├── 01_product.md           3제품 정체성
│   │   ├── 03_hierarchy.md         위계 · 권한
│   │   ├── 06_hitl.md              HITL 노드 4종
│   │   ├── 07_coding_standard.md   TS/React 표준 (G-120~G-135)
│   │   ├── 90_execution_chain.md   체인 7종 (F/R/S/D/V/M/I)
│   │   ├── 99_protocol.md          자동 기록
│   │   ├── 92_transition.md        핸드오프 · 전환
│   │   ├── 93_workflow.md          브랜치 · 커밋 · PR
│   │   └── 98_governance.md        거버넌스
│   │
│   ├── products/                   제품별 규칙
│   │   ├── wiring/
│   │   ├── aiops/                  (P2)
│   │   └── lucapus/                (P2)
│   │
│   ├── commands/                   커스텀 명령어
│   └── issue/                      런타임 자동 생성 (gitignore)
│
└── .context/                       ← 프로젝트 고정 메타 (이 패키지 외부)
    ├── config.yml                  제품·모드·Stage (gitignore 아님)
    └── session.yml                 세션 휘발 메타 (gitignore)
```

---

## 핵심 개념

### 4축

모든 작업은 4개 축으로 확정된 뒤에 시작:

| 축 | 값 |
|---|---|
| **제품** | AiOPS / LucaPus / Wiring / 연동 |
| **모드** | A 매니지드 / B 온프레 / C 고객키 |
| **위계** | actor (작업 수행자) + target (기능 대상자) 분리 |
| **Stage** | 0 모니터링 / 1 보조 / 2 협업 / 3 주도 |

### 체인 7종

| 체인 | 기호 | 트리거 |
|---|---|---|
| Feature | F | "구현", "추가", "만들어" |
| Refactoring | R | "정리", "분리", "개선" |
| Schema | S | "테이블 추가", "컬럼 변경" |
| Debug | D | "버그", "에러", "안 돼" |
| Verify | V | "검증", "대조" |
| Migration | M | "마이그레이션", "대량 변경" |
| Integration | I | "연동", "~와 통신" |

### HITL 노드 4종

| 유형 | 아이콘 | 담당 |
|---|---|---|
| 비즈니스 결정 | 🔶 | L2 PM |
| 기술 결정 | 🔷 | L3 기술 리드 |
| 코드 패턴 승격 | 🔶 | L3 (L4 제출) |
| 온톨로지 추천 | 🔗 | L3 |

### 자동 핸드오프

작업 중 결정이 필요하면 매트릭스(92 § G-180)가 적절한 담당자에게 자동 에스컬레이션. 개발자가 "누구에게 물어봐야 하는지"를 판단하지 않아도 됨.

---

## 버전 / 호환성

| 이 패키지 버전 | Claude Code 최소 버전 | 주요 변경 |
|---|---|---|
| 0.7.x | 1.0.0+ | npm 배포 가능 상태 + end-to-end 설치 검증 |
| 0.6.x | 1.0.0+ | F 체인 완전체 + Wiring 제품 |
| 0.5.x | 1.0.0+ | 드라이런 반영 + Fallback 규칙 |
| 0.4.x | 1.0.0+ | ALWAYS_LOAD 10개 완성 |
| 0.3.x | 1.0.0+ | 메타 규칙 (전환/워크플로우) 추가 |
| 0.2.x | 1.0.0+ | 자동 실행 엔진 도입 |
| 0.1.x | 1.0.0+ | 초안 |

변경 이력 전문: [`.claude/rules/98_governance.md § 10`](.claude/rules/98_governance.md)

---

## 기여

이 레포는 Gridge 내부 프로젝트입니다. 외부 기여는 받지 않습니다.

**내부 팀원**: 룰북 수정은 [`93_workflow.md § 9`](.claude/rules/93_workflow.md)를 따르세요.
- 브랜치: `rules/<요약>`
- 리뷰: L3 기술 리드 + 대상에 따라 OA
- Breaking change 는 반드시 마이그레이션 가이드 동반

룰북 자체의 변경 이력은 `98_governance.md § 10` 에 기록.

---

## 라이선스

**UNLICENSED (Proprietary).** SoftSquared Inc. (Gridge) 의 독점 소프트웨어.

이 패키지는 npm public registry 에 **restricted access** 로 배포됩니다. 사용 권한은 Gridge와의 계약 하에서만 부여됩니다. 무단 배포·수정·공개 금지.

---

## 참고 자료

- [Claude Code 공식 문서](https://docs.claude.com/en/docs/claude-code)
- [Anthropic Partner Program](https://www.anthropic.com/partner-program)
- Gridge 내부 문서: PRD, 파트너십 가이드, 개발자 경험 가이드

---

## 문의

- 위버