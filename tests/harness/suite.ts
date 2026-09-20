import assert from 'node:assert/strict';

const suiteCleanups: Array<() => Promise<void> | void> = [];
let cleanupConsumed = false;

/**
 * Registers a teardown that runs after a suite body finishes. Integration
 * harnesses use this to close BullMQ/Redis handles so the process can exit.
 */
export function onSuiteCleanup(fn: () => Promise<void> | void): void {
  if (cleanupConsumed) {
    throw new Error('onSuiteCleanup() called after the suite already tore down');
  }
  suiteCleanups.push(fn);
}

async function runCleanups(): Promise<Array<{ error: unknown }>> {
  cleanupConsumed = true;
  const settled = await Promise.allSettled(suiteCleanups.map((cleanup) => cleanup()));
  suiteCleanups.length = 0;
  return settled
    .filter((s): s is PromiseRejectedResult => s.status === 'rejected')
    .map((s) => ({ error: s.reason }));
}

function formatStack(error: unknown): string {
  if (error instanceof Error && error.stack) {
    // First line is the message (already printed); show the stack trace below.
    const lines = error.stack.split('\n');
    return lines.slice(0, 8).join('\n');
  }
  return String(error);
}

/** Default per-test timeout (ms). Override with SUITE_TEST_TIMEOUT_MS. */
function testTimeoutMs(): number {
  const raw = process.env.SUITE_TEST_TIMEOUT_MS ?? '15000';
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
}

function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timed out after ${ms}ms (no resolve/reject). Check for hanging awaits, open handles, or missing mocks.`));
    }, ms);
    // Never keep the process alive just for the watchdog.
    (timer as unknown as { unref?: () => void }).unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * Tiny dependency-free test suite used across the `tests/` folder.
 * The repository intentionally ships no test runner (see root package.json),
 * so assertions are plain Node `assert` and results are collected here so a
 * single test file exits non-zero when anything fails.
 */
export class Suite {
  private passed = 0;
  private failed = 0;
  private readonly failures: Array<{ name: string; error: unknown; durationMs: number }> = [];
  private readonly startedAt = Date.now();

  constructor(private readonly title: string) {
    console.log(`\n=== ${title} ===`);
  }

  async test(name: string, fn: () => void | Promise<void>): Promise<void> {
    const started = Date.now();
    const timeoutMs = testTimeoutMs();
    try {
      await withTimeout(Promise.resolve().then(fn), timeoutMs, name);
      this.passed += 1;
      console.log(`  ✅ ${name} (${Date.now() - started}ms)`);
    } catch (error) {
      this.failed += 1;
      this.failures.push({ name, error, durationMs: Date.now() - started });
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ ${name} (${Date.now() - started}ms)\n     ${message.split('\n').join('\n     ')}`);
      console.error(`     stack:\n     ${formatStack(error).split('\n').join('\n     ')}`);
      if (error && typeof error === 'object' && 'expected' in (error as Record<string, unknown>)) {
        const details = error as { expected?: unknown; actual?: unknown; operator?: unknown };
        try {
          console.error(
            `     expected: ${JSON.stringify(details.expected)}\n     actual:   ${JSON.stringify(details.actual)}\n     operator: ${String(details.operator ?? '')}`
          );
        } catch {
          // JSON.stringify can throw on circular values; message above is enough.
        }
      }
    }
  }

  /** Prints a summary and returns the number of failed assertions. */
  finish(): number {
    const elapsed = Date.now() - this.startedAt;
    console.log(`\n${this.title}: ${this.passed} passed, ${this.failed} failed (${elapsed}ms)`);
    if (this.failed > 0) {
      for (const failure of this.failures) {
        const message = failure.error instanceof Error ? failure.error.message : String(failure.error);
        console.error(`  ✗ ${failure.name} [${failure.durationMs}ms]: ${message.split('\n')[0]}`);
      }
    }
    return this.failed;
  }
}

/** Runs an async suite body, tears handles down, and sets a non-zero exit code on failure. */
export function runSuite(suite: Suite, body: () => Promise<void>): void {
  body()
    .then(async () => {
      const cleanupErrors = await runCleanups();
      for (const { error } of cleanupErrors) {
        console.error(`❌ suite cleanup failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      }
      const failed = suite.finish();
      if (failed > 0 || cleanupErrors.length > 0) process.exitCode = 1;
      else if (failed === 0 && suitePassed(suite) === 0) {
        console.error('❌ suite ran zero tests — a file with no assertions passes silently; add at least one test.');
        process.exitCode = 1;
      }
    })
    .catch(async (error) => {
      console.error(error instanceof Error && error.stack ? error.stack : error);
      const cleanupErrors = await runCleanups();
      for (const { error: cleanupError } of cleanupErrors) {
        console.error(`❌ suite cleanup failed: ${cleanupError instanceof Error ? cleanupError.stack ?? cleanupError.message : String(cleanupError)}`);
      }
      try {
        suite.finish();
      } catch {
        // finish() only logs; ignore secondary errors so the original is visible.
      }
      process.exitCode = 1;
    });
}

function suitePassed(suite: Suite): number {
  return (suite as unknown as { passed?: number }).passed ?? 1;
}

/** Asserts that an async operation rejects with the given tRPC error code. */
export async function expectTrpcError(
  operation: () => Promise<unknown>,
  code: string,
  message?: string
): Promise<Error & { code?: string }> {
  let result: unknown;
  try {
    result = await operation();
  } catch (error) {
    const trpcError = error as Error & { code?: string };
    assert.equal(
      trpcError.code,
      code,
      `Expected tRPC error code "${code}" but received "${trpcError.code ?? trpcError.message}"${message ? ` (${message})` : ''}`
    );
    return trpcError;
  }
  throw new assert.AssertionError({
    message: `Expected tRPC error "${code}" but the call succeeded with ${JSON.stringify(result)}`,
  });
}
