import { db, findNearestOnlineRider } from '@bocardo/database';
import { OrderStatus } from '@bocardo/shared-types';
import { socketService } from '../services/socket';

interface ActiveDispatch {
  orderId: string;
  rejectedRiderIds: string[];
  currentCandidateId?: string;
  timeoutHandle?: NodeJS.Timeout;
}

const activeDispatches = new Map<string, ActiveDispatch>();

export const sequentialDispatchWorker = {
  /**
   * Starts or continues 1-to-1 sequential dispatch for an order.
   */
  dispatchNextRider: async (orderId: string) => {
    try {
      const orderRes = await db.query(
        `SELECT o.id, o.status, o.rider_id, o.delivery_fee_paise,
                r.id as restaurant_id, r.name as restaurant_name, r.address as restaurant_address,
                ST_Y(r.location::geometry) as rest_lat, ST_X(r.location::geometry) as rest_lng,
                o.delivery_address,
                ST_Y(o.delivery_location::geometry) as del_lat, ST_X(o.delivery_location::geometry) as del_lng
         FROM orders o
         JOIN restaurants r ON o.restaurant_id = r.id
         WHERE o.id = $1`,
        [orderId]
      );

      if (!orderRes.rowCount || orderRes.rowCount === 0) return;
      const order = orderRes.rows[0];

      // If already assigned or cancelled, stop dispatching
      if (order.rider_id || order.status === OrderStatus.DELIVERED || order.status.startsWith('CANCELLED')) {
        activeDispatches.delete(orderId);
        return;
      }

      let dispatchState = activeDispatches.get(orderId);
      if (!dispatchState) {
        dispatchState = { orderId, rejectedRiderIds: [] };
        activeDispatches.set(orderId, dispatchState);
      }

      // Query single nearest online rider within 4 km via PostGIS
      const candidate = await findNearestOnlineRider(
        order.rest_lat,
        order.rest_lng,
        dispatchState.rejectedRiderIds,
        4000
      );

      if (!candidate) {
        console.log(`⚠️ No available riders within 4km for Order ${orderId}. Will retry in 15 seconds.`);
        setTimeout(() => sequentialDispatchWorker.dispatchNextRider(orderId), 15000);
        return;
      }

      dispatchState.currentCandidateId = candidate.id;
      const offerDurationSeconds = 30;
      const expiresAt = Date.now() + offerDurationSeconds * 1000;

      console.log(`📡 Dispatching 30s offer for Order ${orderId} to nearest Rider ${candidate.id} (${candidate.fullName}, ${(candidate.distanceMeters / 1000).toFixed(1)} km away)`);

      // Emit 1-to-1 offer to this specific rider
      socketService.emitToRider(candidate.id, 'dispatch:offer', {
        orderId,
        restaurantId: order.restaurant_id,
        restaurantName: order.restaurant_name,
        restaurantAddress: order.restaurant_address,
        deliveryAddress: order.delivery_address,
        distanceKm: Number((candidate.distanceMeters / 1000).toFixed(2)),
        payoutPaise: Number(order.delivery_fee_paise), // e.g. ₹40 payout
        expiresInSeconds: offerDurationSeconds,
        expiresAt,
      });

      // Strict 30-second ticking timeout
      if (dispatchState.timeoutHandle) clearTimeout(dispatchState.timeoutHandle);
      dispatchState.timeoutHandle = setTimeout(() => {
        console.log(`⌛ Rider ${candidate.id} timed out after 30s for Order ${orderId}. Cascading to next nearest rider.`);
        dispatchState?.rejectedRiderIds.push(candidate.id);
        sequentialDispatchWorker.dispatchNextRider(orderId);
      }, offerDurationSeconds * 1000);

    } catch (error) {
      console.error(`[Sequential Dispatch Error] Order ${orderId}:`, error);
    }
  },

  /**
   * Called when a rider accepts or declines an offer.
   */
  handleRiderResponse: async (orderId: string, riderId: string, accepted: boolean) => {
    const dispatchState = activeDispatches.get(orderId);
    if (!dispatchState || dispatchState.currentCandidateId !== riderId) return;

    if (dispatchState.timeoutHandle) clearTimeout(dispatchState.timeoutHandle);

    if (accepted) {
      // Assign rider to order and lock
      await db.query(
        `UPDATE orders 
         SET rider_id = $1, status = $2, updated_at = NOW() 
         WHERE id = $3`,
        [riderId, OrderStatus.RIDER_ASSIGNED, orderId]
      );

      await db.query(
        `UPDATE rider_profiles 
         SET active_order_id = $1 
         WHERE user_id = $2`,
        [orderId, riderId]
      );

      activeDispatches.delete(orderId);

      socketService.emitToOrderTracking(orderId, 'order:status:update', {
        orderId,
        status: OrderStatus.RIDER_ASSIGNED,
        riderId,
      });

      console.log(`✅ Order ${orderId} assigned to Rider ${riderId}!`);
    } else {
      console.log(`❌ Rider ${riderId} rejected Order ${orderId}. Finding next candidate...`);
      dispatchState.rejectedRiderIds.push(riderId);
      await sequentialDispatchWorker.dispatchNextRider(orderId);
    }
  },
};
