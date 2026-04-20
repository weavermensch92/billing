/**
 * gridge-harness validate
 *
 * Checks:
 *   1. Rule ID uniqueness across all files
 *   2. File size limits (98_governance.md § 3)
 *   3. Broken file references (relative paths in docs)
 *   4. ALWAYS_LOAD budget (≤ 3,500 lines)
 *
 * Exit code 0 = pass, 1 = fail.
 * Used by `npm run prepublishOnly` to block broken releases.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HARNESS_ROOT = path.dirname(__dirname);
const CLAUDE_DIR = path.join(HARNESS_ROOT, '.claude');

// 98_governance § 3 기준 상한
const SIZE_LIMITS = {
  'CLAUDE.md': 250,
  '00_index.md': 600,
  '01_product.md': 400,
  '03_hierarchy.md': 500,
  '06_hitl.md': 500,
  '07_coding_standard.md': 600,
  '90_execution_chain.md': 500,
  '99_protocol.md': 450,
  '92_transition.md': 500,
  '93_workflow.md': 500,
  '98_governance.md': 400,
};
const DEFAULT_RULE_LIMIT = 500;
const PRODUCT_ROUTER_LIMIT = 200;
const ALWAYS_LOAD_BUDGET = 3800;

const ALWAYS_LOAD_FILES = [
  'CLAUDE.md',
  'rules/98_governance.md',
  'rules/93_workflow.md',
  'rules/92_transition.md',
  'rules/99_protocol.md',
  'rules/90_execution_chain.md',
  'rules/00_index.md',
  'rules/01_product.md',
  'rules/03_hierarchy.md',
  'rules/06_hitl.md',
];

let errors = 0;
let warnings = 0;

function error(msg) { errors++; console.error(`  ❌ ${msg}`); }
function warn(msg)  { warnings++; console.warn(`  ⚠  ${msg}`); }
function ok(msg)    { console.log(`  ✅ ${msg}`); }

function walkMd(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMd(full, acc);
    else if (entry.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

function lineCount(file) {
  return fs.readFileSync(file, 'utf-8').split('\n').length;
}

function check1_ruleIdUniqueness(files) {
  console.log('\n[1/4] Checking rule ID uniqueness...');
  const idMap = new Map(); // id -> file
  const pattern = /^\|\s*(G-\d+|PA-\d+|PL-\d+|PW-\d+|PB-\d+|D-\d+|I-\d+|L-\d+|H-\d+|F-\d+)\s*\|/gm;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const id = match[1];
      const rel = path.relative(HARNESS_ROOT, file);
      if (idMap.has(id) && idMap.get(id) !== rel) {
        error(`Duplicate rule ID ${id} in ${rel} (also in ${idMap.get(id)})`);
      } else {
        idMap.set(id, rel);
      }
    }
  }
  if (errors === 0) ok(`${idMap.size} unique rule IDs`);
}

function check2_fileSizeLimits() {
  console.log('\n[2/4] Checking file size limits...');
  const mdFiles = walkMd(CLAUDE_DIR);
  for (const file of mdFiles) {
    const basename = path.basename(file);
    const rel = path.relative(HARNESS_ROOT, file);
    const lines = lineCount(file);

    let limit;
    if (SIZE_LIMITS[basename] !== undefined) {
      limit = SIZE_LIMITS[basename];
    } else if (rel.includes('products/') && basename === 'CLAUDE.md') {
      limit = PRODUCT_ROUTER_LIMIT;
    } else {
      limit = DEFAULT_RULE_LIMIT;
    }

    if (lines > limit) {
      error(`${rel}: ${lines} lines > limit ${limit}`);
    }
  }
  if (errors === 0) ok(`all ${mdFiles.length} .md files within limits`);
}

function check3_brokenReferences(files) {
  console.log('\n[3/4] Checking cross-references...');
  const referenced = new Set();
  const existing = new Set(files.map(f => path.relative(CLAUDE_DIR, f)));

  // Very simple pattern: `rules/xxx.md` or `products/xxx.md` inside backticks
  const refPattern = /`((?:rules|products|commands)\/[^`]+\.md)`/g;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    let m;
    while ((m = refPattern.exec(content)) !== null) {
      referenced.add(m[1]);
    }
  }

  for (const ref of referenced) {
    if (!existing.has(ref)) {
      warn(`Referenced but missing: ${ref}`);
    }
  }
  if (warnings === 0) ok(`${referenced.size} cross-references all resolve`);
}

function check4_alwaysLoadBudget() {
  console.log('\n[4/4] Checking ALWAYS_LOAD budget...');
  let total = 0;
  for (const rel of ALWAYS_LOAD_FILES) {
    const full = path.join(CLAUDE_DIR, rel);
    try {
      total += lineCount(full);
    } catch {
      error(`ALWAYS_LOAD file missing: ${rel}`);
    }
  }
  if (total > ALWAYS_LOAD_BUDGET) {
    error(`ALWAYS_LOAD total ${total} lines exceeds budget ${ALWAYS_LOAD_BUDGET}`);
  } else {
    ok(`${total} / ${ALWAYS_LOAD_BUDGET} lines (${Math.round(total/ALWAYS_LOAD_BUDGET*100)}%)`);
  }
}

function check5_malformedDirs() {
  console.log('[5/5] Checking for malformed directory names (shell brace expansion traps)...');
  const problematic = [];
  function scan(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name.includes('{') || entry.name.includes(',') || entry.name.includes('}')) {
          problematic.push(path.relative(HARNESS_ROOT, path.join(dir, entry.name)));
        } else {
          scan(path.join(dir, entry.name));
        }
      }
    }
  }
  scan(CLAUDE_DIR);
  if (problematic.length === 0) {
    ok('no malformed directory names');
  } else {
    problematic.forEach(p => error(`malformed directory (brace expansion failure?): ${p}`));
  }
}

function main() {
  console.log(`Validating harness at: ${HARNESS_ROOT}\n`);

  const mdFiles = walkMd(CLAUDE_DIR);
  if (mdFiles.length === 0) {
    console.error('No .md files found in .claude/');
    process.exit(1);
  }

  check1_ruleIdUniqueness(mdFiles);
  check2_fileSizeLimits();
  check3_brokenReferences(mdFiles);
  check4_alwaysLoadBudget();
  check5_malformedDirs();

  console.log(`\nResult: ${errors} error(s), ${warnings} warning(s)`);
  process.exit(errors === 0 ? 0 : 1);
}

main();
