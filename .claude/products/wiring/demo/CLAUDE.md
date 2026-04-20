# Wiring / Demo — 라우터

> Wiring 데모 시나리오 / 연출 데이터 저장소.
> 세일즈 / 고객 파일럿 / 투자자 피칭 시 사용하는 프리셋.

---

## 데모 시나리오 (7종, `08_PRD_데모시나리오_수정본.md` 기반)

| 시나리오 | 대상 | 소요 | 파일 |
|---|---|---|---|
| A | 기술 리드 핵심 | 5분 | `scenarios/a-tech-lead.md` |
| B | PM 가시화 | 3분 | `scenarios/b-pm.md` |
| C | 모드 전환 시연 | 3분 | `scenarios/c-mode-switch.md` |
| D | Org Admin | 3분 | `scenarios/d-org-admin.md` |
| E | 온톨로지 추천 | 2분 | `scenarios/e-ontology.md` |
| F | CLI + 프로젝트 연결 | 3분 | `scenarios/f-cli.md` |
| G | 온보딩 풀 플로우 | 5분 | `scenarios/g-onboarding.md` |

### 세일즈 트랙 조합 가이드

| 미팅 대상 | 조합 | 소요 |
|---|---|---|
| CTO / 기술 리드 | F→A→E | 10분 |
| CTO + PM 동석 | F→A→B | 11분 |
| 풀 데모 | G→F→A→B→D | 19분 |
| 엔터 보안팀 동석 | C→D | 6분 |
| 2차 딥다이브 | A→E→설정 상세 | 10분+ |

---

## 연출 데이터

실제 voyage 작업 로그에서 발췌한 "더미 아닌" 프로토타입 데이터.

| 영역 | 파일 |
|---|---|
| 적합화 큐 4종 카드 | `fixtures/adapt-cards.json` |
| 칸반 아이템 7건 | `fixtures/kanban-items.json` |
| 파이프라인 노드 / 엣지 | `fixtures/pipeline-nodes.json` |
| 규칙 타임라인 | `fixtures/rule-timeline.json` |
| 규칙 관계 그래프 | `fixtures/rule-graph.json` |
| 감사 로그 | `fixtures/audit-logs.json` |
| 온톨로지 추천 | `fixtures/ontology-recommendations.json` |
| R1~R7 기획서 분석 | `fixtures/spec-analysis.json` |
| 에이전트 로그 (실시간) | `fixtures/agent-logs.json` |

원본: `최종_Wiring_v3_연출데이터.md` (프로젝트 knowledge).

---

## 데모 환경 구성

```
.claude/products/wiring/demo/
├── CLAUDE.md              ← 이 파일 (라우터)
├── scenarios/             ← 시나리오별 플레이북
├── fixtures/              ← 연출 데이터 JSON
└── personas/              ← 로그인 프리셋 (OA/L1/L2/L3/L4)
```

### 페르소나 프리셋

```json
// personas/l3-senior.json
{
  "user_id": "persona-lee-senior",
  "name": "이시니어",
  "email": "lee@acme.kr",
  "level": "L3",
  "team": "Backend팀",
  "project": "쇼핑몰 리뉴얼",
  "mode": "A"
}
```

데모 로그인 시 1클릭 전환. 세일즈 트랙 A/B 시연 시 L3 ↔ L2 즉시 전환 가능.

---

## 데모 모드 표시 (실 서비스와 분리)

데모 환경은 반드시 구별:

- URL: `demo.gridge.ai` 또는 `staging.gridge.ai/demo`
- 상단 배너: "🎬 Demo Environment — 실 데이터 아님"
- 실제 LLM 호출 대신 fixtures JSON 로 응답
- 비용 표시 모드만 실제 (A 토큰 / B 미표시 / C USD)

### 데모 데이터는 실 데이터와 분리 DB

```
- 실 환경: supabase-prod
- 데모: supabase-demo (별도 프로젝트)
```

세일즈 시연 중 실 고객 데이터 노출 리스크 차단.

---

## P-001.5 온보딩 데모

`08_PRD_프론트엔드_프로토타입.md` 의 3단계 위저드:

1. 프로젝트 기본 정보 입력
2. 팀원 역할 매핑
3. [분석 시작] → 62건 감지 → [전부 유지] → 네트워크 추천 14건 → [전부 추가] → 76건 완료

스텝 3 연출: 프로그레스 바 3초 애니메이션 → 카테고리 4탭 → 결과 요약.

---

## P-001.6 CLI 터미널 에뮬레이터

웹에서 CLI 경험을 시연:

```
┌─ Terminal ─────────────────────────────────────────┐
│ $ gridge connect proj-001-token-abc123             │
│ 🔗 프로젝트 연결 중...                              │
│ ✅ 연결 완료                                        │
│                                                    │
│ 프로젝트: 쇼핑몰 리뉴얼                             │
│ 조직: 코레일 (Backend팀)                            │
│ 인프라: Mode A (그릿지 매니지드)                     │
│ 적합화: 82% (76개 규칙)                             │
│                                                    │
│ $ gridge status                                    │
│ 내 작업:                                           │
│ ⚡ PT-002 코드 리뷰 대기 (8파일)                    │
│ 🔄 PT-003 AI 코딩 중 (5/7, ~3분)                   │
└────────────────────────────────────────────────────┘
```

타이핑 애니메이션. 컴포넌트: `<TerminalEmulator commands={[...]} speed={50} />`.

---

## 데모 vs 실제 제품 (외부 노출)

데모 UI 에서도 G-004 외부 노출 금지어 준수:
- ❌ "LucaPus", "Paperclip", "voyage#", "IR"
- ✅ "AI 엔진", "오케스트레이션 엔진", "하네스 AI"

---

## 참조

- PRD 데모 시나리오: 프로젝트 knowledge `08_PRD_데모시나리오_수정본.md`
- 연출 데이터 원본: 프로젝트 knowledge `최종_Wiring_v3_연출데이터.md`
- 프론트 프로토타입: 프로젝트 knowledge `08_PRD_프론트엔드_프로토타입.md`
- Wiring 기능 카탈로그: `products/wiring/CLAUDE.md`
- 외부 노출 금지: `01_product.md § 4` (G-004)
