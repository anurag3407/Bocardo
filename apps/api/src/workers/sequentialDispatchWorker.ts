import { Job } from 'bullmq';
import { db, findNearestOnlineRider } from '@bocardo/database';
import { OrderStatus } from '@bocardo/shared-types';
import { socketService } from '../services/socket';
import { redisService } from '../services/redis';
import { scheduleDispatchNext, registerDispatchWorker } from '../services/queue';

/**
 * Sequential 1-to-1 Rider Dispatch Engine (BullMQ + Redis durable state).
 *
 * State (rejected rider list, current candidate, offer expiry) is stored in
 * Redis hashes instead of process memory, so dispatch cascades survive API
 * restarts and work correctly across multiple API replicas.
 */

const OFFER_DURATION_SECONDS = 30;
const DISPATCH_RADIUS_METERS = 4000;
const MAX_DISPATCH_ATTEMPTS = 20;
const NO_RIDER_RETRY_DELAY_MS = 15000;

const stateKey = (orderId: string) => `dispatch:state:${orderId}`;

interface DispatchState {
  rejectedRiderIds: string[];
  currentCandidateId: string | null;
  attempt: number;
}

async function loadState(orderId: string): Promise<DispatchState> {
  const raw = await redisService.get(stateKey(orderId));
  if (raw) {
    try {
      return JSON.parse(raw) as DispatchState;
    } catch {
      // corrupted state; reset
    }
  }
  return { rejectedRiderIds: [], currentCandidateId: null, attempt: 0 };
}

async function saveState(orderId: string, state: DispatchState): Promise<void> {
  await redisService.set(stateKey(orderId), JSON.stringify(state), 'EX', 3600);
}

async function clearState(orderId: string): Promise<void> {
  await redisService.del(stateKey(orderId));
}

async function processDispatch(job: Job<{ orderId: string }>): Promise<void> {
  const { orderId, expectCandidateId } = job.data as { orderId: string; expectCandidateId?: string };

  const orderRes = await db.query(
    `SELECT o.id, o.status, o.rider_id, o.delivery_fee_paise,
            r.id as restaurant_id, r.name as restaurant_name, r.address as restaurant_address,
            ST_Y(r.location::geometry) as rest_lat, ST_X(r.location::geometry) as rest_lng,
            o.delivery_address
     FROM orders o
     JOIN restaurants r ON o.restaurant_id = r.id
     WHERE o.id = $1`,
    [orderId]
  );

  if (!orderRes.rowCount) return;
  const order = orderRes.rows[0];

  // Stop dispatching if assigned, delivered, or cancelled
  if (order.rider_id || order.status === OrderStatus.DELIVERED || order.status.startsWith('CANCELLED')) {
    await clearState(orderId);
    return;
  }

  const state = await loadState(orderId);

  // Timeout jobs carry expectCandidateId. If the candidate already responded
  // (state was cleared on accept, or candidate changed), this job is stale.
  if (expectCandidateId) {
    if (state.currentCandidateId !== expectCandidateId) return;
    // Offer expired without response: reject candidate and cascade
    state.rejectedRiderIds.push(expectCandidateId);
    state.currentCandidateId = null;
    console.log(`⌛ Rider ${expectCandidateId} timed out after ${OFFER_DURATION_SECONDS}s for Order ${orderId}. Cascading.`);
  }

  state.attempt += 1;

  if (state.attempt > MAX_DISPATCH_ATTEMPTS) {
    console.warn(`🚨 Dispatch exhausted (${MAX_DISPATCH_ATTEMPTS} attempts) for Order ${orderId}; escalating to ops`);
    socketService.emitToOrderTracking(orderId, 'order:status:update', {
      orderId,
      status: order.status,
      message: 'We are arranging a delivery partner. Thank you for your patience.',
    });
    await clearState(orderId);
    return;
  }

  const candidate = await findNearestOnlineRider(
    Number(order.rest_lat),
    Number(order.rest_lng),
    state.rejectedRiderIds,
    DISPATCH_RADIUS_METERS
  );

  if (!candidate) {
    console.log(`⚠️ No available riders within ${DISPATCH_RADIUS_METERS / 1000}km for Order ${orderId}. Retrying in ${NO_RIDER_RETRY_DELAY_MS / 1000}s.`);
    await saveState(orderId, state);
    await scheduleDispatchNext(orderId, NO_RIDER_RETRY_DELAY_MS);
    return;
  }

  state.currentCandidateId = candidate.id;
  await saveState(orderId, state);

  const expiresAt = Date.now() + OFFER_DURATION_SECONDS * 1000;

  console.log(
    `📡 Dispatching ${OFFER_DURATION_SECONDS}s offer for Order ${orderId} to Rider ${candidate.id} (${candidate.fullName}, ${(candidate.distanceMeters / 1000).toFixed(1)} km)`
  );

  socketService.emitToRider(candidate.id, 'dispatch:offer', {
    orderId,
    restaurantId: order.restaurant_id,
    restaurantName: order.restaurant_name,
    restaurantAddress: order.restaurant_address,
    deliveryAddress: order.delivery_address,
    distanceKm: Number((candidate.distanceMeters / 1000).toFixed(2)),
    payoutPaise: Number(order.delivery_fee_paise),
    expiresInSeconds: OFFER_DURATION_SECONDS,
    expiresAt,
  });

  // Durable timeout: cascade to next rider after the offer window closes.
  // Carries the candidate id so the job no-ops if the rider already responded.
  await scheduleDispatchNext(orderId, OFFER_DURATION_SECONDS * 1000, candidate.id);
}

