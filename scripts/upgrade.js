/**
 * gridge-harness upgrade
 *
 * Upgrades the harness to the version installed in node_modules.
 * - Shows diffs for locally modified files (preserved by default).
 * - Auto-adds new files introduced in the new version.
 * - Records upgrade in audit trail (future: .context/audit/).
 *
 * Refs: 93_workflow.md § 9, 98_governance.md § 10 (version history)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CWD = process.cwd();
const HARNESS_ROOT = path.join(__dirname, '..');

const ARGS = process.argv.slice(2);
const FORCE = ARGS.includes('--force');       // overwrite local modifications
const PREVIEW = ARGS.includes('--preview') || ARGS.includes('--dry-run');

const stats = {
  newFiles: 0,
  modifiedUpstream: 0,  // 새 버전에서 변경됨 + 로컬 미수정
  localModified: 0,      // 로컬에서 수정됨 (충돌)
  unchanged: 0,
};

function log(msg)  { console.log(`[gridge-harness upgrade] ${msg}`); }
function warn(msg) { console.warn(`[gridge-harness upgrade] ⚠  ${msg}`); }

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}

function getPackageVersion() {
  try {
    return require(path.join(HARNESS_ROOT, 'package.json')).version;
  } catch { return 'unknown'; }
}

function getCurrentHarnessVersion() {
  // .context/config.yml 에서 harness_version 읽기
  const configPath = path.join(CWD, '.context', 'config.yml');
  const content = readSafe(configPath);
  if (!content) return null;
  const m = content.match(/^harness_version:\s*['"]?([^'"\n]+)['"]?/m);
  return m ? m[1] : null;
}

/**
 * 업그레이드 가능한 파일 분류:
 * - NEW: 로컬에 없음 → 자동 추가
 * - MODIFIED_UPSTREAM: 로컬에 있지만 동일 (구버전 그대로) → 자동 업데이트
 * - LOCAL_MODIFIED: 로컬이 수정됨 (보존, 사용자 결정 필요)
 * - UNCHANGED: 동일
 */
function classifyFile(srcPath, dstPath) {
  if (!exists(dstPath)) return 'NEW';

  const srcContent = readSafe(srcPath);
  const dstContent = readSafe(dstPath);

  if (srcContent === dstContent) return 'UNCHANGED';

  // 로컬에 없고 업스트림에서 변경? 구버전 비교가 없으므로 보수적:
  // 로컬과 다르면 → LOCAL_MODIFIED 로 간주 (사용자 결정)
  // 단, 간단한 heuristic: 로컬 내용이 "이 파일은 <업스트림 포맷> 으로 생성됨" 같은 마커 없음 = 수정됨
  return 'LOCAL_MODIFIED';
}

function upgradeFile(srcPath, dstPath) {
  const rel = path.relative(CWD, dstPath);
  const verdict = classifyFile(srcPath, dstPath);

  switch (verdict) {
    case 'NEW':
      if (!PREVIEW) {
        fs.mkdirSync(path.dirname(dstPath), { recursive: true });
        fs.copyFileSync(srcPath, dstPath);
      }
      log(`  + ${rel} (new)`);
      stats.newFiles++;
      break;

    case 'UNCHANGED':
      stats.unchanged++;
      break;

    case 'LOCAL_MODIFIED':
      if (FORCE) {
        if (!PREVIEW) fs.copyFileSync(srcPath, dstPath);
        warn(`  ~ ${rel} (LOCAL CHANGES OVERWRITTEN by --force)`);
        stats.modifiedUpstream++;
      } else {
        warn(`  ! ${rel} (locally modified — preserved)`);
        stats.localModified++;
      }
      break;
  }
}

function walk(srcDir, dstDir) {
  if (!exists(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(dstDir, entry.name);
    if (entry.isDirectory()) walk(s, d);
    else if (entry.isFile()) upgradeFile(s, d);
  }
}

function updateConfigVersion(newVersion) {
  const configPath = path.join(CWD, '.context', 'config.yml');
  if (!exists(configPath)) return;

  let content = fs.readFileSync(configPath, 'utf-8');

  if (/^harness_version:/m.test(content)) {
    content = content.replace(
      /^harness_version:\s*['"]?[^'"\n]+['"]?/m,
      `harness_version: "${newVersion}"`,
    );
  } else {
    content = content.trimEnd() + `\nharness_version: "${newVersion}"\n`;
  }

  if (!PREVIEW) fs.writeFileSync(configPath, content);
}

function main() {
  const fromVersion = getCurrentHarnessVersion() || '(unknown)';
  const toVersion = getPackageVersion();

  log(`Upgrading harness: ${fromVersion} → ${toVersion}`);
  if (PREVIEW) log('(preview: no changes will be made)');
  log('');

  if (fromVersion === toVersion && !FORCE) {
    log('Already up to date. Use --force to re-install anyway.');
    return;
  }

  log('Comparing files...');
  walk(
    path.join(HARNESS_ROOT, '.claude'),
    path.join(CWD, '.claude'),
  );
  log('');

  // 요약
  log(`Summary:`);
  log(`  New files:         ${stats.newFiles}`);
  log(`  Unchanged:         ${stats.unchanged}`);
  log(`  Locally modified:  ${stats.localModified}  (preserved)`);
  if (stats.modifiedUpstream > 0) {
    log(`  Overwritten:       ${stats.modifiedUpstream}`);
  }
  console.log('');

  if (stats.localModified > 0 && !FORCE) {
    warn('Some files have local modifications (preserved).');
    console.log('To overwrite them with the new version, run:');
    console.log('  npx gridge-harness upgrade --force');
    console.log('');
    console.log('To preview changes without applying:');
    console.log('  npx gridge-harness upgrade --preview');
  }

  if (!PREVIEW) {
    updateConfigVersion(toVersion);
    log(`Updated .context/config.yml: harness_version = "${toVersion}"`);
  }

  // Breaking change 안내 (98_governance § 10 참조)
  if (shouldShowBreakingChangeNotice(fromVersion, toVersion)) {
    console.log('');
    warn('Major version change detected. Review the migration guide:');
    console.log('  .claude/rules/98_governance.md § 10 변경 이력');
  }
}

function shouldShowBreakingChangeNotice(from, to) {
  if (from === '(unknown)') return false;
  const major = (v) => parseInt((v || '0.0.0').split('.')[0], 10);
  return major(to) > major(from);
}

main();
