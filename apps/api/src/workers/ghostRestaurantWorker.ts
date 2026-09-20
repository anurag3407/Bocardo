import { scheduleGhostRestaurantCheck } from '../services/queue';

/**
 * Ghost Restaurant Safeguard (BullMQ-backed).
 * The actual 120-second evaluation lives in the durable order-lifecycle
 * queue worker (services/queue.ts) so it survives API server restarts.
 */
export const ghostRestaurantWorker = {
  /**
   * Schedules a durable 120-second delayed check.
   */
  scheduleCheck: (orderId: string) => {
    scheduleGhostRestaurantCheck(orderId).catch((err) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Ghost Restaurant] Redis unavailable; durable check not scheduled:', err.message);
        return;
      }
      console.error('[Ghost Restaurant] Failed to schedule durable check:', err);
    });
  },
};
