/**
 * gridge-harness init
 *
 * Creates .claude/ and .context/ in the current working directory.
 * Interactive config.yml generation.
 *
 * Refs: 98_governance.md § 부록 A
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CWD = process.cwd();
const HARNESS_ROOT = path.join(__dirname, '..');

// CLI 플래그 파싱 (비대화형 모드)
const ARGS = process.argv.slice(2);
const NON_INTERACTIVE = ARGS.includes('--yes') || ARGS.includes('-y') || !process.stdin.isTTY;

function log(msg) {
  console.log(`[gridge-harness init] ${msg}`);
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function copyDir(src, dst) {
  if (!exists(dst)) fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else if (entry.isFile()) {
      if (exists(dstPath)) {
        log(`  skip (exists): ${path.relative(CWD, dstPath)}`);
      } else {
        fs.copyFileSync(srcPath, dstPath);
        log(`  created: ${path.relative(CWD, dstPath)}`);
      }
    }
  }
}

function question(rl, q, defaultValue) {
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${q} [${defaultValue}]: ` : `${q}: `;
    rl.question(prompt, (ans) => {
      resolve(ans.trim() || defaultValue || '');
    });
  });
}

async function askConfig() {
  // 비대화형 모드: 기본값으로 자동 진행
  if (NON_INTERACTIVE) {
    log('Non-interactive mode — using defaults. Edit .context/config.yml afterwards.');
    return {
      product: 'wiring',
      mode: 'A',
      org_id: 'org-default',
      team_id: '',
      project_id: 'proj-' + Date.now(),
      stage: '1',
      harness_version: require('../package.json').version,
    };
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  log('Generating .context/config.yml (interactive)...');
  console.log('');

  const config = {
    product: await question(rl, '제품 (aiops / lucapus / wiring / standalone)', 'wiring'),
    mode: await question(rl, '인프라 모드 (A=매니지드 / B=온프레 / C=고객API)', 'A'),
    org_id: await question(rl, '조직 ID', 'org-default'),
    team_id: await question(rl, '팀 ID (선택)', ''),
    project_id: await question(rl, '프로젝트 ID', 'proj-' + Date.now()),
    stage: await question(rl, 'Stage (0/1/2/3)', '1'),
    harness_version: require('../package.json').version,
  };

  rl.close();
  console.log('');
  return config;
}

function writeConfig(config) {
  const configPath = path.join(CWD, '.context', 'config.yml');
  const lines = [
    '# .context/config.yml — 프로젝트 고정 메타 (git 추적)',
    '# 생성: gridge-harness init',
    `# 생성 시각: ${new Date().toISOString()}`,
    '',
    `product: ${config.product}`,
    `mode: ${config.mode}`,
    `org_id: ${config.org_id}`,
    config.team_id ? `team_id: ${config.team_id}` : '# team_id: (미설정)',
    `project_id: ${config.project_id}`,
    '',
    `stage: ${config.stage}`,
    '',
    'tech_stack:',
    '  backend: [nextjs-14, supabase, typescript]',
    '  frontend: [nextjs-14, tailwind, zustand]',
    '',
    'llm_routing:',
    '  primary: claude-sonnet-4-6',
    '  fallback: gpt-4o',
    '',
    `harness_version: "${config.harness_version}"`,
    '',
  ].join('\n');

  fs.writeFileSync(configPath, lines, 'utf-8');
  log(`  created: ${path.relative(CWD, configPath)}`);
}

function mergeGitignore() {
  // npm이 .gitignore를 .npmignore로 자동 변환하므로 templates/ 에서 읽음
  const templatePath = path.join(HARNESS_ROOT, 'templates', 'gitignore.template');

  if (!exists(templatePath)) {
    log(`  skip .gitignore (template not found: ${templatePath})`);
    return;
  }

  const harnessGitignore = fs.readFileSync(templatePath, 'utf-8');
  const projectGitignore = path.join(CWD, '.gitignore');

  const marker = '# === Gridge AIMSP Harness (auto-generated) ===';

  if (!exists(projectGitignore)) {
    fs.writeFileSync(projectGitignore, marker + '\n' + harnessGitignore);
    log('  created: .gitignore');
    return;
  }

  const current = fs.readFileSync(projectGitignore, 'utf-8');
  if (current.includes(marker)) {
    log('  skip .gitignore (harness block already present)');
    return;
  }

  const merged = current.trimEnd() + '\n\n' + marker + '\n' + harnessGitignore;
  fs.writeFileSync(projectGitignore, merged);
  log('  updated: .gitignore (harness block appended)');
}

async function main() {
  log(`Installing into: ${CWD}`);
  log('');

  // 1. .claude 디렉토리
  const claudeSrc = path.join(HARNESS_ROOT, '.claude');
  const claudeDst = path.join(CWD, '.claude');
  log('Copying .claude/ ...');
  copyDir(claudeSrc, claudeDst);
  log('');

  // 2. .context 디렉토리
  log('Setting up .context/ ...');
  const contextDir = path.join(CWD, '.context');
  if (!exists(contextDir)) {
    fs.mkdirSync(contextDir, { recursive: true });
    fs.mkdirSync(path.join(contextDir, 'rules'), { recursive: true });
    fs.mkdirSync(path.join(contextDir, 'issue'), { recursive: true });
    fs.mkdirSync(path.join(contextDir, 'skills'), { recursive: true });
  }
  log('');

  // 3. config.yml 대화형 생성
  const configPath = path.join(contextDir, 'config.yml');
  if (exists(configPath)) {
    log('  skip config.yml (already exists)');
  } else {
    const config = await askConfig();
    writeConfig(config);
  }
  log('');

  // 4. .gitignore 머지
  log('Merging .gitignore ...');
  mergeGitignore();
  log('');

  // 5. 완료 안내
  log('Installation complete.');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review .context/config.yml');
  console.log('  2. Open Claude Code in this project');
  console.log('  3. Try: "Wiring 칸반에 HITL 필터 추가해줘" (or any task)');
  console.log('  4. The harness will auto-load rules and execute the F chain.');
  console.log('');
  console.log('Docs: https://github.com/gridge-ai/aimsp-harness');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
