import { pool } from '../../apps/api/node_modules/@bocardo/database';
import { Queue } from '../../apps/api/node_modules/bullmq';
import { onSuiteCleanup } from './suite';

export interface QueryResultLike {
  rows: any[];
  rowCount: number;
  command?: string;
  oid?: number;
  fields?: any[];
}

export type SqlHandler = (params: any[], sql: string) => QueryResultLike | Promise<QueryResultLike>;

interface Route {
  pattern: RegExp;
  handler: SqlHandler;
}

function result(rows: any[], rowCount = rows.length): QueryResultLike {
  return { rows, rowCount };
}

/**
 * Deterministic in-memory stand-in for the `pg` connection pool.
 *
 * The production code resolves `@bocardo/database` to the same built module
 * instance as this harness (Node caches modules by real path), so replacing
 * `pool.query` / `pool.connect` transparently intercepts every query made by
 * the tRPC routers, context and workers.
 */
export class MockDb {
  private readonly routes: Route[] = [];
  readonly log: Array<{ sql: string; params: any[] }> = [];
  readonly unhandled: Array<{ sql: string; params: any[] }> = [];
  /** When true, queries with no matching route throw instead of returning []. */
  strict = false;

  /** Registers a SQL matcher. First matching route wins. */
  on(pattern: RegExp, handler: SqlHandler): this {
    this.routes.push({ pattern, handler });
    return this;
  }

  /** Convenience: respond with a fixed set of rows. */
  rows(pattern: RegExp, rows: any[]): this {
    return this.on(pattern, () => result(rows));
  }

  /** Convenience: respond with a fixed affected-row count. */
  affected(pattern: RegExp, count = 1): this {
    return this.on(pattern, () => result([], count));
  }

  /** Calls made against this fake, optionally filtered by SQL pattern. */
  calls(pattern?: RegExp): Array<{ sql: string; params: any[] }> {
    return pattern ? this.log.filter((entry) => pattern.test(entry.sql)) : [...this.log];
  }

  clearLog(): void {
    this.log.length = 0;
  }

  async query(sql: string, params: any[] = []): Promise<QueryResultLike> {
    this.log.push({ sql, params });
    for (const route of this.routes) {
      if (route.pattern.test(sql)) return route.handler(params, sql);
    }
    this.unhandled.push({ sql, params });
    if (this.strict) {
      throw new Error(
        `MockDb: no route matched query (strict mode). SQL: ${sql.slice(0, 300)} params: ${JSON.stringify(params).slice(0, 300)}`
      );
    }
    return result([]);
  }

  /** Fails loudly if any query fell through without a matching route. */
  assertNoUnhandledQueries(context = 'MockDb'): void {
    if (this.unhandled.length > 0) {
      const first = this.unhandled[0];
      throw new Error(
        `${context}: ${this.unhandled.length} unhandled querie(s); first: ${first.sql.slice(0, 300)} params: ${JSON.stringify(first.params).slice(0, 200)}`
      );
    }
  }

  /** Clears both the call log and the unhandled-query record. */
  reset(): void {
    this.log.length = 0;
    this.unhandled.length = 0;
  }

  /** Installs this fake onto the shared pg pool. Returns `this` for chaining. */
  install(): this {
    (pool as any).query = (text: string, params?: any[]) => this.query(text, params);
    (pool as any).connect = async () => ({
      query: (text: string, params?: any[]) => this.query(text, params),
      release: () => {},
    });
    return this;
  }
}

let cleanupRegistered = false;

/**
 * Closes BullMQ queue connections opened as a side effect of importing the
 * routers. Without this the ioredis sockets keep the Node event loop alive.
 */
export async function closePlatformResources(): Promise<void> {
  try {
    const queueModule = await import('../../apps/api/src/services/queue');
    await Promise.allSettled([
      queueModule.stopQueueWorkers(),
      queueModule.orderLifecycleQueue.close(),
      queueModule.dispatchQueue.close(),
    ]);
  } catch {
    // Queue module never loaded; nothing to close.
  }
  try {
    const { redisService } = await import('../../apps/api/src/services/redis');
    await redisService.shutdown();
  } catch {
    // Redis module never loaded; nothing to close.
  }
}

/** Jobs captured from the stubbed BullMQ queues, in call order. */
export const enqueuedJobs: Array<{ name: string; data: any; options: any }> = [];

let bullQueuePatched = false;

/**
 * BullMQ `Queue.add` performs network I/O against Redis. Tests must never
 * depend on a live Redis, so the prototype method is replaced with an
 * immediate no-op before any enqueue can happen.
 */
export function silenceBullQueues(): void {
  if (bullQueuePatched) return;
  (Queue.prototype as any).add = async (name: string, data: any, options: any) => {
    enqueuedJobs.push({ name, data, options });
    return { id: 'test-job' };
  };
  (Queue.prototype as any).addBulk = async () => [];
  bullQueuePatched = true;
}

/** Clears jobs captured by the stubbed BullMQ queues (call between tests). */
export function resetEnqueuedJobs(): void {
  enqueuedJobs.length = 0;
}

/** Installs all test doubles needed by router/worker integration tests. */
export function installPlatformDoubles(): MockDb {
  silenceBullQueues();
  if (!cleanupRegistered) {
    cleanupRegistered = true;
    onSuiteCleanup(closePlatformResources);
  }
  return new MockDb().install();
}

export interface JobLike<T = any> {
  name: string;
  data: T;
  id: string;
  opts: Record<string, unknown>;
  attemptsMade: number;
}

/** Builds a minimal BullMQ `Job` stand-in for a registered processor. */
export function fakeJob<T = any>(name: string, data: T, id = `test:${name}`): JobLike<T> {
  return { name, data, id, opts: {}, attemptsMade: 0 };
}

/**
 * Returns the real BullMQ processor registered for a queue.
 * `startQueueWorkers()` and `registerDispatchWorker()` return the live
 * `Worker` instances and BullMQ stores the caller-supplied callback on
 * `worker.processFn`, so job bodies can be executed directly with a fake `Job`
 * instead of waiting for Redis to deliver one.
 */
export function getJobProcessor<T = any>(
  workers: Array<{ name: string }>,
  queueName: string
): (job: JobLike<T>) => Promise<any> {
  const worker = workers.find((candidate) => candidate.name === queueName);
  if (!worker) throw new Error(`No BullMQ worker registered for queue "${queueName}"`);
  const processor = (worker as { processFn?: unknown }).processFn;
  if (typeof processor !== 'function') {
    throw new Error(`Worker for queue "${queueName}" exposes no processFn`);
  }
  return processor as (job: JobLike<T>) => Promise<any>;
}

export const mockHelpers = { result };
