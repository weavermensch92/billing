# AiOPS / Alerts — 규칙 본문

> PA-009 본문. 이상 감지 룰, 알림 우선순위, Slack/Email 전송, 사용자 액션.

---

## PA-009 — 이상 감지 룰 (MUST)

### 기본 룰 (Sprint 1~2)

| 룰 ID | 감지 조건 | 우선순위 | 대상 |
|---|---|---|---|
| AL-001 | 일간 토큰 사용량 전주 대비 **200%+** 초과 | 🟡 Medium | 사용자 + admin_teams |
| AL-002 | 동일 세션 재질문 **3회+** | 🟡 Medium | 사용자 (코칭 트리거) |
| AL-003 | **7일 연속** 미사용 | 🔵 Low | admin_teams |
| AL-004 | 단일 프롬프트 입력 토큰 **4,000+** | 🟡 Medium | 사용자 |
| AL-005 | 민감 정보 감지 (PA-007) | 🔴 High | 사용자 + super_admin |
| AL-006 | 고비용 모델 + 단순 작업 | 🟡 Medium | 사용자 (모델 전환 권장) |
| AL-007 | 비정상 로그인 시도 | 🔴 High | super_admin |
| AL-008 | Rate limit 누적 30회+ / 시간 | 🟡 Medium | admin_teams |
| AL-009 | API 에러율 10%+ / 10분 | 🔴 High | super_admin |
| AL-010 | 업무 외 시간 집중 사용 | 🔵 Low | 본인만 |

---

## PA-009-01 — 감지 파이프라인 (MUST)

### 트리거 타입 2종

1. **실시간 (real-time)** — 각 로그 적재 시 즉시 평가 (PA-007 PII, AL-005)
2. **배치 (batched)** — 5분 / 1시간 / 일간 집계 후 평가 (AL-001, AL-003)

### 구현

```typescript
// alerts/rules/*.ts — 룰 하나씩 파일 분리
// 각 룰은 표준 인터페이스 구현

export interface AlertRule {
  id: string;
  priority: 'high' | 'medium' | 'low';
  trigger: 'realtime' | 'batched';
  interval?: '5min' | '1hour' | 'daily';  // batched일 때만

  evaluate: (ctx: EvalContext) => Promise<Alert[]>;
}

interface EvalContext {
  org_id: string;
  since: Date;
  db: SupabaseClient;
}

interface Alert {
  rule_id: string;
  user_id?: string;
  org_id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  detected_at: Date;
  related_log_ids?: string[];
}
```

### 룰 예시 (AL-001)

```typescript
// alerts/rules/cost_spike.ts
export const costSpike: AlertRule = {
  id: 'AL-001',
  priority: 'medium',
  trigger: 'batched',
  interval: 'daily',

  async evaluate({ org_id, db }) {
    const today = await db.rpc('sum_tokens_today', { org_id });
    const lastWeek = await db.rpc('sum_tokens_last_week_same_day', { org_id });

    if (lastWeek === 0) return [];  // 비교 불가
    const ratio = today / lastWeek;
    if (ratio < 3.0) return [];     // 200% = 3배

    return [{
      rule_id: 'AL-001',
      org_id,
      priority: 'medium',
      title: '비용 폭증 감지',
      description: `일간 토큰 사용량 전주 대비 ${Math.round((ratio - 1) * 100)}% 초과`,
      detected_at: new Date(),
    }];
  },
};
```

### 스케줄러

```typescript
// alerts/scheduler.ts
import { costSpike, reQueryPattern, unusedUser, /* ... */ } from './rules';

const rules: AlertRule[] = [costSpike, reQueryPattern, unusedUser /* ... */];

// 실시간 룰은 로그 적재 훅에서
async function onLogInsert(log: Log) {
  const rtRules = rules.filter(r => r.trigger === 'realtime');
  for (const rule of rtRules) {
    const alerts = await rule.evaluate({ org_id: log.org_id, since: new Date(Date.now() - 60_000), db });
    await persistAlerts(alerts);
    await notifyAlerts(alerts);
  }
}

// 배치 룰은 cron
import cron from 'node-cron';

cron.schedule('*/5 * * * *', () => runBatch('5min'));
cron.schedule('0 * * * *', () => runBatch('1hour'));
cron.schedule('0 9 * * *', () => runBatch('daily'));  // 매일 오전 9시
```

---

## PA-009-02 — 알림 테이블 스키마 (MUST)

```sql
CREATE TABLE alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  rule_id         text NOT NULL,                     -- 'AL-001' ...
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,

  priority        text NOT NULL CHECK (priority IN ('high','medium','low')),
  title           text NOT NULL,
  description     text NOT NULL,

  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','dismissed','resolved')),

  resolution_note text,
  resolved_by     uuid REFERENCES users(id),
  resolved_at     timestamptz,

  related_log_ids uuid[] DEFAULT ARRAY[]::uuid[],    -- 연관 logs.id
  notified_channels text[] DEFAULT ARRAY[]::text[], -- ['email','slack']

  detected_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_org_status ON alerts(org_id, status, detected_at DESC);
CREATE INDEX idx_alerts_user ON alerts(user_id, status, detected_at DESC);
```

---

## PA-009-03 — 알림 채널 (MUST)

### Email (기본)

- `resend` / `postmark` 등 SaaS 사용
- 권한별 라우팅:
  - `member` → 본인 이메일
  - `admin_teams` → 팀 내 알림 (담당 팀 한정)
  - `super_admin` → 전사 알림

