# LucaPus / Rules / Export — 규칙 본문

> PL-010 본문. 고객 데이터 내보내기 원칙 + ZIP 번들 구조.
> G-089 "고객 데이터 = 고객 소유" 원칙 구현.

---

## PL-010 — 데이터 내보내기 (MUST)

### 철학

**"Gridge 없어져도 체계 존속."**

- 고객이 언제든 전체 데이터 ZIP 다운로드 가능
- 표준 포맷 (YAML / JSON / MD) — 벤더 종속 없음
- 복구 / 재이관 가능한 구조

### 내보내기 대상

| 카테고리 | 포맷 | 용도 |
|---|---|---|
| 적합화 규칙 (rule_timeline) | YAML | 규칙 백업 / 이관 |
| HITL 이력 (hitl_cards) | JSONL | 의사결정 감사 |
| LucaPus 산출물 | MD / OpenAPI / Mermaid | 문서 아카이브 |
| 온톨로지 스냅샷 | JSON | 구조 재현 |
| 감사 로그 (audit_logs) | CSV + JSON | 법적 증거 |
| 성숙도 점수 이력 | JSON | 트렌드 분석 |

---

## PL-010-01 — ZIP 번들 구조 (MUST)

```
gridge-export-{org_slug}-{YYYY-MM-DD}.zip
├── metadata.json              # 내보내기 시각 / 버전 / org 정보
├── README.md                  # 번들 구조 설명 + 복원 가이드
│
├── adaptation/
│   ├── rules.yaml             # 확정 규칙 (기본 포맷)
│   ├── rules.json             # 동일, JSON 변환
│   ├── hitl-history.jsonl     # HITL 결정 이력
│   └── rule-relations.json    # 규칙 간 관계 그래프
│
├── lucapus/
│   ├── spec-common.yaml       # 원본 적합화 소스
│   ├── architecture.md        # R5 엔티티 설계
│   ├── api-contracts/
│   │   ├── openapi.yaml
│   │   └── ...
│   ├── diagrams/              # Mermaid / DOT
│   └── feature-kits/
│
├── ontology/
│   ├── tech-snapshot.json     # 이 시점 기술 온톨로지
│   ├── domain-snapshot.json
│   └── patterns-snapshot.json
│
├── audit/
│   ├── audit-logs.csv         # 엑셀 분석용
│   ├── audit-logs.json        # 시스템 연동용
│   └── audit-logs.sha256      # 무결성 해시
│
├── metrics/
│   ├── adapt-scores-history.json
│   └── maturity-scores-history.json
│
└── signatures/
    ├── bundle.sha256           # 전체 ZIP 해시
    └── gridge-signature.asc    # Gridge 서명 (GPG)
```

### 각 최상위 디렉토리 역할

- `adaptation/` : 고객의 **규칙 + 결정 이력** (핵심 자산)
- `lucapus/` : LucaPus 엔진 산출물 (기획서 → 스펙 → 문서)
- `ontology/` : 온톨로지 스냅샷 (특정 시점 참조용)
- `audit/` : 법적 / 컴플라이언스 증거
- `metrics/` : 점수 트렌드 분석용
- `signatures/` : 무결성 검증

---

## PL-010-02 — 내보내기 주체 (MUST)

G-053 정합:

| 내보내기 범위 | 허용 위계 |
|---|---|
| 개인 작업 내역 | 본인 (L4 가능) |
| 프로젝트 전체 | L3 (담당 프로젝트만) |
| 팀 전체 | admin_teams (담당 팀) / L2 |
| 조직 전체 | **OA 전용** |

### 감사 로그 필수

내보내기 행위 자체도 `audit_logs` 에 기록 (G-141):

```json
{
  "action": "data_exported",
  "actor_user": "OA (김영희)",
  "target_type": "org",
  "target_id": "acme-corp",
  "after_value": {
    "bundle_size_bytes": 15384920,
    "file_count": 247,
    "sha256": "a1b2c3..."
  },
  "at": "..."
}
```

---

## PL-010-03 — YAML 포맷 예시 (규칙) (MUST)

### `adaptation/rules.yaml`

```yaml
# Gridge 적합화 규칙 (rules.yaml)
# 생성: 2026-04-18T14:30:00+09:00
# 버전: harness v1.0, spec-common D-001~105

org:
  id: acme-corp
  name: AcmeCorp

project:
  id: payment-service
  name: "결제 서비스"

rules:
  - id: rule-jwt
    name: "JWT 인증 필수"
    scope: org
    severity: MUST
    locked: true
    layer: core.auth.jwt-basic
    source: 조직
    confidence: definite
    inherited_from: ORG
    source_type: inherited
    created_at: 2026-02-15T09:00:00Z

    body: |
      모든 API 엔드포인트에 JWT 인증 필수.
      - 만료: Access Token 15분
      - Refresh Token: RTR (Rotation) 전략
      - blacklist: Redis 기반

    relations:
      requires: [rule-bcrypt]
      triggers: [rule-token-blacklist]
      depends_on: [rule-redis-cache]

    spec_common_ref: D-091

  - id: rule-bcrypt
    name: "BCrypt 해싱 필수"
    scope: org
    severity: MUST
    locked: true
    # ...

  - id: rule-rtr
    name: "RTR 토큰 전략"
    scope: project
    severity: MUST
    locked: false
    source: 프로젝트
    confidence: definite
    source_type: hitl_resolved
    source_card_id: "hitl-abc123"
    resolved_by: 이시니어
    resolved_level: L3
    resolved_at: 2026-03-10T14:22:00Z
    # ...
```

