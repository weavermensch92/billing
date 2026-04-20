/**
 * gridge-harness add
 *
 * Adds harness to an existing project. Preserves local modifications.
 * Unlike `init`, this is non-destructive: conflicts are reported, not overwritten.
 *
 * Refs: 98_governance.md § 부록 A, 93_workflow.md § 9
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CWD = process.cwd();
const HARNESS_ROOT = path.join(__dirname, '..');

const ARGS = process.argv.slice(2);
const FORCE = ARGS.includes('--force');
const DRY_RUN = ARGS.includes('--dry-run');

const stats = { added: 0, skipped: 0, conflicts: 0 };

function log(msg)  { console.log(`[gridge-harness add] ${msg}`); }
function warn(msg) { console.warn(`[gridge-harness add] ⚠  ${msg}`); }

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function sameContent(a, b) {
  try {
    return fs.readFileSync(a, 'utf-8') === fs.readFileSync(b, 'utf-8');
  } catch { return false; }
}

function addFile(src, dst) {
  const rel = path.relative(CWD, dst);

  if (!exists(dst)) {
    if (DRY_RUN) {
      log(`  would add: ${rel}`);
    } else {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      log(`  added: ${rel}`);
    }
    stats.added++;
    return;
  }

  if (sameContent(src, dst)) {
    log(`  skip (identical): ${rel}`);
    stats.skipped++;
    return;
  }

  // 파일 존재 + 내용 다름 = 로컬 수정 또는 구버전
  if (FORCE) {
    if (!DRY_RUN) fs.copyFileSync(src, dst);
    warn(`  overwritten (--force): ${rel}`);
    stats.added++;
  } else {
    warn(`  CONFLICT: ${rel} (locally modified — use --force to overwrite)`);
    stats.conflicts++;
  }
}

function walkAndAdd(srcDir, dstDir) {
  if (!exists(srcDir)) return;

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);

    if (entry.isDirectory()) {
      walkAndAdd(srcPath, dstPath);
    } else if (entry.isFile()) {
      addFile(srcPath, dstPath);
    }
  }
}

function main() {
  log(`Adding harness to: ${CWD}`);
  if (DRY_RUN) log('(dry-run: no changes will be made)');
  log('');

  // 1. .claude 병합
  log('Merging .claude/ ...');
  walkAndAdd(
    path.join(HARNESS_ROOT, '.claude'),
    path.join(CWD, '.claude'),
  );
  log('');

  // 2. .context 런타임 디렉토리만 보장 (파일은 만들지 않음)
  const contextDir = path.join(CWD, '.context');
  if (!exists(contextDir)) {
    if (!DRY_RUN) {
      fs.mkdirSync(contextDir, { recursive: true });
      fs.mkdirSync(path.join(contextDir, 'issue'), { recursive: true });
      fs.mkdirSync(path.join(contextDir, 'rules'), { recursive: true });
      fs.mkdirSync(path.join(contextDir, 'skills'), { recursive: true });
    }
    log('  created: .context/ (empty runtime dirs)');
  } else {
    log('  skip: .context/ (already exists)');
  }
  log('');

  // 3. .gitignore 병합 (init.js와 동일 로직)
  log('Merging .gitignore ...');
  const templatePath = path.join(HARNESS_ROOT, 'templates', 'gitignore.template');
  const projectGitignore = path.join(CWD, '.gitignore');
  const marker = '# === Gridge AIMSP Harness (auto-generated) ===';

  if (!exists(templatePath)) {
    warn('  skip .gitignore (template not found)');
  } else if (!exists(projectGitignore)) {
    if (!DRY_RUN) {
      const template = fs.readFileSync(templatePath, 'utf-8');
      fs.writeFileSync(projectGitignore, marker + '\n' + template);
    }
    log('  created: .gitignore');
  } else {
    const current = fs.readFileSync(projectGitignore, 'utf-8');
    if (current.includes(marker)) {
      log('  skip .gitignore (harness block already present)');
    } else {
      if (!DRY_RUN) {
        const template = fs.readFileSync(templatePath, 'utf-8');
        fs.writeFileSync(projectGitignore,
          current.trimEnd() + '\n\n' + marker + '\n' + template);
      }
      log('  updated: .gitignore (harness block appended)');
    }
  }

  // 4. 결과 요약
  console.log('');
  log(`Summary: ${stats.added} added, ${stats.skipped} skipped, ${stats.conflicts} conflicts`);

  if (stats.conflicts > 0) {
    console.log('');
    warn(`${stats.conflicts} conflict(s) detected. Options:`);
    console.log('  - Review diffs manually');
    console.log('  - Run with --force to overwrite local changes');
    console.log('  - Run with --dry-run first to preview');
    process.exit(1);
  }

  if (DRY_RUN) {
    log('Dry-run complete. Run without --dry-run to apply.');
  } else {
    log('Add complete.');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Create .context/config.yml if missing (see 98_governance § 부록 A)');
    console.log('  2. Run: npx gridge-harness status');
    console.log('  3. Open Claude Code and start working.');
  }
}

main();