### Slack (선택, 엔터프라이즈)

- 조직별 Slack Workspace 연동 (OAuth)
- 채널 매핑: `alerts-{team_name}` 또는 `#aiops-alerts`
- 우선순위별 이모지: 🔴 🟡 🔵

```typescript
async function notifySlack(alert: Alert, orgChannel: string) {
  const emoji = { high: '🔴', medium: '🟡', low: '🔵' }[alert.priority];
  await slackWebhook.post(orgChannel, {
    text: `${emoji} *${alert.title}*\n${alert.description}`,
    attachments: [{
      color: alert.priority === 'high' ? 'danger' : 'warning',
      fields: [
        { title: 'Rule', value: alert.rule_id, short: true },
        { title: 'Detected', value: alert.detected_at.toISOString(), short: true },
      ],
      actions: [
        { type: 'button', text: '확인', url: alertUrl(alert.id) },
        { type: 'button', text: '무시', url: dismissUrl(alert.id) },
      ],
    }],
  });
}
```

### In-app (대시보드)

- 우측 상단 벨 아이콘 + 배지 (미확인 수)
- 클릭 시 알림 목록 패널 (상태 필터)

---

## PA-009-04 — 사용자 액션 (MUST)

알림 카드에서 가능한 액션:

| 액션 | 동작 |
|---|---|
| **확인** (confirm) | 알림 상태 → `confirmed`. 후속 조치 완료 표시 |
| **무시** (dismiss) | 알림 상태 → `dismissed`. 비슷한 알림 N일간 숨김 (룰에 따라) |
| **민감함 확인** (PA-007 전용) | PII 감지가 실제 민감 정보임을 확인 |
| **민감하지 않음** (PA-007 전용) | 오탐 판정. 학습 데이터로 축적 |
| **보류** | 상태 유지, 24시간 후 재평가 |
| **코칭 발송** | 대상 사용자에게 관련 코칭 카드 즉시 발송 |

### 무시 반복 방지

동일 룰 동일 사용자 대상 `dismissed` 가 **3회+ 누적** 시:
- admin_teams 에게 "이 룰 비활성화 검토" 알림
- 룰 임계치 조정 제안

---

## PA-009-05 — 알림 묶음 / 노이즈 방지 (SHOULD)

### 묶음 규칙

- 같은 `rule_id` + `user_id` + 30분 이내 → 묶어서 1건
- 같은 `rule_id` + `org_id` 전체 10건+/5분 → 조직 전체 요약으로 전환

### 업무 외 시간 지연

- `00:00~07:00` 감지된 🔵 Low는 다음 영업일 9시 전송
- 🔴 High는 즉시 전송

### 조용한 시간 (Org Admin 설정)

- "근무 시간 외 알림 금지" 토글
- 🔴 High 예외: 보안 사건은 즉시 (PA-007/AL-007)

---

## PA-009-06 — 알림 우선순위별 처리 (MUST)

### 🔴 High

- 전송 채널: Email + Slack + In-app
- 대상: super_admin + 해당 admin_teams
- 평균 응답 기대: 1시간 내 확인
- 에스컬레이션: 24시간 미확인 시 super_admin 재전송

### 🟡 Medium

- 전송 채널: Email (일간 다이제스트) + In-app (즉시)
- 대상: 해당 사용자 + admin_teams
- 평균 응답 기대: 영업일 내

### 🔵 Low

- 전송 채널: In-app만 (이메일 X)
- 주간 다이제스트에만 포함
- 자동 만료 (30일)

---

## PA-009-07 — Mode 별 차이 (MUST)

### Mode A / C

- 모든 알림 정상 작동
- Slack 연동 OAuth 대시보드에서

### Mode B (온프레미스)

- Slack 연동 **금지** (외부 서비스로 데이터 나감)
- Email은 고객사 내부 SMTP 사용
- In-app 만 기본. Slack 원하면 사내 Mattermost / Rocket.Chat 등 self-hosted

---

## PA-009-08 — 알림 감사 (MUST)

G-141 감사 대상 행위 중 "권한 거부 발생" / "로그인 실패" 계열은 감사 로그와 알림 **양쪽에** 기록:

- `alerts` 테이블: 사용자 알림용 (확인 / 무시 가능)
- `audit_logs` 테이블: immutable 기록 (삭제 불가)

중복 아님. 역할 다름.

---

## 자동 검증 체크리스트

체인 실행 중 아래 감지 시 Conflict 자동 발동:

- [ ] AL-005 (PII 감지) 알림이 member 대시보드에 표시되어 다른 사용자 PII 노출?
- [ ] Mode B 에서 Slack 알림 전송?
- [ ] 🔴 High 알림이 업무 외 시간 지연 큐에 들어감?
- [ ] `alerts` 테이블에 UPDATE 제약 누락 (감사 행위 일부는 immutable 필요)?
- [ ] 알림 본문에 민감 정보 원문 포함?
- [ ] 감사 로그 없이 알림만 기록 (G-141 위반)?

---

## 참조

- 데이터 모델 (logs.flagged): `products/aiops/rules/data_model.md § PA-001`
- 민감 정보 감지: `products/aiops/rules/governance.md § PA-007`
- 권한 분기: `products/aiops/rules/auth.md § PA-004-03`
- Mode B 제외: `05_infra_mode.md § 7` (G-087)
- 감사 로그 immutable: `08_security.md § 2` (G-141)
- 보안 사건 대응: `08_security.md § 13` (G-160)
