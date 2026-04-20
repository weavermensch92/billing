/**
 * gridge-harness status
 *
 * Shows the current harness state:
 * - config.yml values (4축: product/mode/stage + actor)
 * - session.yml state (current chain, loaded files, pending handoffs)
 * - Rule counts (ALWAYS_LOAD budget, total rules)
 * - Sanity warnings (missing config, stale session, etc.)
 *
 * Refs: 98_governance.md § 부록 A, B
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CWD = process.cwd();

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function readSafe(p) { try { return fs.readFileSync(p, 'utf-8'); } catch { return null; } }

function parseSimpleYaml(content) {
  // 간단한 파서 — 값이 string/number인 탑레벨 키만 지원
  if (!content) return {};
  const result = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i);
    if (!m) continue;
    const [, key, raw] = m;
    const trimmed = raw.trim().replace(/^['"]|['"]$/g, '');
    result[key] = trimmed;
  }
  return result;
}

function countLines(file) {
  const content = readSafe(file);
  return content ? content.split('\n').length : 0;
}

function section(title) {
  console.log('');
  console.log(`━━━ ${title} ━━━`);
}

function kv(key, value, warn = false) {
  const mark = warn ? '⚠ ' : '  ';
  console.log(`${mark}${key.padEnd(22)} ${value}`);
}

function main() {
  console.log(`Gridge AIMSP Harness — status`);
  console.log(`Directory: ${CWD}`);

  // === 1. 하네스 설치 확인 ===
  section('Installation');

  const claudeDir = path.join(CWD, '.claude');
  if (!exists(claudeDir)) {
    console.log('⚠  .claude/ not found. Run: npx gridge-harness init');
    process.exit(1);
  }
  kv('.claude/', '✓ found');

  const contextDir = path.join(CWD, '.context');
  kv('.context/', exists(contextDir) ? '✓ found' : '⚠ missing', !exists(contextDir));

  // === 2. config.yml (4축) ===
  section('Project config (.context/config.yml)');

  const configPath = path.join(contextDir, 'config.yml');
  const config = parseSimpleYaml(readSafe(configPath));

  if (!exists(configPath)) {
    console.log('⚠  config.yml not found. Run: npx gridge-harness init');
  } else {
    kv('product', config.product || '(missing)', !config.product);
    kv('mode', config.mode || '(missing)', !config.mode);
    kv('stage', config.stage || '(missing)', !config.stage);
    kv('org_id', config.org_id || '(missing)', !config.org_id);
    kv('project_id', config.project_id || '(missing)', !config.project_id);
    kv('harness_version', config.harness_version || '(unknown)', !config.harness_version);
  }

  // === 3. session.yml (현재 세션) ===
  section('Current session (.context/session.yml)');

  const sessionPath = path.join(contextDir, 'session.yml');
  const session = parseSimpleYaml(readSafe(sessionPath));

  if (!exists(sessionPath)) {
    console.log('  No active session. (Will be created when Claude Code starts.)');
  } else {
    kv('session_id', session.session_id || '(unknown)');
    kv('actor', session.actor || '(unknown)');
    kv('branch', session.branch || '(unknown)');
    kv('chain', session.chain || '(idle)');
    kv('chain_step', session.chain_step || '—');
    kv('last_activity', session.last_activity || '(unknown)');

    const stale = session.last_activity &&
      (Date.now() - new Date(session.last_activity).getTime()) > 86400000 * 3;
    if (stale) {
      console.log('⚠  Session is stale (>3 days). Consider: /gz-resume or start fresh.');
    }
  }

  // === 4. 규칙 카운트 ===
  section('Rule counts');

  const rulesDir = path.join(claudeDir, 'rules');
  const mdFiles = [];
  if (exists(rulesDir)) {
    for (const f of fs.readdirSync(rulesDir)) {
      if (f.endsWith('.md')) mdFiles.push(path.join(rulesDir, f));
    }
  }
  kv('rules/ files', mdFiles.length);

  // ALWAYS_LOAD 예산 체크
  const ALWAYS_LOAD = [
    'CLAUDE.md',
    'rules/00_index.md', 'rules/01_product.md', 'rules/03_hierarchy.md',
    'rules/06_hitl.md',
    'rules/90_execution_chain.md', 'rules/99_protocol.md',
    'rules/92_transition.md', 'rules/93_workflow.md', 'rules/98_governance.md',
  ];
  let totalLines = 0;
  let missingCount = 0;
  for (const rel of ALWAYS_LOAD) {
    const p = path.join(claudeDir, rel);
    if (exists(p)) totalLines += countLines(p);
    else missingCount++;
  }
  const pct = Math.round((totalLines / 3500) * 100);
  kv('ALWAYS_LOAD budget', `${totalLines} / 3500 lines (${pct}%)`, missingCount > 0);
  if (missingCount > 0) {
    console.log(`⚠  ${missingCount} ALWAYS_LOAD file(s) missing.`);
  }

  // 총 규칙 ID 수 (간단 집계)
  let ruleIdCount = 0;
  const idPattern = /^\|\s*(G-\d+|PA-\d+|PL-\d+|PW-\d+|PB-\d+|D-\d+|I-\d+|L-\d+|H-\d+)\s*\|/gm;
  for (const f of mdFiles) {
    const content = readSafe(f) || '';
    const matches = content.match(idPattern);
    if (matches) ruleIdCount += matches.length;
  }
  kv('rule IDs declared', ruleIdCount);

  // === 5. 제품 범위 ===
  section('Product scope');

  const productsDir = path.join(claudeDir, 'products');
  if (exists(productsDir)) {
    for (const p of fs.readdirSync(productsDir)) {
      const routerPath = path.join(productsDir, p, 'CLAUDE.md');
      kv(`products/${p}`, exists(routerPath) ? '✓ router' : '⚠ no router', !exists(routerPath));
    }
  }

  // === 6. 런타임 이슈 ===
  section('Runtime notes');

  const issueDir = path.join(contextDir, 'issue');
  if (exists(issueDir)) {
    const issues = fs.readdirSync(issueDir).filter(f => f.endsWith('.md'));
    if (issues.length === 0) {
      kv('pending issues', '✓ none');
    } else {
      kv('pending issues', issues.length);
      for (const i of issues.slice(0, 5)) {
        console.log(`    - ${i}`);
      }
      if (issues.length > 5) console.log(`    (${issues.length - 5} more)`);
    }
  }

  // === 7. 다음 제안 ===
  section('Next steps');

  if (!exists(configPath)) {
    console.log('  → Run: npx gridge-harness init');
  } else if (!exists(sessionPath)) {
    console.log('  → Open Claude Code to begin a session');
  } else if (session.chain) {
    console.log(`  → Resume chain: ${session.chain} (step ${session.chain_step || '?'})`);
  } else {
    console.log('  → All set. Ready for the next task.');
  }
  console.log('');
}

main();
