# Billing / Screens / Customer / audit_log — `/app/settings/audit-log`

> 고객 감사 로그. PB-010 `visibility IN ('customer_only','both')` + 고객 측 마스킹 적용.

---

## 목적

고객이 조직 내 모든 Billing 관련 이벤트 투명성 확보. 규정 준수 증빙 + 내부 감사 + 보안 사고 조사.

## 레이아웃

```
┌──────────────────────────────────────────────────┐
│ 감사 로그                    [📥 CSV 내보내기]      │
├──────────────────────────────────────────────────┤
│ 필터: [기간▾] [행위자▾] [액션▾] [🔍 검색]          │
├──────────────────────────────────────────────────┤
│ 시각              행위자       액션       대상     │
│ ─────────────    ──────────   ──────────  ──────  │
│ 05-15 14:22      Luna (AM)    VCN 발급   Alice   │
│   Alice 님 Claude Team VCN 발급 완료               │
│   [상세 ↗]                                         │
│ ─────────────    ──────────   ──────────  ──────  │
│ 05-15 14:00      You          요청 제출   Alice   │
│   신규 계정 요청 · Claude Team · ₩30,000          │
│   [상세 ↗]                                         │
│ ─────────────    ──────────   ──────────  ──────  │
│ 05-14 18:45      System       청구 발행   -       │
│   2026년 4월 청구서 발행 (₩8,019,000)              │
│   [상세 ↗]                                         │
└──────────────────────────────────────────────────┘
```

## 필터 옵션

- **기간**: 최근 7일 / 30일 / 3개월 / 전체
- **행위자 유형**: 전체 / 조직 내부 (멤버) / Gridge (AM) / 시스템 자동
- **액션 타입**: 전체 / VCN / 요청 / 청구 / 멤버 / 기타
- **검색**: 멤버 이름 / 서비스 / 메모 등 부분 매칭

## 로그 상세 드로어

```
┌──────────────────────────────────────────────┐
│ 감사 로그 상세                         [×]    │
├──────────────────────────────────────────────┤
│ 시각:      2026-05-15 14:22:31 KST            │
│ 행위자:    Luna (Gridge AM)                   │
│ 액션:      VCN 발급 완료                       │
│ 대상:      virtual_cards                      │
│ 대상 ID:   vcn_abc123                         │
│                                                │
│ ────────── 변경 내용 ──────────               │
│ 이전 상태: issuing                            │
│ 이후 상태: issued                             │
│                                                │
│ 기타 정보:                                     │
│ ├ 발급사: 신한 V-Card                          │
│ ├ 마지막 4자리: 4521                           │
│ ├ 월 한도: ₩30,000                             │
│ └ 유효기간: 2027-05-01                         │
│                                                │
│ 민감 정보 (마스킹 적용):                        │
│ ├ 전체 번호: *** (내부 전용)                   │
│ └ 원본 페이로드: *** (내부 전용)                │
└──────────────────────────────────────────────┘
```

**마스킹** — `gridge_margin_krw`, `raw_payload`, 전체 VCN 번호 등은 고객 측에서 `***` 로 표시 (PB-010-04).

## 가시성 필터링 (DB)

```sql
SELECT * FROM v_audit_customer   -- 고객 전용 뷰
WHERE org_id = $1
  AND created_at >= $from
  AND created_at < $to
ORDER BY created_at DESC
LIMIT 50 OFFSET $page;

-- v_audit_customer 정의:
CREATE VIEW v_audit_customer AS
SELECT id, org_id, actor_type, actor_email, action_type,
  target_table, target_id, 
  mask_sensitive(before_data) AS before_data,
  mask_sensitive(after_data) AS after_data,
  description, created_at
FROM audit_logs
WHERE visibility IN ('customer_only','both');
```

## CSV 내보내기 (규정 준수)

```
[📥 CSV 내보내기] → 팝업
  기간 선택: [최근 3개월] / [2026년 5월] / [사용자 지정]
  [내보내기 시작]
  
→ export_jobs INSERT (type='audit_log_csv')
→ 백그라운드 생성
→ 완료 시 이메일 + 고객 포털 알림
→ 7일 유효 다운로드 링크 (Supabase Storage)
```

## 권한

- **Owner/Admin**: 조직 전체 감사 로그
- **Member**: 본인 관련 로그만 (`actor_id = 본인 id` 또는 `target` 이 본인)
- 사이드바 메뉴: Owner/Admin 만 노출

## 실시간 갱신

- `audit_logs` INSERT → 리스트 최상단 자동 추가 (시각적 하이라이트 2초)

## 빈 상태

```
감사 로그가 없습니다.
(필터 조건을 조정해보세요)
```

## Sprint 우선순위

**Sprint 4 필수**. 고객 규정 준수 / 내부 감사 / 해지 시 증빙.

## 참조

- `audit_logs` 스키마: `schemas/tables/audit_logs.md`
- 가시성 규칙: `rules/audit_visibility.md` (PB-010)
- v_audit_customer 뷰: `rules/audit_visibility.md § PB-010-04`
- 내보내기: `screens/customer/data_export.md`
- 콘솔 측 (전체 가시성): `screens/console/audit_log.md` (v0.24+)
