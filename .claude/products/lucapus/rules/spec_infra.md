# LucaPus / Rules / Spec — 인프라 (D-061~D-071)

> spec-common 인프라 카테고리. K8s / Docker / CI/CD / 모니터링 / 배포.
> mixed 스코프 (core + domain).

---

## 개요

| 범위 | 항목 수 | 스코프 |
|---|---|---|
| D-061 ~ D-071 | 11건 | mixed |

---

## D-061 — 컨테이너화

### 본문

모든 서비스는 Docker 이미지로 배포:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
USER node
CMD ["node", "server.js"]
```

### 강제 수준

**MUST** (Enterprise).

### 적합화 HITL

🔷 기술 결정: 베이스 이미지 (alpine vs slim), multi-stage build 여부.

---

## D-062 — K8s vs 단순 배포

### 본문

| 방식 | 권장 대상 |
|---|---|
| K8s | 엔터프라이즈, 마이크로서비스 |
| Docker Compose | 소규모, 단일 호스트 |
| Serverless (Lambda / Cloud Run) | 트래픽 변동 큰 워크로드 |

### 강제 수준

**SHOULD**.

### 적합화 HITL

🔷 기술 결정.

---

## D-063 — IaC (Infrastructure as Code)

### 본문

- Terraform (권장)
- Pulumi (TypeScript/Python 친화)
- AWS CDK (AWS 전용)

클라우드 리소스는 **모두 IaC 경유 생성**. Console 직접 수정 금지.

### 강제 수준

**MUST** (Enterprise).

---

## D-064 — CI/CD 파이프라인

### 본문

```
git push → CI 트리거
  ↓ (T1~T2 통과)
staging 자동 배포
  ↓ (QA 검증)
prod 수동 승인 → 배포
  ↓ (canary 10% → 50% → 100%)
```

### 강제 수준

**MUST**.

### 적합화 HITL

🔷 기술 결정: canary vs blue-green vs rolling.

---

## D-065 — 배포 전략

### 본문

| 전략 | 특징 |
|---|---|
| Rolling | 점진 교체 (기본) |
| Blue-Green | 순간 전환 (롤백 쉬움) |
| Canary | 일부 트래픽 먼저 (검증) |

### 강제 수준

**SHOULD**.

---

## D-066 — 모니터링 / 관측성

### 본문

3축:
- **Metrics**: Prometheus + Grafana
- **Logs**: Loki / ELK
- **Traces**: Jaeger / OpenTelemetry

### 강제 수준

**SHOULD**.

### 적합화 HITL

🔷 기술 결정: 선택 스택.

---

## D-067 — 헬스 체크

### 본문

모든 서비스는 `/health` 엔드포인트 제공:

```
GET /health → 200 OK + { status: 'ok' }
GET /health/ready → 준비 완료 여부 (의존성 포함)
GET /health/live → 살아있음 여부 (단순)
```

K8s readinessProbe / livenessProbe 와 연결.

### 강제 수준

**MUST**.

---

## D-068 — 로그 포맷

### 본문

JSON 구조화 로그:

```json
{
  "timestamp": "2026-04-18T14:20:00Z",
  "level": "error",
  "service": "payment-service",
  "trace_id": "...",
  "user_id": "...",
  "message": "Payment failed",
  "error": { "code": "INSUFFICIENT_BALANCE" }
}
```

### 강제 수준

**MUST**.

### 검증

로그에 민감 정보 마스킹 (G-150).

---

## D-069 — 알림 / 온콜

### 본문

- PagerDuty / Opsgenie / Slack
- 심각도: P1 (즉시) / P2 (업무시간) / P3 (주간 리뷰)

### 강제 수준

**SHOULD** (Enterprise).

---

## D-070 — 백업 / DR

### 본문

- DB: 일일 스냅샷 + WAL 연속 백업
- 파일 저장소: 다중 리전 복제
- RPO/RTO 목표 설정 (각 1h / 4h 권장)

### 강제 수준

**MUST** (Enterprise, 금융 / 의료).

### 적합화 HITL

🔶 비즈니스 결정: RPO/RTO 목표.

---

## D-071 — 비용 모니터링

### 본문

- Cloud Cost Management 연동
- 예산 알림 (50% / 80% / 100%)
- 리소스 태깅 (팀 / 환경 / 서비스)

### 강제 수준

**SHOULD**.

---

## 카테고리 요약

| ID | 제목 | 강제 | 적합화 HITL |
|---|---|---|---|
| D-061 | 컨테이너화 | MUST | 🔷 |
| D-062 | K8s vs 단순 | SHOULD | 🔷 |
| D-063 | IaC | MUST (Ent) | 🔷 |
| D-064 | CI/CD | MUST | 🔷 |
| D-065 | 배포 전략 | SHOULD | 🔷 |
| D-066 | 모니터링 | SHOULD | 🔷 |
| D-067 | 헬스 체크 | MUST | — |
| D-068 | 로그 포맷 | MUST | — |
| D-069 | 알림 / 온콜 | SHOULD | — |
| D-070 | 백업 / DR | MUST (Ent) | 🔶 |
| D-071 | 비용 모니터링 | SHOULD | — |

---

## 적합화 프로세스

### 초기 온보딩

- 기존 인프라 감지 (Dockerfile / k8s manifests / CI 파일)
- IaC 사용 여부 확인
- 미충족 항목 → HITL 카드

### Mode B 특수 처리

- K8s / IaC 는 고객 서버 상황에 맞춤
- 그릿지는 가이드만 제공, 배포는 고객이

---

## 자동 검증 체크리스트

SSOT Verifier T3:

- [ ] Dockerfile 없는 서비스 (D-061 위반)?
- [ ] `/health` 없는 서비스 (D-067 위반)?
- [ ] 로그에 JSON 구조 아님 (D-068 위반)?
- [ ] Cloud console 직접 생성 리소스 (D-063 위반)?
- [ ] DB 백업 없음 (D-070 위반)?

---

## 참조

- CI 기본: `spec_module_build.md § D-007`
- 보안 (HTTPS/TLS): `spec_security.md § D-050`
- AiOPS 온프레 배포: `products/aiops/rules/onprem.md` (PA-011)
- 4-Tier Gate T4 (보안): `products/lucapus/rules/gate.md § PL-005-03`
