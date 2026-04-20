# AiOPS / Channels / ChatGPT Crawler — 규칙 본문

> PA-005-06 본문. ChatGPT 웹 대화 수집. 공유 링크 기반 크롤러 방식.
> 완전성: ⚠️ 70%. 사용자 협조 필요.

---

## 원리

ChatGPT 웹 / 앱은 DOM 접근 불가 (브라우저 익스텐션은 chatgpt.com 웹만 가능).
→ **공유 링크 (chatgpt.com/share/...) 를 고객사에 등록 → 크롤러가 주기 수집**.

### 한계

- 사용자가 직접 대화방 "공유" 해야 수집됨
- 공유 링크 URL 이 **실시간 업데이트** (신규 메시지 반영 확인됨, 스냅샷 아님)
- 15분 주기 크롤링 → 실시간 X, 거의 실시간

---

## 크롤러 구조 (Playwright)

```typescript
// crawler/gpt_crawler.ts
async function crawlShareLink(target: CrawlerTarget) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(target.url);
  await page.waitForSelector('[data-message-author-role]', { timeout: 10_000 });

  // 메시지 수집
  const messages = await page.$$eval('[data-message-author-role]', els =>
    els.map(el => ({
      role: el.getAttribute('data-message-author-role'),
      content: el.innerText.trim(),
    }))
  );

  await browser.close();

  // 증분: 이전 수집 이후 신규만
  const newMessages = messages.slice(target.last_message_count);
  if (newMessages.length === 0) return;

  // user/assistant 쌍으로 묶어서 저장
  for (let i = 0; i < newMessages.length; i += 2) {
    if (newMessages[i].role === 'user') {
      await saveLog({
        org_id: target.org_id,
        user_id: target.user_id,
        channel: 'chatgpt_share',
        session_id: target.id,
        prompt: newMessages[i].content,
        response: newMessages[i + 1]?.content || '',
        input_tokens: 0,   // 공유 링크에서 토큰 정보 없음
        output_tokens: 0,
        cost_usd: 0,
        timestamp: new Date(),
      });
    }
  }

  await supabase.from('crawler_targets').update({
    last_crawled_at: new Date(),
    last_message_count: messages.length,
  }).eq('id', target.id);
}

// 15분 주기
setInterval(runCrawlerScheduler, 15 * 60 * 1000);
```

---

## `crawler_targets` 테이블

```sql
CREATE TABLE crawler_targets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES orgs(id),
  user_id             uuid REFERENCES users(id),
  url                 text NOT NULL,
  session_title       text,                                   -- 사용자 입력
  last_crawled_at     timestamptz,
  last_message_count  integer NOT NULL DEFAULT 0,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crawler_active ON crawler_targets(active, last_crawled_at);
```

---

## 고객사 등록 플로우

1. 직원이 ChatGPT 에서 새 대화방 생성 + **공유 ON** (Settings → Data controls → Shared links)
2. 공유 링크 복사 (예: `https://chatgpt.com/share/abc-def-...`)
3. AiOPS 대시보드 → 설정 → 공유 링크 등록 → URL + 세션 제목 입력
4. 크롤러가 15분 후 첫 수집 → 대시보드에 로그 나타남

### 주의: 개인정보

- 공유 링크는 **공개 URL** (링크 있는 누구나 접근 가능)
- 직원 개인정보 / 사내 코드 공유 시 유출 위험
- 고객사에 공유 전 내용 검토 가이드 제공

---

## 모바일 앱 대응

ChatGPT iOS / Android 앱에서도 공유 링크 생성 가능:
- "Share" 버튼 → Copy Link
- 데스크톱에서 등록
- 크롤러가 동일 링크 수집

→ **앱 사용도 간접 커버** (완전성 0% → 50%로 향상)

---

## 실패 / 장애 대응

- ChatGPT 구조 변경 (DOM 셀렉터 변경) → 정기 회귀 테스트
- 링크 삭제 (404) → `active = false` 전환 + OA 알림
- Rate limit → 배치 분산 (동일 도메인 초당 2개 이하)

---

## 자동 검증 체크리스트

- [ ] 공유 링크에 민감 내용 있을 때 PII 경고 없이 저장?
- [ ] 15분 주기 크롤링이 동일 링크 중복 저장 (last_message_count 체크 누락)?
- [ ] 삭제된 링크 (404) 를 무한 재시도?
- [ ] 크롤러 User-Agent 에 "AiOPS Bot" 표시 없음 (OpenAI 차단 리스크)?

---

## 참조

- 로그 모델: `products/aiops/rules/data_model.md` (PA-001)
- PII 감지: `products/aiops/rules/governance.md` (PA-007)
- 채널 우선순위: `products/aiops/rules/channels.md` (PA-005)
