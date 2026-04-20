# Billing / Playbook — INDEX

> Phase 0 실무 운영 SOP 전수 7개 + 확장 예정.

---

## 작성 완료 (7개)

| 파일 | 내용 | 주관 역할 |
|---|---|---|
| `phase0-day1-runbook.md` | Alpha 고객 온보딩 D-7 ~ D+30 | Luna (AM) |
| `month-end-close.md` | 월말 마감 M+1일 00:30 ~ 17:00 | Finance + Super |
| `decline-response.md` | 결제 거절 24시간 SLA + 5분 10건 에스컬레이션 | Ops |
| `card-issuer-ops.md` | 신한 V-Card / KB SmartPay 실무 + 1Password | Ops |
| `smartbill.md` | 세금계산서 SaaS Phase 0 수동 → Phase 1 API | Finance |
| `legal-tax-review.md` | 법무·세무·규제 자문 체크리스트 | Super |
| `termination.md` | 이관·해지·재계약 D-30 ~ D+30 | AM + Super |

## 역할별 필독 가이드

### Luna (AM) 출근 첫 주
1. `phase0-day1-runbook.md` — 전체 흐름 숙지
2. `decline-response.md` — 거절 대응 패턴
3. `termination.md` — 해지 요청 대응 (방어적)

### Finance (또는 Super 겸직) 월말
1. `month-end-close.md` — 타임라인
2. `smartbill.md` — 발행 실패 시 대응

### Super 분기 리뷰
1. `legal-tax-review.md` — 자문 재검토 주기
2. 전체 playbook 변경 이력 체크

## 확장 예고

### v0.21+
- `offboarding.md` — 멤버 오프보딩 실무 (PB-011 보완)
- `team-operations.md` — Luna + 위버 + (Phase 1) Finance/Ops 역할 분장
- `data-deletion.md` — 해지 D+30 삭제 상세 절차
- `vendor-tos-change.md` — 벤더 약관 변경 대응 SOP

### v0.22+
- `1password.md` — 1Password Connect 설정 (Phase 1 자동화)
- `phase1-migration.md` — Phase 0 → Phase 1 전환 가이드
- `anomaly-runbook.md` — 이상 감지 유형별 대응 (PB-012 연계)

## 타임라인 도식 (통합 뷰)

```
계약 전
  └─ legal-tax-review.md (사전 자문)

D-7 ~ D+0 (Go-Live)
  └─ phase0-day1-runbook.md

D+1 이후 (일상 운영)
  ├─ decline-response.md (거절 발생 시)
  ├─ card-issuer-ops.md (VCN 관련)
  └─ (일일·주간 루틴)

M+1일 (월말)
  ├─ month-end-close.md (배치 + 검수)
  └─ smartbill.md (세금계산서 발행)

해지 시
  └─ termination.md (D-30 ~ D+30)
```

## 문서 간 참조 흐름

- `phase0-day1-runbook.md` → 주요 실패 시나리오는 `decline-response.md` / `card-issuer-ops.md` 참조
- `month-end-close.md` → 발행 실패 시 `smartbill.md § 503 다운 대응` 참조
- `termination.md` → 법적 이슈 시 `legal-tax-review.md § 9-1.E 계약서 핵심 조항` 참조
- 모든 문서 → 규칙 파일 (`rules/*.md`) 참조

## 변경 이력 추적

Playbook 변경 시:
1. 해당 파일 상단에 `업데이트 이력` 섹션 추가
2. `98_governance.md` 에 요약 기록
3. 영향 받는 다른 playbook 상호 참조 갱신

## 참조

- 전체 운영 개요: `products/billing/CLAUDE.md § 5 운영 플레이북`
- Phase 로드맵: `products/billing/CLAUDE.md § 8 Phase 로드맵`
- 원본 전수: 프로젝트 knowledge `07_운영_플레이북.md`
