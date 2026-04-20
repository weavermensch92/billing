/**
 * gridge-harness test
 *
 * Smoke test: verifies harness functions end-to-end.
 * - Runs validate.js
 * - Simulates init in a temp directory
 * - Checks that all required files get copied
 *
 * Exit code 0 = pass, 1 = fail.
 * Intended for CI / local sanity check before releases.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const HARNESS_ROOT = path.dirname(__dirname);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

function section(title) {
  console.log('');
  console.log(`━━━ ${title} ━━━`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gridge-harness-test-'));
}

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

function main() {
  console.log('Gridge AIMSP Harness — smoke test');

  // === 1. validate.js ===
  section('1. validate.js');

  test('validate exits 0', () => {
    const output = execSync(`node ${path.join(HARNESS_ROOT, 'scripts', 'validate.js')}`, {
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    assert(output.includes('0 error(s)'), 'validate should report 0 errors');
  });

  // === 2. Package structure ===
  section('2. Package structure');

  test('package.json exists and has required fields', () => {
    const pkg = require(path.join(HARNESS_ROOT, 'package.json'));
    assert(pkg.name === '@gridge-ai/aimsp-harness');
    assert(pkg.bin && pkg.bin['gridge-harness']);
    assert(pkg.files && pkg.files.length >= 4);
  });

  test('LICENSE exists', () => {
    assert(exists(path.join(HARNESS_ROOT, 'LICENSE')));
  });

  test('README.md exists', () => {
    assert(exists(path.join(HARNESS_ROOT, 'README.md')));
  });

  test('templates/gitignore.template exists', () => {
    assert(exists(path.join(HARNESS_ROOT, 'templates', 'gitignore.template')));
  });

  test('.claude/CLAUDE.md exists', () => {
    assert(exists(path.join(HARNESS_ROOT, '.claude', 'CLAUDE.md')));
  });

  test('All ALWAYS_LOAD rules files exist', () => {
    const required = [
      'rules/00_index.md', 'rules/01_product.md', 'rules/03_hierarchy.md',
      'rules/06_hitl.md',
      'rules/90_execution_chain.md', 'rules/99_protocol.md',
      'rules/92_transition.md', 'rules/93_workflow.md', 'rules/98_governance.md',
    ];
    for (const rel of required) {
      assert(exists(path.join(HARNESS_ROOT, '.claude', rel)), `missing: ${rel}`);
    }
  });

  test('All 3 product routers exist', () => {
    const products = ['aiops', 'lucapus', 'wiring'];
    for (const p of products) {
      assert(
        exists(path.join(HARNESS_ROOT, '.claude', 'products', p, 'CLAUDE.md')),
        `missing: products/${p}/CLAUDE.md`,
      );
    }
  });

  // === 3. Scripts ===
  section('3. Scripts');

  test('All required scripts exist', () => {
    const required = ['cli.js', 'init.js', 'validate.js', 'add.js', 'upgrade.js', 'status.js'];
    for (const f of required) {
      assert(exists(path.join(HARNESS_ROOT, 'scripts', f)), `missing: ${f}`);
    }
  });

  test('cli.js is executable', () => {
    const cliContent = fs.readFileSync(path.join(HARNESS_ROOT, 'scripts', 'cli.js'), 'utf-8');
    assert(cliContent.startsWith('#!/usr/bin/env node'), 'cli.js must have shebang');
  });

  // === 4. Simulated install ===
  section('4. Simulated install (temp dir)');

  const tempDir = mkTempDir();
  let originalCwd = process.cwd();

  try {
    // package.json 생성
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test-consumer', version: '0.0.1', private: true }),
    );

    process.chdir(tempDir);

    test('init --yes creates .claude/', () => {
      execSync(
        `node ${path.join(HARNESS_ROOT, 'scripts', 'init.js')} --yes`,
        { stdio: 'pipe', encoding: 'utf-8' },
      );
      assert(exists(path.join(tempDir, '.claude', 'CLAUDE.md')));
    });

    test('init --yes creates .context/config.yml', () => {
      assert(exists(path.join(tempDir, '.context', 'config.yml')));
    });

    test('init --yes creates .gitignore with harness block', () => {
      const content = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf-8');
      assert(content.includes('Gridge AIMSP Harness'));
    });

    test('init is idempotent (second run skips existing)', () => {
      const output = execSync(
        `node ${path.join(HARNESS_ROOT, 'scripts', 'init.js')} --yes`,
        { stdio: 'pipe', encoding: 'utf-8' },
      );
      assert(output.includes('skip') || output.includes('already'),
             'second run should skip existing files');
    });

    test('status.js runs without error', () => {
      const output = execSync(
        `node ${path.join(HARNESS_ROOT, 'scripts', 'status.js')}`,
        { stdio: 'pipe', encoding: 'utf-8' },
      );
      assert(output.includes('product'));
      assert(output.includes('mode'));
    });

  } finally {
    process.chdir(originalCwd);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }

  // === 최종 결과 ===
  console.log('');
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━`);

  process.exit(failed === 0 ? 0 : 1);
}

main();
