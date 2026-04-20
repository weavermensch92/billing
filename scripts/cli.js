#!/usr/bin/env node
/**
 * gridge-harness CLI
 *
 * Usage:
 *   npx gridge-harness init      — 신규 프로젝트 초기 설정
 *   npx gridge-harness add       — 기존 프로젝트에 하네스 추가
 *   npx gridge-harness upgrade   — 룰북 버전 업그레이드
 *   npx gridge-harness validate  — .claude/ 무결성 검증
 *   npx gridge-harness status    — 현재 세션 상태 표시
 *
 * Refs: 98_governance.md § 부록 A/B (config.yml / session.yml 포맷)
 */

'use strict';

const path = require('path');

const COMMAND = process.argv[2];
const VALID_COMMANDS = [
  'init', 'add', 'upgrade', 'uninstall',
  'validate', 'test', 'status',
  'help', '--help', '-h',
];

function printHelp() {
  console.log(`
gridge-harness — Gridge AIMSP Harness CLI

Commands:
  init       Initialize harness in a new project
             (creates .claude/, .context/config.yml, merges .gitignore)
             Flags: --yes/-y (non-interactive)

  add        Add harness to an existing project
             (preserves existing .claude/ and .context/ overrides)
             Flags: --force (overwrite local mods), --dry-run

  upgrade    Upgrade harness version
             (shows diff of local modifications, auto-adds new files)
             Flags: --force, --preview

  uninstall  Remove harness from the project
             (backs up .context/issue/ files)
             Flags: --yes/-y, --keep-context, --dry-run

  validate   Validate .claude/ integrity
             (checks rule ID uniqueness, file size limits, broken references)

  test       Run smoke tests (validate + package structure + sim install)

  status     Show current session state
             (reads .context/session.yml)

  help       Show this message

Refs: https://github.com/gridge-ai/aimsp-harness
`);
}

function main() {
  if (!COMMAND || COMMAND === 'help' || COMMAND === '--help' || COMMAND === '-h') {
    printHelp();
    process.exit(0);
  }

  if (!VALID_COMMANDS.includes(COMMAND)) {
    console.error(`Unknown command: ${COMMAND}`);
    console.error(`Run 'npx gridge-harness help' for available commands.`);
    process.exit(1);
  }

  const scriptPath = path.join(__dirname, `${COMMAND}.js`);
  try {
    require(scriptPath);
  } catch (err) {
    console.error(`Failed to execute '${COMMAND}':`, err.message);
    process.exit(1);
  }
}

main();
