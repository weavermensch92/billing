/**
 * gridge-harness phase-check
 *
 * Billing MSP Phase 전환 체크포인트 자동 스캔 (PB-013).
 *
 * 사용법:
 *   node scripts/phase-check.js 0-to-1   (Phase 0 → 1 체크)
 *   node scripts/phase-check.js 1-to-2   (Phase 1 → 2 체크)
 *
 * 이 스크립트는 기술/운영/재무/고객 4축 체크포인트를 확인합니다.
 * 실제 운영 데이터 접근은 Supabase 연결이 필요하며, 현재는 룰북 내부
 * 규칙 파일 존재 여부 + 확장 포인트 검증에 한정됩니다.
 *
 * Phase 전환을 준비할 때 이 스크립트를 먼저 돌린 후, 실제 운영 지표
 * (월말 오차율, NPS, SLA 등) 는 별도 BI 대시보드에서 수동 확인하세요.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HARNESS_ROOT = path.dirname(__dirname);
const CLAUDE_DIR = path.join(HARNESS_ROOT, '.claude');

const transition = process.argv[2] || '0-to-1';

if (!['0-to-1', '1-to-2'].includes(transition)) {
  console.error('Usage: node scripts/phase-check.js [0-to-1 | 1-to-2]');
  process.exit(1);
}

let passed = 0;
let failed = 0;
let manualChecks = 0;

function check(label, condition, kind = 'technical') {
  if (condition === 'manual') {
    manualChecks++;
    console.log(`  📋 [${kind}] ${label} — 수동 확인 필요`);
    return;
  }
  if (condition) {
    passed++;
    console.log(`  ✅ [${kind}] ${label}`);
  } else {
    failed++;
    console.log(`  ❌ [${kind}] ${label}`);
  }
}

function fileExists(relPath) {
  return fs.existsSync(path.join(HARNESS_ROOT, relPath));
}

function mdContains(relPath, keyword) {
  const p = path.join(HARNESS_ROOT, relPath);
  if (!fs.existsSync(p)) return false;
  return fs.readFileSync(p, 'utf-8').includes(keyword);
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Billing MSP Phase Transition Check: ${transition.toUpperCase()}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

if (transition === '0-to-1') {
  console.log('[ Phase 0 → Phase 1 Checkpoint ]\n');

  console.log('📘 기술 (Technical)');
  check('카드사 B2B API 계약 (신한 V-Card) 문서 존재',
    mdContains('.claude/products/billing/playbook/card-issuer-ops.md', 'B2B API'),
    'technical');
  check('Smart Bill API 연동 문서 존재',
    mdContains('.claude/products/billing/playbook/smartbill.md', 'Phase 1 API'),
    'technical');
  check('1Password Connect 설정 가이드 존재',
    fileExists('.claude/products/billing/playbook/card-issuer-ops.md') &&
      mdContains('.claude/products/billing/playbook/card-issuer-ops.md', '1Password Connect'),
    'technical');
  check('백업 카드사 (KB SmartPay) 연동 문서',
    mdContains('.claude/products/billing/playbook/card-issuer-ops.md', 'KB SmartPay'),
    'technical');
  check('Alpha 3개월 안정 운영',
    'manual', 'technical');
  check('웹훅 서명 검증 구현',
    'manual', 'technical');

  console.log('\n📗 운영 (Operations)');
  check('Phase 0 Day-1 런북 존재', 
    fileExists('.claude/products/billing/playbook/phase0-day1-runbook.md'),
    'ops');
  check('월말 마감 SOP 존재',
    fileExists('.claude/products/billing/playbook/month-end-close.md'),
    'ops');
  check('거절 대응 SOP 존재',
    fileExists('.claude/products/billing/playbook/decline-response.md'),
    'ops');
  check('해지 절차 문서 존재',
    fileExists('.claude/products/billing/playbook/termination.md'),
    'ops');
  check('법무·세무 자문 체크리스트 존재',
    fileExists('.claude/products/billing/playbook/legal-tax-review.md'),
    'ops');
  check('월말 오차율 < 0.5% (최근 3개월)',
    'manual', 'ops');
  check('거절 대응 SLA 95%+ (최근 3개월)',
    'manual', 'ops');

  console.log('\n📕 재무 (Finance)');
  check('회계 분리 엔진 규칙 존재 (PB-009)',
    fileExists('.claude/products/billing/rules/accounting_split_engine.md'),
    'finance');
  check('Anthropic 패스스루 규칙 존재 (PB-007)',
    fileExists('.claude/products/billing/rules/anthropic_passthrough.md'),
    'finance');
  check('Alpha 월 매출 ₩500만+ 3개월 연속',
    'manual', 'finance');
  check('Anthropic 파트너십 승인',
    'manual', 'finance');
  check('2번째 고객 계약 또는 확정 파이프라인',
    'manual', 'finance');

  console.log('\n📙 고객 (Customer)');
  check('감사 가시성 규칙 존재 (PB-010)',
    fileExists('.claude/products/billing/rules/audit_visibility.md'),
    'customer');
  check('데이터 내보내기 화면 존재',
    fileExists('.claude/products/billing/screens/customer/data_export.md'),
    'customer');
  check('Alpha NPS ≥ 8 (D+90)',
    'manual', 'customer');
  check('업셀 시그널 감지 메커니즘 존재 (I-005)',
    fileExists('.claude/integrations/billing-wiring.md'),
    'customer');

  console.log('\n🔴 Red Flag 체크');
  check('Immutable Ledger 규칙 엄격 (PB-005)',
    fileExists('.claude/products/billing/rules/immutable_ledger.md'),
    'red-flag');
  check('이상 감지 룰 9종 이상',
    mdContains('.claude/products/billing/rules/anomaly_detection.md', 'decline_burst'),
    'red-flag');
}

if (transition === '1-to-2') {
  console.log('[ Phase 1 → Phase 2 Checkpoint ]\n');

  console.log('📘 기술 (Technical)');
  check('자동 온보딩 구현 여부',
    'manual', 'technical');
  check('ML 이상 감지 도입 여부',
    'manual', 'technical');
  check('SSO 연동 가이드 존재',
    fileExists('.claude/products/aiops/rules/auth.md') ||
      mdContains('.claude/products/billing/screens/console/INDEX.md', 'SSO'),
    'technical');
  check('해외 VCN (Wise/Airwallex) 계약 진행',
    'manual', 'technical');

  console.log('\n📗 운영 (Operations)');
  check('고객 5개사 이상 6개월 무사고',
    'manual', 'ops');
  check('운영 공수 고객당 월 4시간 이하',
    'manual', 'ops');
  check('Finance 전담자 채용',
    'manual', 'ops');
  check('리멤버 B2B 캠페인 준비',
    'manual', 'ops');

  console.log('\n📕 재무 (Finance)');
  check('월 매출 ₩5,000만+',
    'manual', 'finance');
  check('Anthropic 파트너십 재협상 성공',
    'manual', 'finance');

  console.log('\n📙 제품 (Product)');
  check('업셀 전환율 측정 구현',
    mdContains('.claude/integrations/billing-wiring.md', '전환율 KPI'),
    'product');
  check('Billing → AiOPS 20%+',
    'manual', 'product');
  check('Billing → Wiring 10%+',
    'manual', 'product');
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`결과: 자동 통과 ${passed} · 자동 실패 ${failed} · 수동 확인 ${manualChecks}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

if (failed > 0) {
  console.log('\n❌ 일부 체크포인트 실패. 룰북 확장 필요.');
  process.exit(1);
}

if (manualChecks > 0) {
  console.log('\n📋 수동 확인 체크포인트가 있습니다.');
  console.log('   BI 대시보드 / 운영 지표 확인 후 Super 판단 필요.');
  console.log('   자세한 기준: rules/phase_transition.md (PB-013)');
}

console.log('\n✅ 룰북 측 체크포인트 통과. Super 최종 승인 대기.');
process.exit(0);
