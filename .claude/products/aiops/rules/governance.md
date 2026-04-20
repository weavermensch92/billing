# AiOPS / Governance — 규칙 본문

> PA-007, PA-008 본문. 민감 정보 감지 / 이상 탐지 / 직원 고지 / 대시보드 인사이트.
> AiOPS가 "거버넌스 플랫폼"으로 팔리는 핵심 기능.

---

## PA-007 — 민감정보 감지 (MUST)

### 원칙

프롬프트 / 응답에 포함된 **민감 정보 패턴**을 자동 감지하여 `logs.flagged = true` 로 표시.

### 감지 대상

| 카테고리 | 패턴 | 감지 방법 |
|---|---|---|
| **금융** | 카드번호 (Luhn 체크) | 정규식 + Luhn 알고리즘 |
| 금융 | 한국 계좌번호 | 은행별 포맷 |
| 금융 | SWIFT 코드 | `[A-Z]{6}[A-Z0-9]{2,5}` |
| **개인 식별** | 주민등록번호 | 체크섬 검증 |
| 개인 식별 | 여권번호 | ICAO 포맷 |
| 개인 식별 | 전화번호 (한국) | `01[0-9]-[0-9]{3,4}-[0-9]{4}` |
| 개인 식별 | 이메일 (대량) | 같은 프롬프트 5+ 이메일 |
| **인증** | AWS 액세스 키 | `AKIA[A-Z0-9]{16}` |
| 인증 | API 키 (Anthropic/OpenAI/Google) | `sk-ant-...`, `sk-...`, `AIza...` |
| 인증 | SSH 프라이빗 키 | `-----BEGIN ... PRIVATE KEY-----` |
| 인증 | JWT 토큰 | `eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+` |
| **의료** | 의료 기록 용어 + 이름 조합 | LLM 분류기 |
| **내부 코드** | 고객 DB 연결 문자열 | `postgres://.../...` |

### 구현

```typescript
// services/pii-detector.ts
interface PIIMatch {
  type: string;
  snippet: string;  // 마스킹된 샘플 (e.g., "****-1234")
  offset: number;
}

const PATTERNS = {
  credit_card: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  aws_key: /AKIA[A-Z0-9]{16}/g,
  openai_key: /sk-[A-Za-z0-9]{20,}/g,
  anthropic_key: /sk-ant-[A-Za-z0-9\-_]{30,}/g,
  google_api_key: /AIza[A-Za-z0-9_-]{35}/g,
  ssh_private: /-----BEGIN [A-Z ]+ PRIVATE KEY-----/g,
  jwt: /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
  ssn_kr: /\b\d{6}-[1-4]\d{6}\b/g,
  phone_kr: /\b01[016789]-?\d{3,4}-?\d{4}\b/g,
};

export function detectPII(text: string): PIIMatch[] {
  const matches: PIIMatch[] = [];
  for (const [type, pattern] of Object.entries(PATTERNS)) {
    for (const m of text.matchAll(pattern)) {
      // 신용카드는 Luhn 추가 검증
      if (type === 'credit_card' && !isValidLuhn(m[0])) continue;
      // 주민등록번호는 체크섬 검증
      if (type === 'ssn_kr' && !isValidSSN(m[0])) continue;

      matches.push({
        type,
        snippet: mask(m[0]),
        offset: m.index ?? 0,
      });
    }
  }
  return matches;
}

function mask(s: string): string {
  if (s.length <= 4) return '****';
  return '****' + s.slice(-4);
}
```

### 프록시 통합

```typescript
// proxy/server.ts 에서 로깅 직전 실행
async function toDbRow(entry: LogEntry): Promise<Log> {
  const text = (entry.prompt ?? '') + '\n' + (entry.response ?? '');
  const piiMatches = detectPII(text);

  return {
    ...entry,
    flagged: piiMatches.length > 0,
    flag_reasons: piiMatches.map(m => `pii:${m.type}`),
  };
}
```

