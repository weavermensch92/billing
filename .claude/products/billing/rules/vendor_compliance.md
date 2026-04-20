# Billing / Rules / Vendor Compliance — 벤더 약관 실사 화이트리스트

> **PB-006** — 새 AI 서비스 카탈로그 등록 전 반드시 약관 실사. 회색지대는 등록 보류. `services` 테이블이 "약관 검증된 화이트리스트" 역할.

---

## PB-006-01. 원칙

**회색지대 서비스는 카탈로그에 넣지 않는다.**

각 AI 벤더의 "기업 대리 관리" 약관은 서비스별로 다름. 잘못 등록 시:
- 벤더 계정 차단 리스크
- 고객사 연쇄 피해
- Gridge 법적 책임

Phase 0: 첫 고객 사용 10~15개 서비스 우선 실사.

## PB-006-02. 화이트리스트 상태 (2026-04 기준)

| 서비스 | 기업 대리 관리 | 실무 처리 |
|---|---|---|
| ChatGPT Team / Enterprise | ✅ 허용 | Workspace 소유자 결제수단으로 VCN 등록 |
| Claude Team | ✅ 허용 | 동일 |
| Cursor Business | ✅ 허용 | 결제수단 VCN 연결 |
| ChatGPT Plus (개인 요금제) | ⚠️ 모호 | **Team 요금제 업그레이드 유도** |
| Claude Pro (개인) | ⚠️ 모호 | Team 업그레이드 유도 |
| Lovable / Manus / v0 | ⚠️ 서비스별 확인 | 약관 실사 후 카탈로그 등록 |
| OpenAI API | ✅ 허용 | 기업 API 계약 |
| Anthropic API | ✅ 허용 | 기업 API 계약 (+ 파트너십) |
| Google Gemini API | ✅ 허용 | GCP 프로젝트 연동 |
| Replit | 서비스별 확인 | — |
| Perplexity Pro | 서비스별 확인 | — |
| GitHub Copilot | ✅ 허용 | Business/Enterprise |

## PB-006-03. services 테이블 설계

```sql
CREATE TABLE services (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT UNIQUE NOT NULL,        -- 'svc_claude_team'
  display_name     TEXT NOT NULL,               -- 'Claude Team'
  vendor           TEXT NOT NULL,               -- 'Anthropic'
  category         TEXT NOT NULL,               -- 'subscription' / 'api' / 'agent'
  billing_type     TEXT CHECK (billing_type IN ('subscription','usage_based','credit')),
  
  -- 약관 실사 결과
  tos_review_status TEXT CHECK (tos_review_status IN ('approved','pending','rejected','conditional')),
  tos_review_date   DATE,
  tos_review_by     UUID REFERENCES admin_users(id),
  tos_reference_url TEXT,                       -- 약관 URL
  tos_notes         TEXT,                       -- 실사 메모
  
  -- 활성화 제어
  is_active         BOOLEAN DEFAULT FALSE,      -- 화이트리스트 진입 여부
  restrictions      JSONB,                      -- 조건부 허용 시 제한
  
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
```

**핵심**: `is_active = TRUE` 이고 `tos_review_status IN ('approved','conditional')` 인 서비스만 고객에게 노출.

## PB-006-04. 신규 서비스 등록 프로세스

```
[Super] 신규 서비스 등록 요청
     │
     ▼
[실사 단계]
     1. 공식 약관 / T&C URL 수집
     2. 기업 대리 관리 조항 확인
     3. 법무 검토 (필요시)
     4. tos_review_status 결정:
        ├─ approved   : 무조건 허용
        ├─ conditional: 조건부 (제한 명시)
        ├─ pending    : 추가 검토 필요
        └─ rejected   : 카탈로그 제외
     │
     ▼
[services INSERT] is_active = TRUE (approved/conditional 만)
     │
     ▼
[고객 포털 노출] /app/services/new 드롭다운에 추가
```

## PB-006-05. 조건부 허용 (conditional) 예시

```json
// Cursor Pro (개인 요금제)
{
  "tos_review_status": "conditional",
  "restrictions": {
    "note": "개인 요금제는 기업 대리 관리 명시 조항 없음",
    "recommendation": "Cursor Business 권장",
    "customer_acknowledgment_required": true
  }
}
```

고객이 선택 시 포털에 경고 + 동의 체크박스 필수.

## PB-006-06. 정기 재실사 (분기별)

AI 벤더는 약관 자주 변경 → **분기별 재실사** 의무:

```
매 분기 1일 자동 배치
     ↓
[for each services where is_active = TRUE]
     ↓
  최근 실사 후 90일 경과 체크
     ↓
  Super 알림: "재실사 필요 N건"
     ↓
  운영 콘솔 /console/super/services 에 배지 표시
```

재실사 후 변경 필요 시:
- `tos_review_status` 업데이트 (audit_logs 기록)
- 상태 악화 시 (approved → rejected) 해당 서비스 계정 전수 검토 필요

## PB-006-07. 약관 변경 감지 → 대응 SOP

| 시나리오 | 대응 |
|---|---|
| 벤더가 기업 대리 관리 명시적 금지로 변경 | 신규 계정 발급 중단 + 기존 계정 이관 계획 협의 (고객과) |
| 벤더가 가격 정책 변경 | 고객 통지 + 크레딧백 계산 로직 영향 검토 |
| 벤더가 API 인증 방식 변경 | AiOPS 프록시 호환성 점검 (AiOPS 팀) |
| 벤더 서비스 종료 | 30일 내 대체 서비스 제안 + 데이터 이관 |

## PB-006-08. "기업 대리 관리 가능" 판단 기준

법무 자문 필요 핵심 질문:
1. 벤더 약관에 "대표 계정 + 복수 사용자" 구조 허용 명시?
2. 결제 수단 등록 주체와 실제 사용자 분리 허용?
3. 제3자(Gridge)가 계약 당사자로 인정되는지 vs 단순 결제 대리?
4. 약관 동의 주체가 누구여야 하는지 (고객사 법인 vs Gridge)?

## PB-006-09. 데이터 보호 조항 체크

기업 대리 관리 가능하더라도 추가 확인:
- 벤더가 고객 데이터를 어떻게 보관/활용?
- GDPR / 개인정보보호법 준수?
- 데이터 유출 발생 시 통지 의무?

AiOPS 와 병행 사용 시 교차 영향 검토 (AiOPS 가 프록시로 로깅).

## PB-006-10. 자동 검증 체크리스트

- [ ] `services.is_active = TRUE` 인 서비스에 `tos_review_status = 'pending'` 혼재?
- [ ] 재실사 90일 초과 서비스가 계속 노출?
- [ ] `conditional` 서비스를 `customer_acknowledgment_required = true` 무시하고 등록?
- [ ] 약관 변경 통지 없이 `tos_review_status` 하향 조정?
- [ ] 개인 요금제 서비스 (ChatGPT Plus 등) 를 `approved` 로 잘못 분류?

## 참조

- `services` 테이블 전체 DDL: `schemas/tables/services.md` (v0.19)
- 서비스 카탈로그 콘솔: `screens/console/services.md` (v0.19)
- 약관 변경 대응 SOP: `playbook/vendor-tos-change.md` (v0.20)
- 법무 자문 리스트: `playbook/legal-tax-review.md § 9-1` (v0.20)
- 원본 기획: `01_서비스_정의.md § 4-4 벤더 약관 준수`
