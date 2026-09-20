import { Queue, Worker, Job, ConnectionOptions } from 'bullmq';
import { db } from '@bocardo/database';
import { OrderStatus } from '@bocardo/shared-types';
import { paymentService } from './payment';
import { socketService } from './socket';

/**
 * Durable Job Queue Infrastructure (BullMQ + Redis)
 * Replaces fragile in-memory setTimeout/Map scheduling with persistent,
 * retryable, crash-safe delayed jobs. On server restart, ghost-restaurant
 * refunds and rider dispatch cascades resume automatically.
 */

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

function buildConnection(): ConnectionOptions {
  try {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      password: parsed.password || undefined,
      username: parsed.username || undefined,
      db: parsed.pathname ? Number(parsed.pathname.slice(1)) || 0 : 0,
      maxRetriesPerRequest: null,
    };
  } catch {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
  }
}

const connection = buildConnection();

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000 },
};

export const ORDER_LIFECYCLE_QUEUE = 'order-lifecycle';
export const DISPATCH_QUEUE = 'rider-dispatch';

export const GHOST_CHECK_JOB = 'ghost-restaurant-check';
export const STALE_PAYMENT_SWEEP_JOB = 'stale-payment-sweep';
export const RIDER_ABANDON_SWEEP_JOB = 'rider-abandon-sweep';
export const DISPATCH_NEXT_JOB = 'dispatch-next-rider';

export const orderLifecycleQueue = new Queue(ORDER_LIFECYCLE_QUEUE, {
  connection,
  defaultJobOptions,
});

export const dispatchQueue = new Queue(DISPATCH_QUEUE, {
  connection,
  defaultJobOptions,
});

/** Enqueue the 120-second ghost restaurant check (deduplicated by orderId). */
export async function scheduleGhostRestaurantCheck(orderId: string): Promise<void> {
  await orderLifecycleQueue.add(
    GHOST_CHECK_JOB,
    { orderId },
    { delay: 120 * 1000, jobId: `${GHOST_CHECK_JOB}:${orderId}` }
  );
}

/** Enqueue the next rider dispatch attempt for an order. */
export async function scheduleDispatchNext(
  orderId: string,
  delayMs = 0,
  expectCandidateId?: string
): Promise<void> {
  await dispatchQueue.add(
    DISPATCH_NEXT_JOB,
    { orderId, expectCandidateId },
    { delay: delayMs, jobId: `${DISPATCH_NEXT_JOB}:${orderId}:${Date.now()}` }
  );
}

// ---------------------------------------------------------------------------
// Worker Handlers
// ---------------------------------------------------------------------------

async function handleGhostRestaurantCheck(job: Job<{ orderId: string }>) {
  const { orderId } = job.data;

  const orderRes = await db.query(
    `SELECT o.id, o.restaurant_id, o.status, o.total_amount_paise,
            o.razorpay_payment_id, r.name as restaurant_name
     FROM orders o
     JOIN restaurants r ON o.restaurant_id = r.id
     WHERE o.id = $1`,
    [orderId]
  );

  if (!orderRes.rowCount) return;
  const order = orderRes.rows[0];

  // If still PAID (kitchen has not tapped Accept within 120s), auto-refund & cancel
  if (order.status !== OrderStatus.PAID) return;

  console.log(`⏱️ Ghost restaurant timeout triggered for Order ${orderId}`);

  const updated = await db.query(
    `UPDATE orders
     SET status = $1, cancel_reason = $2, updated_at = NOW()
     WHERE id = $3 AND status = $4
     RETURNING id`,
    [OrderStatus.CANCELLED_BY_SYSTEM, 'Restaurant non-responsive within 120 seconds', orderId, OrderStatus.PAID]
  );

  if (!updated.rowCount) return; // raced with kitchen accept; kitchen won

  if (order.razorpay_payment_id) {
    await paymentService.refundPayment(
      order.razorpay_payment_id,
      Number(order.total_amount_paise),
      { reason: 'Restaurant non-responsive within 120 seconds' }
    );
  }

  await db.query(
    'UPDATE restaurants SET is_accepting_orders = FALSE, updated_at = NOW() WHERE id = $1',
    [order.restaurant_id]
  );

  socketService.emitToOrderTracking(orderId, 'order:status:update', {
    orderId,
    status: OrderStatus.CANCELLED_BY_SYSTEM,
    message: `${order.restaurant_name} is currently unavailable. Your payment has been refunded automatically.`,
  });
}

