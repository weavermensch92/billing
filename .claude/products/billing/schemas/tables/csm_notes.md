# Billing / Schemas / csm_notes — 테이블 본문

> CSM 내부 메모. 고객사별 운영 노트. `visibility = internal_only` 강제 (PB-010).

---

## DDL

```sql
CREATE TABLE csm_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- 작성자
  author_id       UUID NOT NULL REFERENCES admin_users(id),
  author_name     TEXT,                     -- 스냅샷 (작성 시점)
  author_role     TEXT,                     -- 'am', 'super', 'finance'
  
  -- 메모 분류
  note_type       TEXT DEFAULT 'general'
                  CHECK (note_type IN (
                    'general',             -- 일반
                    'monthly_review',      -- 월간 리뷰 노트
                    'deal_insight',        -- 영업 인사이트
                    'risk_signal',         -- 위험 감지
                    'vendor_contact',      -- 벤더와의 특수 연락
                    'legal_note',          -- 법무 관련
                    'handover'             -- AM 이관 시 인수인계
                  )),
  
  -- 내용
  title           TEXT,
  body            TEXT NOT NULL,
  tags            TEXT[] DEFAULT ARRAY[]::text[],
  
  -- 관련 엔티티 (optional)
  related_request_id UUID REFERENCES action_requests(id),
  related_review_id  UUID REFERENCES monthly_reviews(id),
  
  -- 중요도 / 표시
  priority        TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  is_pinned       BOOLEAN DEFAULT FALSE,     -- 고정 (항상 상단)
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_csm_notes_org ON csm_notes(org_id, created_at DESC);
CREATE INDEX idx_csm_notes_pinned ON csm_notes(org_id, created_at DESC) 
  WHERE is_pinned = TRUE;
CREATE INDEX idx_csm_notes_type ON csm_notes(org_id, note_type, created_at DESC);
```

## note_type 활용 예시

### `handover` (이관 시)
```
제목: Luna → Sarah AM 이관
태그: ['handover', 'alpha-inc']

Alpha Inc. 주요 포인트:
- Alice (Admin, 실무): 기술 질문 많음, 상세 답변 선호
- Bob (Owner): 분기 1회 미팅, Phase 전환 관심
- Slack Connect 활발 사용, 일일 1~2건 요청
- Wiring 도입 검토 중 (2026 Q3 목표)
- 크레딧백 종료 2026-10-01, 재계약 미팅 9월 중
```

### `deal_insight`
```
제목: Alpha Wiring 도입 요인
태그: ['upsell', 'wiring']

- 개발팀 60% AI 도구 사용 (Cursor, Claude Code)
- CTO 가 컨텍스트 관리 고민
- Q3 예산 승인 완료
- 선호: 온프레미스 배포 → Mode B
```

### `risk_signal`
```
제목: Alpha 월 지출 예상 대비 +30%
priority: high
태그: ['risk', 'cost', '2026-05']

5월 지출 ₩7.3M, 원래 ₩5.5M 예상.
원인: Anthropic API 사용 급증 (개발팀 코드 생성 집중)
조치: Bob 과 예산 재협의 예정 (5/20 월간 리뷰)
```

## 조회 패턴

```sql
-- 콘솔 /console/orgs/[id] 메모 탭
SELECT cn.*, au.name AS current_author_name
FROM csm_notes cn
LEFT JOIN admin_users au ON au.id = cn.author_id
WHERE cn.org_id = $1
ORDER BY cn.is_pinned DESC, cn.created_at DESC
LIMIT 50;

-- 월간 리뷰 준비 시 최근 리스크 시그널
SELECT * FROM csm_notes
WHERE org_id = $1 AND note_type = 'risk_signal'
  AND created_at >= now() - interval '3 months'
ORDER BY created_at DESC;

-- 태그 검색
SELECT * FROM csm_notes
WHERE org_id = $1 AND 'wiring' = ANY(tags)
ORDER BY created_at DESC;
```

## 자동 기록 (월간 리뷰 완료 시)

```sql
-- monthly_reviews.completed_at 설정 시 자동 INSERT
INSERT INTO csm_notes (
  org_id, author_id, author_role, note_type,
  title, body, related_review_id
)
SELECT 
  mr.org_id, mr.completed_by, 'am', 'monthly_review',
  format('%s 월간 리뷰', to_char(mr.reviewed_at, 'YYYY-MM')),
  mr.meeting_notes,
  mr.id
FROM monthly_reviews mr
WHERE mr.id = $1 AND mr.completed_at IS NOT NULL;
```

## 가시성 강제 (PB-010)

**규칙**: `csm_notes` INSERT 시 자동으로 `audit_logs INSERT (visibility='internal_only')` 생성. 고객 포털에 절대 노출 안 됨.

```sql
CREATE OR REPLACE FUNCTION log_csm_note_created() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    org_id, actor_type, actor_id, action_type,
    target_table, target_id, visibility, description
  ) VALUES (
    NEW.org_id, 'admin', NEW.author_id, 'csm_note_created',
    'csm_notes', NEW.id::text, 'internal_only',
    format('CSM 메모 작성: %s', NEW.title)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_csm_note_created
  AFTER INSERT ON csm_notes
  FOR EACH ROW EXECUTE FUNCTION log_csm_note_created();
```

## RLS

admin Auth 서버 미들웨어로 분리. DB 레벨 RLS 는 `internal_only` 테이블이므로 적용 안 함 (고객 포털 Supabase Auth 가 이 테이블에 접근 안 함).

## 보존

- CSM 노트는 **영구 보관** (법정 책임 증빙 + 영업 인사이트 자산)
- 조직 해지 시에도 유지 (org_id 유지, 조직 삭제 CASCADE 아님)

## 참조

- 가시성 규칙: `rules/audit_visibility.md` (PB-010)
- 월간 리뷰: `schemas/tables/monthly_reviews.md`
- 업셀 인사이트 (I-005): `integrations/billing-wiring.md`
- CSM 리뷰 UI: `screens/console/csm/reviews.md`
- 이관 SOP: `playbook/phase0-day1-runbook.md § 일일 운영`