### 조직 옵션 (orgs.pii_detection)

```sql
ALTER TABLE orgs ADD COLUMN pii_detection text NOT NULL DEFAULT 'on'
  CHECK (pii_detection IN ('on','off','admin_only_alert'));
```

- `on` (기본): 감지 + 대시보드 알림
- `off`: 감지 비활성 (성능 우선)
- `admin_only_alert`: 감지만, 개인 대시보드 알림 X (super_admin만 봄)

---

## PA-007-01 — 감지 정확도 (SHOULD)

### False positive 허용

정규식 기반이라 오탐 가능. Sprint 2에서 LLM 분류기로 개선:

```typescript
// Sprint 2+
async function refineWithLLM(text: string, regexMatches: PIIMatch[]) {
  const prompt = `다음 텍스트에 실제 민감 정보가 있는가?
텍스트: ${text.slice(0, 500)}
정규식 감지: ${regexMatches.map(m => m.type).join(', ')}
답변: YES/NO + 이유`;

  const result = await callCheapLLM(prompt);
  return result.includes('YES');
}
```

### 대시보드 사용자 피드백

- "민감함 확인" / "민감하지 않음" 버튼으로 사용자가 판정
- 판정 결과를 학습 데이터로 축적 (조직 옵션 on/off)

---

## PA-008 — 직원 고지 템플릿 (MUST)

### 법적 요구사항

한국 개인정보보호법 (PIPA) / GDPR 등에 따라 **직원 모니터링 사실 고지** 필요.

### 제공 템플릿

설정 > 보안 > 직원 고지 템플릿에서 super_admin 이 다운로드/편집:

```markdown
# AI 사용 모니터링 고지서

[조직명]은 업무 효율성 증대 및 AI 역량 강화를 위해
AI 도구 사용 내역을 **Gridge AiOPS** 플랫폼을 통해 기록합니다.

## 수집 범위
- 사용 채널, 모델, 토큰 수, 비용, 응답 시간
- (선택) 프롬프트 및 응답 원문 또는 요약

## 사용 목적
- 개인 AI 활용 코칭 (재질문 패턴 감소 등)
- 팀/조직 AI 사용 패턴 분석
- 비용 관리 및 이상 사용 감지

## 접근 권한
- 본인: 개인 대시보드
- 팀장: 팀 요약 (담당 팀만)
- 조직 관리자: 전사 통계

## 데이터 보존
- [N]일 (설정에 따름)
- 완전 삭제 후 복구 불가

## 거부권
- AI 도구 사용 자체를 거부하실 경우, 이 플랫폼도 미수집
- 본인 데이터 삭제 요청: [담당자 이메일]

## 시행일: YYYY-MM-DD
```

### 직원 동의 관리

- 조직 MUST로 "2FA 강제" 처럼 "직원 동의 강제" 옵션
- 동의 안 한 사용자는 AiOPS 대시보드 접근 차단 (또는 조회 전용)
- 감사 로그에 동의 시점 기록

---

## PA-008-01 — 사용 패턴 분석 (SHOULD)

### 분석 항목

Sprint 2 완성 목표:

| 항목 | 산출 지표 |
|---|---|
| 업무 유형 분류 | 코드 / 문서 / 분석 / 검색 / 기타 비율 |
| 재질문 패턴 | 재질문 횟수, 재질문 비율 |
| 프롬프트 구체성 | 평균 프롬프트 길이, 맥락 제공 비율 |
| 모델 선택 패턴 | 고비용 모델 단순 작업 사용 비율 |
| 사용 시간대 | 집중 시간 / 업무 외 시간 비율 |
| 사용 빈도 | DAU, WAU, 연속 미사용일 |
| 세션 깊이 | 세션당 평균 대화 턴 |
| 비용 효율 | 업무별 평균 토큰/비용 |

### 구현 단계

