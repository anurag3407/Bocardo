import { db } from '@bocardo/database';
import { OrderStatus } from '@bocardo/shared-types';
import { paymentService } from '../services/payment';
import { socketService } from '../services/socket';

export const ghostRestaurantWorker = {
  /**
   * Evaluates order status after 120 seconds.
   * If the restaurant has failed to accept the order, cancels and issues an instant refund.
   */
  processOrderTimeout: async (orderId: string) => {
    try {
      const orderRes = await db.query(
        `SELECT o.id, o.restaurant_id, o.customer_id, o.status, o.total_amount_paise, 
                o.razorpay_payment_id, r.name as restaurant_name
         FROM orders o
         JOIN restaurants r ON o.restaurant_id = r.id
         WHERE o.id = $1`,
        [orderId]
      );

      if (!orderRes.rowCount || orderRes.rowCount === 0) return;
      const order = orderRes.rows[0];

      // If still PAID (kitchen has not tapped Accept), auto-refund & cancel
      if (order.status === OrderStatus.PAID) {
        console.log(`⏱️ Ghost restaurant timeout triggered for Order ${orderId}`);

        // 1. Mark order as CANCELLED_BY_SYSTEM
        await db.query(
          `UPDATE orders 
           SET status = $1, cancel_reason = $2, updated_at = NOW() 
           WHERE id = $3`,
          [
            OrderStatus.CANCELLED_BY_SYSTEM,
            'Restaurant non-responsive within 120 seconds',
            orderId,
          ]
        );

        // 2. Invoke Razorpay Instant Refund
        if (order.razorpay_payment_id) {
          await paymentService.refundPayment(
            order.razorpay_payment_id,
            Number(order.total_amount_paise),
            { reason: 'Restaurant non-responsive within 120 seconds' }
          );
        }

        // 3. Mark restaurant offline to avoid further customer disappointment
        await db.query(
          `UPDATE restaurants SET is_accepting_orders = FALSE WHERE id = $1`,
          [order.restaurant_id]
        );

        // 4. Push real-time notification to customer
        socketService.emitToOrderTracking(orderId, 'order:status:update', {
          orderId,
          status: OrderStatus.CANCELLED_BY_SYSTEM,
          message: `${order.restaurant_name} is currently unavailable. Your payment has been refunded automatically.`,
        });
      }
    } catch (error) {
      console.error(`[Ghost Restaurant Worker Error] Order ${orderId}:`, error);
    }
  },

  /**
   * Schedules a 120-second delayed check.
   */
  scheduleCheck: (orderId: string) => {
    setTimeout(() => {
      ghostRestaurantWorker.processOrderTimeout(orderId);
    }, 120 * 1000);
  },
};
