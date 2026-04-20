# AiOPS / On-Premise — 규칙 본문

> PA-011 본문. 엔터프라이즈 고객을 위한 AiOPS 온프레미스 배포.
> Mode B 고객 전용. 데이터가 고객 서버를 벗어나지 않는 설치.

---

## PA-011 — 온프레미스 패키징 (MUST)

### 원칙

- 데이터 **절대 외부 반출 없음** (G-087)
- 업데이트 / 패치는 **고객이 자체 배포**
- 그릿지 운영진이 고객 데이터에 직접 접근 **금지**
- 고객이 완전 독립 운영 가능

### 배포 옵션

| 옵션 | 대상 | 난이도 |
|---|---|---|
| Docker Compose | PoC / 소규모 (≤ 50인) | 🟢 |
| Kubernetes (Helm Chart) | 표준 엔터프라이즈 | 🟡 |
| Air-gapped (완전 오프라인) | 금융 / 공공 / 국방 | 🔴 |

---

## PA-011-01 — 구성 요소 (MUST)

### 필수 스택

```
┌────────────────────────────────────┐
│ Nginx (TLS Terminator)             │
├────────────────────────────────────┤
│ Frontend (Next.js 14)              │
│ Backend API (Node.js)              │
│ Proxy Server (Node.js)             │
│ Analyzer Worker (Python FastAPI)   │
├────────────────────────────────────┤
│ PostgreSQL 15+ (고객사 DB)         │
│ Redis 7+ (세션/큐)                 │
└────────────────────────────────────┘
```

### 선택 스택

- **인증 통합**: Keycloak (SSO 브로커)
- **모니터링**: Prometheus + Grafana
- **로그 집계**: Loki / ELK
- **메시징**: RabbitMQ / NATS (배치 분석용)

---

## PA-011-02 — Docker Compose 예시 (SHOULD)

```yaml
version: "3.8"

services:
  nginx:
    image: nginx:alpine
    ports: ["443:443"]
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on: [frontend, proxy]

  frontend:
    image: gridge-ai/aiops-frontend:${VERSION}
    environment:
      - NEXT_PUBLIC_API_URL=https://aiops.internal.company.kr
      - NEXT_PUBLIC_MODE=B
    depends_on: [api]

  api:
    image: gridge-ai/aiops-api:${VERSION}
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
      - SMTP_HOST=${SMTP_HOST}
    depends_on: [postgres, redis]

  proxy:
    image: gridge-ai/aiops-proxy:${VERSION}
    ports: ["4000:4000"]
    environment:
      - DATABASE_URL=${DATABASE_URL}
    depends_on: [postgres]

  analyzer:
    image: gridge-ai/aiops-analyzer:${VERSION}
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - LLM_ENDPOINT=${CUSTOMER_LLM_ENDPOINT}  # 고객사 자체 LLM
    depends_on: [postgres]

  postgres:
    image: postgres:15
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    environment:
      POSTGRES_DB: aiops
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  postgres-data:
  redis-data:
```

---

## PA-011-03 — 데이터 격리 (MUST)

### 네트워크

- 외부로 나가는 **유일한 경로**: 프록시 서버 → 고객 지정 LLM API (Anthropic/OpenAI/자체 호스팅)
- 텔레메트리 / 라이선스 체크 / 업데이트 확인 등 **모든 외부 호출 금지**
- 방화벽 규칙: outbound allow-list 로만 LLM API 도메인 허용

### 라이선스

- 오프라인 라이선스 파일 (`license.key`) — 고객사별 발급
- 파일에 암호화된 JSON (만료일 / 허용 사용자 수 / 고객사 ID)
- 만료 30일 전 대시보드 경고 (인터넷 없이도 작동 — 파일 내부 날짜)

```json
{
  "customer": "코레일",
  "expires_at": "2027-04-18",
  "max_users": 500,
  "signature": "..."  // Gridge private key로 서명
}
```

---

## PA-011-04 — 업데이트 방식 (MUST)

### 온라인 업데이트 (방화벽 외부 LLM API만 허용)

- 그릿지 공식 Helm chart / Docker image를 **고객이 pull**
- 자동 업데이트 **없음** — 고객이 수동 트리거
- 변경 이력: `98_governance.md § 10` 참조

### 에어갭 업데이트 (완전 오프라인)

