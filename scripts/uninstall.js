/**
 * gridge-harness uninstall
 *
 * Removes the harness from a consumer project.
 * - Deletes .claude/ and .context/ (with confirmation)
 * - Removes harness block from .gitignore
 * - Preserves user-generated files in .context/issue/ by default (backup first)
 *
 * Refs: 98_governance.md § 7 (데이터 소유 + 내보내기)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CWD = process.cwd();

const ARGS = process.argv.slice(2);
const YES = ARGS.includes('--yes') || ARGS.includes('-y') || !process.stdin.isTTY;
const KEEP_CONTEXT = ARGS.includes('--keep-context');
const DRY_RUN = ARGS.includes('--dry-run');

function log(msg)  { console.log(`[gridge-harness uninstall] ${msg}`); }
function warn(msg) { console.warn(`[gridge-harness uninstall] ⚠  ${msg}`); }

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

function rmRecursive(p) {
  if (!exists(p)) return;
  if (DRY_RUN) { log(`  would remove: ${path.relative(CWD, p)}`); return; }
  fs.rmSync(p, { recursive: true, force: true });
}

function confirm(question) {
  if (YES) return Promise.resolve(true);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N]: `, (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

function removeGitignoreBlock() {
  const gitignorePath = path.join(CWD, '.gitignore');
  if (!exists(gitignorePath)) return;

  const marker = '# === Gridge AIMSP Harness (auto-generated) ===';
  let content = fs.readFileSync(gitignorePath, 'utf-8');

  if (!content.includes(marker)) {
    log('  skip .gitignore (no harness block)');
    return;
  }

  // marker 부터 파일 끝까지 (또는 다음 유사 marker까지) 제거
  const idx = content.indexOf(marker);
  const before = content.slice(0, idx).trimEnd();
  content = before + '\n';

  if (!DRY_RUN) fs.writeFileSync(gitignorePath, content);
  log('  updated: .gitignore (harness block removed)');
}

function backupContextIssue() {
  const issueDir = path.join(CWD, '.context', 'issue');
  if (!exists(issueDir)) return null;

  const files = fs.readdirSync(issueDir).filter(f => f.endsWith('.md'));
  if (files.length === 0) return null;

  // 백업 디렉토리에 복사
  const backupDir = path.join(CWD, `gridge-harness-backup-${Date.now()}`);
  if (DRY_RUN) {
    log(`  would backup ${files.length} issue file(s) to: ${path.basename(backupDir)}/`);
    return backupDir;
  }
  fs.mkdirSync(backupDir, { recursive: true });
  for (const f of files) {
    fs.copyFileSync(path.join(issueDir, f), path.join(backupDir, f));
  }
  log(`  backup: ${files.length} issue file(s) → ${path.basename(backupDir)}/`);
  return backupDir;
}

async function main() {
  log(`Uninstalling from: ${CWD}`);
  if (DRY_RUN) log('(dry-run: no changes will be made)');
  log('');

  const claudeDir = path.join(CWD, '.claude');
  const contextDir = path.join(CWD, '.context');

  if (!exists(claudeDir) && !exists(contextDir)) {
    log('Harness is not installed here. Nothing to do.');
    return;
  }

  // 경고
  console.log('This will remove:');
  console.log(`  - .claude/ (${exists(claudeDir) ? 'present' : 'absent'})`);
  console.log(`  - .context/ (${exists(contextDir) ? 'present' : 'absent'})`);
  console.log('  - Harness block from .gitignore');
  console.log('');

  if (!KEEP_CONTEXT && exists(contextDir)) {
    console.log('Before removing .context/, any files in .context/issue/ will be backed up.');
    console.log('');
  }

  const ok = await confirm('Continue?');
  if (!ok) {
    log('Aborted.');
    return;
  }

  // 1. issue 백업
  let backupPath = null;
  if (!KEEP_CONTEXT) {
    backupPath = backupContextIssue();
  }

  // 2. .claude 제거
  if (exists(claudeDir)) {
    log('Removing .claude/ ...');
    rmRecursive(claudeDir);
  }

  // 3. .context 제거 (옵션)
  if (!KEEP_CONTEXT && exists(contextDir)) {
    log('Removing .context/ ...');
    rmRecursive(contextDir);
  } else if (KEEP_CONTEXT) {
    log('Keeping .context/ (--keep-context)');
  }

  // 4. .gitignore 정리
  log('Cleaning .gitignore ...');
  removeGitignoreBlock();

  console.log('');
  log('Uninstall complete.');

  if (backupPath) {
    console.log('');
    warn(`Issue files backed up to: ${path.relative(CWD, backupPath)}/`);
    warn('Keep or delete manually.');
  }

  console.log('');
  console.log('To reinstall: npx gridge-harness init');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
