# Billing / Rules — INDEX

> 7개 핵심 규칙 (PB-001~007) + 확장 6개 (PB-008~013).
> 공식 rule_id 등록: `rules/00_index.md § 5.5`.

---

## 현재 작성 완료 (PB-001 ~ PB-007)

| ID | 제목 | 파일 | 핵심 |
|---|---|---|---|
| **PB-001** | 리셀러 구조 원칙 | `reseller.md` | PG 아님 / "결제 대행" 용어 금지 / 자금 흐름 / 전자금융거래법 경계 |
| **PB-002** | VCN 라이프사이클 | `vcn.md` | 상태 머신 9단계 / Phase 0 수동 vs Phase 1 API / 번호 저장 금지 |
| **PB-003** | 3단 결제 티어 | `billing_tier.md` | monthly / weekly / prepaid_monthly / 세법 해석 공급시기 |
| **PB-004** | 크레딧백 10% (6개월) | `creditback.md` | 다음 달 공제 매출 할인 / M6 마지막 공제 / final_applied 플래그 |
| **PB-005** | Immutable Ledger | `immutable_ledger.md` | 7 테이블 UPDATE/DELETE 금지 / 역기록 패턴 / 가시성 3분할 |
| **PB-006** | 벤더 약관 실사 화이트리스트 | `vendor_compliance.md` | ChatGPT Team/Claude Team/Cursor Business 허용 / 분기별 재실사 |
| **PB-007** | Anthropic 패스스루 회계 | `anthropic_passthrough.md` | 파트너십 10% 할인 전달 / gridge_cost vs customer_charge vs margin |

## 확장 완료 (PB-008 ~ PB-013) — v0.21

기본 7개에 이어 6개 추가 완료. 공식 등록: `rules/00_index.md § 5.5`.

| 제목 | 파일 |
|---|---|
| **PB-008** Service-First UX 경계 (고객 조회·요청 / AM 실행 분리) | `service_first.md` |
| **PB-009** 회계 분리 엔진 (gridge_margin / passthrough 필드 트리거) | `accounting_split_engine.md` |
| **PB-010** 감사 로그 가시성 3분할 운영 규칙 | `audit_visibility.md` |
| **PB-011** 멤버 오프보딩 일괄 처리 (parent/child) | `offboarding.md` |
| **PB-012** 이상 감지 룰 (거절·급증·교차 검증·운영) | `anomaly_detection.md` |
| **PB-013** Phase 0→1→2 전환 체크포인트 | `phase_transition.md` |

**총 13개 규칙 완성** (PB-001~013).

## 규칙 간 관계

```
PB-001 리셀러 ──┬── PB-003 3단 티어 (청구 사이클)
                ├── PB-006 벤더 약관 (재판매 가능 서비스만)
                └── PB-007 Anthropic 패스스루 (리셀러 구조 위에서 가능)

PB-002 VCN ─── PB-005 Immutable (VCN 발급 이력 immutable)

PB-004 크레딧백 ─── PB-007 패스스루 (중첩 할인)

PB-005 Immutable ─┬── audit_logs (모든 민감 액션)
                  ├── transactions (settled 이후)
                  └── credit_backs (역기록만)
```

## 외부 노출 금지어 (G-004 확장, PB-001-03)

- `결제 대행`, `결제대행`, `payment processing`
- `PG`, `전자지급결제대행`
- `정산서`, `결제대행수수료`

PR 게이트 T3·T4 에서 자동 차단.

## 적용 순서 (개발 시)

Claude Code 작업 시 이 순서로 규칙 읽기:
1. **PB-001 리셀러** — 모든 Billing 개발의 기반
2. **PB-005 Immutable** — 데이터 모델 설계 시
3. 도메인별 해당 규칙 (VCN 작업 → PB-002, 청구 → PB-003/004)

## 참조

- 4제품 라우터: `products/billing/CLAUDE.md`
- 공식 등록: `rules/00_index.md § 5.5`
- Mode D 공통: `rules/05_infra_mode.md § 12` (G-091)