- 그릿지가 `aiops-offline-{version}.tar` 번들 전달 (USB / 보안 네트워크)
- 번들 구성:
  - 모든 Docker image (tar)
  - 마이그레이션 스크립트
  - 서명 (`sha256sum.txt` + Gridge private key)
- 고객 IT팀이 내부 레지스트리에 로드 후 배포

---

## PA-011-05 — 인증 / SSO 특수 처리 (MUST)

### Keycloak 브로커

Mode B 고객은 자체 SSO (AD FS / Ping / 사내 Okta)를 쓰기 일쑤:

```
사용자 → AiOPS Frontend → Keycloak → 고객 SSO → 고객 IdP
```

- Keycloak이 protocol 변환 (SAML ↔ OIDC)
- AiOPS 자체는 Keycloak OIDC만 신뢰

### 로컬 관리자 계정

- Keycloak 장애 시 백업용 로컬 super_admin 1개 유지
- `admin_local.password` 파일로 초기 패스워드 (최초 로그인 시 변경 강제)
- 2FA 필수 (G-142)

---

## PA-011-06 — 모니터링 / 장애 대응 (SHOULD)

### 메트릭 노출

- `/metrics` 엔드포인트 (Prometheus 포맷)
- 주요 지표: 프록시 QPS / 에러율 / DB 커넥션 / 큐 깊이

### 로그 수집

- 고객사 내부 ELK / Loki 로 전송
- 그릿지 서버로 **절대 전송 X**

### 원격 지원 (고객 요청 시)

- 고객 승인 → 1회성 VPN 접속
- 스크린 쉐어 (화면 공유 도구, 데이터 접근 X)
- 직접 SSH / DB 접근 **금지**
- 세션 후 VPN 계정 즉시 회수

---

## PA-011-07 — 성능 기준 (SHOULD)

고객사 규모별 권장 사양:

| 규모 | 사양 |
|---|---|
| ~50인 | 4 vCPU / 16GB / 200GB SSD |
| ~200인 | 8 vCPU / 32GB / 500GB SSD + PG replica |
| 500인+ | K8s 3노드 / PG cluster / Redis cluster |

### 부하 테스트

그릿지 측에서 배포 전 고객 환경 시뮬레이션:
- 500인 기준 초당 500 로그 insertion 처리
- p99 프록시 latency ≤ 200ms

---

## PA-011-08 — 데이터 내보내기 (MUST)

`05_infra_mode § 9` (G-089) 정합:

- 고객 언제든지 전체 ZIP 내보내기
- 서비스 종료 시에는 불필요 (원본이 이미 고객 서버)
- 마이그레이션 시 사용 (다른 환경으로 이관)

### 포맷

```
aiops-export-YYYY-MM-DD.zip
├── logs.jsonl        (전체 로그)
├── users.json
├── orgs.json
├── alerts.jsonl
├── audit_logs.jsonl
├── maturity_scores.jsonl
└── metadata.json     (버전 / 시각)
```

---

## PA-011-09 — 외부 노출 금지 사항 (MUST)

온프레미스 배포에서도 Gridge 내부 용어 **UI 노출 금지** (G-004):

금지:
- "AI 옵저버" (대신 "AiOPS")
- "Paperclip" / "LucaPus" (AiOPS 단독 판매 시엔 애초에 미사용)
- "mitmproxy 프록시" 같은 기술 디테일 (UI는 "네트워크 수집 설정")

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] 외부 LLM API 외의 다른 외부 호출 (텔레메트리 / 업데이트 체크 등)?
- [ ] 자동 업데이트 로직 (고객 승인 없이 image 변경)?
- [ ] `license.key` 파일 검증 없이 동작?
- [ ] 로컬 관리자 계정이 2FA 없이 활성?
- [ ] Docker image에 그릿지 telemetry collector 포함?
- [ ] 에어갭 환경에서 온라인 라이선스 체크 시도?
- [ ] 원격 지원 중 VPN 세션이 자동 종료 안 됨?

---

## 참조

- Mode B 원칙: `05_infra_mode.md § 7` (G-087)
- 데이터 보유 / 내보내기: `08_security.md § 6` (G-145) / `05_infra_mode § 9` (G-089)
- 외부 노출 금지어: `01_product.md § 4` (G-004)
- 2FA / SSO: `08_security.md § 3` (G-142)
- 감사 로그: `08_security.md § 2` (G-141)
- 성능 / 부하: `products/aiops/rules/proxy.md § PA-002-05`
