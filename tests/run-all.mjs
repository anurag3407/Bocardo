#!/usr/bin/env node
/**
 * Dependency-free test runner for the Bocardo monorepo.
 *
 * Every `*.test.ts` under `tests/` is executed in its own `tsx` child process
 * (module state, timers and module doubles stay isolated per file). The two
 * legacy in-source tests are included so `pnpm test` runs the complete suite.
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const testsDir = fileURLToPath(new URL('.', import.meta.url));
const rootDir = join(testsDir, '..');

const extraTests = [
  'apps/api/src/services/razorpayRoute.test.ts',
  'apps/hotel/src/services/printer.test.ts',
];

function collectTestFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectTestFiles(full));
    } else if (entry.endsWith('.test.ts')) {
      found.push(relative(rootDir, full));
    }
  }
  return found;
}

const tsxCandidates = [
  join(rootDir, 'apps/api/node_modules/.bin/tsx'),
  join(rootDir, 'apps/api/node_modules/.bin/tsx.cmd'),
];
const tsx = tsxCandidates.find((candidate) => existsSync(candidate));
if (!tsx) {
  console.error('❌ Could not locate the `tsx` binary. Run `pnpm install` first.');
  process.exit(1);
}

const files = [...new Set([...collectTestFiles(testsDir), ...extraTests])].sort();

const env = {
  ...process.env,
  NODE_ENV: 'development',
  ALLOW_MOCK_AUTH: 'true',
  ALLOW_MOCK_PAYMENTS: 'true',
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_key_id',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'mock_razorpay_secret',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || 'mock_webhook_secret',
  // Deliberately unreachable so the Redis service exercises its dev fallback.
  REDIS_URL: process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6399',
};

console.log(`\n🧪 Bocardo test runner — ${files.length} files (NODE_ENV=${env.NODE_ENV})\n${'─'.repeat(60)}`);

const failures = [];
const startedAll = Date.now();
/** Per-file wall-clock budget (ms). Override with TEST_FILE_TIMEOUT_MS. */
const fileTimeoutMs = Number(process.env.TEST_FILE_TIMEOUT_MS ?? '120000') || 120000;
for (const file of files) {
  const display = file.split(sep).join('/');
  console.log(`\n▶ ${display}`);
  const started = Date.now();
  const result = spawnSync(tsx, [display], { cwd: rootDir, env, stdio: 'inherit', timeout: fileTimeoutMs });
  const elapsed = Date.now() - started;
  if (result.error) {
    // Includes ETIMEDOUT when a file hangs — the loudest flake signal.
    failures.push({ file: display, reason: result.error.message });
    console.error(`   ✘ ${display} failed after ${elapsed}ms: ${result.error.message}`);
  } else if (result.status !== 0) {
    failures.push({ file: display, reason: `exit code ${result.status}` });
    console.error(`   ✘ ${display} failed after ${elapsed}ms (exit code ${result.status})`);
  } else {
    console.log(`   ✔ ${display} passed (${elapsed}ms)`);
  }
}

console.log(`\n${'─'.repeat(60)}\nTotal wall time: ${Date.now() - startedAll}ms`);
if (failures.length === 0) {
  console.log(`✅ All ${files.length} test files passed.`);
  process.exit(0);
}

console.error(`❌ ${failures.length}/${files.length} test files failed:`);
for (const failure of failures) console.error(`   • ${failure.file} (${failure.reason})`);
process.exit(1);