```
Sprint 1: 로그 수집
Sprint 2: 패턴 분석 엔진 (Python FastAPI + cron)
Sprint 3: 대시보드 시각화 + 개인 코칭
```

---

## PA-008-02 — 관리자 대시보드 뷰 (MUST)

### KPI 카드 (super_admin 기본 화면)

```
전체 팀 평균 AI 이용률 | 이번 주 총 비용 | AI 활용 PR 수 | 목표 달성 팀
       77%           |    $89.40      |    339건      |    3/6
```

### 팀별 상세 테이블

| 팀 이름 | 멤버 | 이용률 | 활용 PR | 비용 | 시각화 | 목표 |
|---|---|---|---|---|---|---|
| Platform팀 | 5명 | 95% | 64건 | $18.20 | ████████ | ● 달성 |
| Backend팀 | 7명 | 76% | 74건 | $24.10 | ██████ | ● 진행중 |
| ... | | | | | | |

팀 행 클릭 → 드릴다운 (팀원별 상세).

### 인사이트 카드

LLM 기반 자동 요약 (일간):

```
💡 인사이트
QA팀과 Mobile팀의 AI 이용률이 목표치(80%)에 미달하고 있습니다.
해당 팀에 대한 AI 도구 교육 및 활용 지원 강화를 권장합니다.
```

---

## PA-008-03 — 개인 대시보드 (MUST)

### 기본 화면 (member)

```
이번 주 AI 사용 요약:
  - 업무 유형 분포 (차트)
  - 사용 시간대 히트맵
  - 모델별 사용 비율 + 비용
  - 재질문 비율 트렌드 (주간)
  - 세션 깊이 트렌드
```

### 코칭 카드

- 자동 생성 (LLM 기반) + 패턴 기반 조건부 발송
- 카드 구조: 상태 요약 + 추천 액션 + [도움됐어요] [아니요] 피드백
- 피드백 누적 → 코칭 품질 개선 학습

---

## PA-008-04 — Next Step 추천 (SHOULD)

PA-010 성숙도 평가와 연동. 레벨별 단기/중기/장기 액션 자동 제안:

예시 (Level 2 - 실험기):

```
현재 상태
  개발팀 중심 Claude Code 활발 / 마케팅·기획팀 거의 미사용
  평균 재질문 비율 41% (권장 25% 이하)

단기 (이번 달)
  → 마케팅팀 AI 온보딩 가이드 배포
  → 재질문 줄이는 프롬프트 템플릿 제공

중기 (3개월)
  → 반복 업무 자동화 에이전트 도입 검토
  → 팀별 AI 활용 가이드라인 수립

장기 (6개월)
  → 사내 AI 챔피언 제도 운영
  → 업무 프로세스 AI 통합 로드맵 수립
```

**이 추천이 MSP 업셀 데이터 소스가 됨** (`01_product.md § 6 BM`).

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] 민감 정보 감지 없이 프롬프트 저장 (PII 유출)?
- [ ] 직원 고지 템플릿 없이 PII 수집 (법적 위반)?
- [ ] member 가 다른 사용자의 PII flagged 로그 조회 가능?
- [ ] Next Step 추천에 고객 회사명 노출 (크로스 고객사 데이터 유출)?
- [ ] Mode B 고객 데이터가 인사이트 자동 요약의 학습에 사용?
- [ ] 개인 대시보드에 관리자 전용 데이터 노출 (G-052 위반)?

---

## 참조

- 데이터 모델 (flagged/flag_reasons): `products/aiops/rules/data_model.md § PA-001`
- 권한 분기: `products/aiops/rules/auth.md § PA-004-03`
- 이상 알림 룰: `products/aiops/rules/alerts.md § PA-009`
- AI 성숙도: `products/aiops/rules/maturity.md § PA-010`
- PII 최소 수집: `08_security.md § 1` (G-140)
- 비밀 정보 로그 금지: `08_security.md § 9` (G-150)
- 컴플라이언스: `08_security.md § 11` (G-152)