export const sequentialDispatchWorker = {
  /**
   * Starts (or continues) 1-to-1 sequential dispatch for an order.
   */
  dispatchNextRider: async (orderId: string) => {
    try {
      await scheduleDispatchNext(orderId);
    } catch (error) {
      console.error(`[Sequential Dispatch Enqueue Error] Order ${orderId}:`, error);
    }
  },

  /**
   * Called when a rider accepts or declines an offer. Only the current
   * candidate's response is honored; stale acceptances are ignored.
   */
  handleRiderResponse: async (orderId: string, riderId: string, accepted: boolean) => {
    const state = await loadState(orderId);
    if (state.currentCandidateId !== riderId) return;

    if (accepted) {
      // Atomic assignment: only succeeds if order is still unassigned
      const assigned = await db.query(
        `UPDATE orders
         SET rider_id = $1, status = $2, updated_at = NOW()
         WHERE id = $3 AND rider_id IS NULL
           AND status NOT IN ('DELIVERED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_KITCHEN', 'CANCELLED_BY_SYSTEM')
         RETURNING id`,
        [riderId, OrderStatus.RIDER_ASSIGNED, orderId]
      );

      if (!assigned.rowCount) {
        await clearState(orderId);
        return;
      }

      await db.query(
        `UPDATE rider_profiles SET active_order_id = $1, updated_at = NOW() WHERE user_id = $2 AND active_order_id IS NULL`,
        [orderId, riderId]
      );

      await clearState(orderId);

      socketService.emitToOrderTracking(orderId, 'order:status:update', {
        orderId,
        status: OrderStatus.RIDER_ASSIGNED,
        riderId,
      });

      console.log(`✅ Order ${orderId} assigned to Rider ${riderId}!`);
      return;
    }

    console.log(`❌ Rider ${riderId} rejected Order ${orderId}. Finding next candidate...`);
    state.rejectedRiderIds.push(riderId);
    state.currentCandidateId = null;
    await saveState(orderId, state);
    await scheduleDispatchNext(orderId);
  },
};

/**
 * Registers the durable BullMQ dispatch worker. Called once from server.ts.
 */
export function startDispatchWorker() {
  return registerDispatchWorker(processDispatch);
}