/**
 * Sweeps PAYMENT_PENDING orders older than 30 minutes whose payment never
 * captured (user closed Razorpay checkout). Marks them CANCELLED_BY_SYSTEM.
 */
async function handleStalePaymentSweep() {
  const res = await db.query(
    `UPDATE orders
     SET status = $1, cancel_reason = 'Payment abandoned or failed at checkout', updated_at = NOW()
     WHERE status = $2 AND created_at < NOW() - INTERVAL '30 minutes'
     RETURNING id`,
    [OrderStatus.CANCELLED_BY_SYSTEM, OrderStatus.PAYMENT_PENDING]
  );
  if (res.rowCount) console.log(`🧹 Swept ${res.rowCount} stale PAYMENT_PENDING orders`);
}

/**
 * Reaps orders stuck in RIDER_ASSIGNED / OUT_FOR_DELIVERY for > 2 hours
 * (rider abandoned). Releases rider and restarts sequential dispatch.
 */
async function handleRiderAbandonSweep() {
  // The pre-update rider must be captured in a CTE: `RETURNING` reports the
  // *new* row, so `RETURNING rider_id` would always come back NULL after
  // `SET rider_id = NULL` and the rider would never be released.
  const stuck = await db.query(
    `WITH stuck AS (
       SELECT id, rider_id
       FROM orders
       WHERE status IN ($2, $3) AND updated_at < NOW() - INTERVAL '2 hours'
       FOR UPDATE
     )
     UPDATE orders o
     SET rider_id = NULL, status = $1, updated_at = NOW()
     FROM stuck
     WHERE o.id = stuck.id
     RETURNING o.id, stuck.rider_id AS rider_id`,
    [OrderStatus.READY_FOR_PICKUP, OrderStatus.RIDER_ASSIGNED, OrderStatus.OUT_FOR_DELIVERY]
  );

  for (const row of stuck.rows) {
    if (row.rider_id) {
      await db.query(
        'UPDATE rider_profiles SET active_order_id = NULL WHERE user_id = $1 AND active_order_id = $2',
        [row.rider_id, row.id]
      );
    }
    socketService.emitToOrderTracking(row.id, 'order:status:update', {
      orderId: row.id,
      status: OrderStatus.READY_FOR_PICKUP,
      message: 'Reassigning a new delivery partner.',
    });
    await scheduleDispatchNext(row.id);
  }

  if (stuck.rowCount) console.log(`♻️ Re-queued ${stuck.rowCount} rider-abandoned orders for dispatch`);
}

const workers: Worker[] = [];

export function startQueueWorkers() {
  const lifecycleWorker = new Worker(
    ORDER_LIFECYCLE_QUEUE,
    async (job) => {
      switch (job.name) {
        case GHOST_CHECK_JOB:
          return handleGhostRestaurantCheck(job);
        case STALE_PAYMENT_SWEEP_JOB:
          return handleStalePaymentSweep();
        case RIDER_ABANDON_SWEEP_JOB:
          return handleRiderAbandonSweep();
        default:
          throw new Error(`Unknown lifecycle job: ${job.name}`);
      }
    },
    { connection, concurrency: 5 }
  );

  lifecycleWorker.on('failed', (job, err) => {
    console.error(`[BullMQ lifecycle job failed] ${job?.name} ${job?.id}:`, err.message);
  });
  workers.push(lifecycleWorker);

  // Repeatable cron-style sweeps (idempotent via stable jobIds)
  void orderLifecycleQueue.add(STALE_PAYMENT_SWEEP_JOB, {}, {
    repeat: { every: 10 * 60 * 1000 },
    jobId: 'repeat:stale-payment-sweep',
  });
  void orderLifecycleQueue.add(RIDER_ABANDON_SWEEP_JOB, {}, {
    repeat: { every: 15 * 60 * 1000 },
    jobId: 'repeat:rider-abandon-sweep',
  });

  console.log('✅ BullMQ order-lifecycle workers started');
  return workers;
}

export function registerDispatchWorker(
  processor: (job: Job<{ orderId: string; expectCandidateId?: string }>) => Promise<void>
) {
  const worker = new Worker(DISPATCH_QUEUE, processor, { connection, concurrency: 10 });
  worker.on('failed', (job, err) => {
    console.error(`[BullMQ dispatch job failed] ${job?.name} ${job?.id}:`, err.message);
  });
  workers.push(worker);
  return worker;
}

export async function stopQueueWorkers() {
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled([orderLifecycleQueue.close(), dispatchQueue.close()]);
}