### `adaptation/hitl-history.jsonl`

```jsonl
{"id":"hitl-001","type":"business","title":"환불 시 포인트 복원 여부","resolved":"복원","resolved_by":"김PM","resolved_at":"2026-03-05T10:30:00Z"}
{"id":"hitl-002","type":"technical","title":"VENDOR 역할 분리","resolved":"A","ai_recommendation":"A","aligned_with_ai":true,"resolved_by":"이시니어","resolved_at":"2026-03-06T11:00:00Z"}
```

---

## PL-010-04 — 복원 가이드 (MUST)

### `README.md` 내용

```markdown
# Gridge 데이터 내보내기 번들

생성: 2026-04-18
조직: AcmeCorp
버전: harness v1.0

## 이 번들에 포함된 것

- 적합화 규칙 (rules.yaml) — 복원의 핵심
- LucaPus 산출물 — 문서 아카이브
- 감사 로그 — 법적 증거
- 온톨로지 스냅샷 — 재분석 참조

## 복원 방법

### Gridge 재설치 시

1. 새 프로젝트에서 `gridge init`
2. `gridge import ./gridge-export-acme-corp-2026-04-18.zip`
3. 규칙 / 이력 / 산출물 자동 복원

### 다른 도구로 이관 시

- rules.yaml — 사람이 읽기 가능한 표준 포맷
- openapi.yaml — 표준 OpenAPI 3.0
- audit-logs.csv — 엑셀 / DB import 가능

## 무결성 검증

```bash
shasum -a 256 -c signatures/bundle.sha256
```

## 데이터 소유권

이 번들의 모든 내용은 AcmeCorp 의 소유입니다.
Gridge 는 이 데이터에 대한 권리를 주장하지 않습니다.
```

---

## PL-010-05 — Mode 별 동작 (MUST)

### Mode A / C

- Gridge 서버에서 ZIP 생성
- 내보내기 링크 이메일 발송 (24h 유효)
- 다운로드 완료 후 서버에서 삭제

### Mode B (온프레미스)

- **고객 서버에서** ZIP 생성 (Gridge 외부 송출 X)
- OA 가 고객 서버 내 다운로드 UI 에서 직접 수령
- Gridge 는 내보내기 행위만 감사 로그로 기록 (내용 X)

### 암호화

- 암호 입력 옵션 (AES-256 ZIP 암호화, G-143)
- OA 에게 QR 코드 / 별도 채널로 전송

---

## PL-010-06 — 내보내기 크기 제한 (SHOULD)

### 임계치

| 크기 | 대응 |
|---|---|
| ~100MB | 즉시 다운로드 |
| 100MB~1GB | 비동기 생성 + 이메일 링크 |
| 1GB+ | OA 승인 필요 + 파트 분할 (`.zip.001`, `.zip.002`, ...) |

### 대용량 이유

- 로그 보관 3년+ 고객
- 대규모 프로젝트 (5,000+ 아이템)

---

## PL-010-07 — 부분 내보내기 (SHOULD)

전체 대신 특정 범위만:

```bash
# CLI
gridge export --scope project:payment-service
gridge export --scope audit --from 2026-01-01 --to 2026-04-01
gridge export --scope rules --categories auth,security
```

### UI (설정 > 데이터 내보내기)

체크박스 + 기간 필터:
```
□ 적합화 규칙 (전체)
□ HITL 이력 (기간: [2026-01-01] ~ [2026-04-18])
□ LucaPus 산출물
□ 감사 로그 (기간: 전체)
□ 온톨로지 스냅샷
```

---

## PL-010-08 — 서비스 종료 대응 (MUST)

### Gridge 가 서비스 종료 시

1. 종료 6개월 전 모든 고객에게 공지
2. 공지 포함: 자동 내보내기 링크 (ZIP)
3. 종료 시점까지 언제든 추가 내보내기 가능
4. 종료 후 90일 동안 복구 요청 가능
5. 90일 후 고객 데이터 완전 삭제 (G-145)

### Mode B 고객

- 서비스 종료와 무관 (자체 서버에서 계속 운영 가능)
- 라이선스 자동 연장 (영구 사용권)

---

## PL-010-09 — 외부 노출 (MUST, G-004)

### 허용 용어

- "데이터 내보내기"
- "규칙 백업"
- "감사 로그 다운로드"
- "표준 포맷 (YAML / JSON / MD)"

### 금지

- `spec-common` 같은 내부 이름은 사용자 설정에서 별칭 제공
- 번들 내부 구조 설명 시 README.md 에만 (UI 노출 X)

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] OA 아닌데 `--scope org` 내보내기 가능?
- [ ] Mode B 데이터가 Gridge 서버 경유로 내보내기?
- [ ] `audit_logs` 내보내기 시 무결성 해시 누락?
- [ ] 내보내기 링크가 24h 후에도 유효?
- [ ] `rules.yaml` 포맷이 사람이 읽기 힘든 구조?
- [ ] 시크릿 / API 키가 내보내기 번들에 포함?
- [ ] `signatures/` 없는 번들 (무결성 검증 불가)?

---

## 참조

- 고객 데이터 소유 원칙: `05_infra_mode.md § 9` (G-089)
- 데이터 보유 / 삭제: `08_security.md § 6` (G-145)
- 감사 로그 immutable: `08_security.md § 2` (G-141)
- Mode B 원칙: `05_infra_mode.md § 7` (G-087)
- 암호화: `08_security.md § 4` (G-143)
- 위계 × 내보내기: `03_hierarchy.md § 10` (G-053)
- OA 설정 UI: `products/wiring/screens/org_admin.md` (PW-013)
